"""Local, reproducible cell-graph count experiment. JSON stdin/stdout; no network."""
import copy
import hashlib
import json
import math
import sys
import time

import numpy as np
import torch
from torch import nn

VERSION = "equal-area-weekly-gnn-0.1.1"
DAY = 86400000
ROWS, COLS = 6, 12
NODES = ROWS * COLS
FEATURES = ["log1p count 1d", "log1p count 7d", "log1p count 28d",
            "log1p deep count 7d", "log1p deep count 28d", "maximum M excess 28d"]


def cell(lat, lon):
    row = min(ROWS - 1, int((math.sin(math.radians(lat)) + 1) / 2 * ROWS))
    col = int(((lon + 180) % 360) / 360 * COLS)
    return row * COLS + col


def adjacency():
    a = np.zeros((NODES, NODES), dtype=np.float32)
    for r in range(ROWS):
        for c in range(COLS):
            neighbors = [r * COLS + (c - 1) % COLS, r * COLS + (c + 1) % COLS]
            if r > 0:
                neighbors.append((r - 1) * COLS + c)
            if r < ROWS - 1:
                neighbors.append((r + 1) * COLS + c)
            a[r * COLS + c, neighbors] = 1 / len(neighbors)
    return a


def catalog(events, magnitude):
    selected = sorted((e for e in events if e["mag"] >= magnitude and e["type"] == "earthquake"), key=lambda e: e["time"])
    return {
        "time": np.array([e["time"] for e in selected], dtype=np.float64),
        "node": np.array([cell(e["lat"], e["lon"]) for e in selected], dtype=np.int64),
        "mag": np.array([e["mag"] for e in selected], dtype=np.float32),
        "deep": np.array([e["depth"] >= 300 for e in selected], dtype=bool),
    }


def features(cat, cutoff, magnitude):
    # All boundaries use (start, end]; no event after the issue time is a feature.
    lo, hi = np.searchsorted(cat["time"], [cutoff - 28 * DAY, cutoff], side="right")
    nodes, times = cat["node"][lo:hi], cat["time"][lo:hi]
    x = np.zeros((NODES, len(FEATURES)), dtype=np.float32)
    for i, days in enumerate([1, 7, 28]):
        x[:, i] = np.log1p(np.bincount(nodes[times > cutoff - days * DAY], minlength=NODES))
    for i, days in enumerate([7, 28]):
        mask = (times > cutoff - days * DAY) & cat["deep"][lo:hi]
        x[:, i + 3] = np.log1p(np.bincount(nodes[mask], minlength=NODES))
    np.maximum.at(x[:, 5], nodes, cat["mag"][lo:hi] - magnitude)
    return x


def dataset(cat, options):
    xs, ys, cutoffs, splits = [], [], [], []
    for cutoff in range(options["start"] + 28 * DAY, options["end"] - 7 * DAY + 1, 7 * DAY):
        end = cutoff + 7 * DAY
        if end <= options["trainEnd"]:
            split = "train"
        elif cutoff >= options["trainEnd"] and end <= options["validationEnd"]:
            split = "validation"
        elif cutoff >= options["validationEnd"]:
            split = "test"
        else:
            continue  # Purge target windows that straddle a split boundary.
        lo, hi = np.searchsorted(cat["time"], [cutoff, end], side="right")
        xs.append(features(cat, cutoff, options["minMagnitude"]))
        ys.append(np.bincount(cat["node"][lo:hi], minlength=NODES))
        cutoffs.append(cutoff)
        splits.append(split)
    return np.array(xs), np.array(ys, dtype=np.float32), np.array(cutoffs), np.array(splits)


class CountGraph(nn.Module):
    def __init__(self, graph=True):
        super().__init__()
        self.register_buffer("neighbors", torch.tensor(adjacency() if graph else np.zeros((NODES, NODES), dtype=np.float32)))
        self.first = nn.Linear(len(FEATURES) * 2, 24)
        self.second = nn.Linear(48, 24)
        self.output = nn.Linear(24, 1)

    def forward(self, x, offset):
        h = torch.relu(self.first(torch.cat([x, self.neighbors @ x], dim=-1)))
        h = torch.relu(self.second(torch.cat([h, self.neighbors @ h], dim=-1)))
        # ponytail: fixed broad cells and bounded residuals; finer regional models need separate validation.
        return offset + self.output(h).squeeze(-1).clamp(-5, 5)


def fit(x, y, splits, base, seed, graph=True):
    torch.manual_seed(seed)
    model = CountGraph(graph)
    optimizer = torch.optim.Adam(model.parameters(), lr=.003, weight_decay=.001)
    loss_fn = nn.PoissonNLLLoss(log_input=True, full=False)
    offset = torch.log(torch.tensor(base))
    train, validation = splits == "train", splits == "validation"
    tx, ty, vx, vy = map(torch.tensor, [x[train], y[train], x[validation], y[validation]])
    best_loss, best, best_epoch, trace = math.inf, None, 0, []
    for epoch in range(1, 201):
        model.train()
        optimizer.zero_grad()
        loss = loss_fn(model(tx, offset), ty)
        if not torch.isfinite(loss):
            raise ValueError("Non-finite training loss")
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
        model.eval()
        with torch.no_grad():
            value = loss_fn(model(vx, offset), vy).item()
        trace.append({"epoch": epoch, "trainingLoss": loss.item(), "validationLoss": value})
        if value < best_loss - 1e-6:
            best_loss, best, best_epoch = value, copy.deepcopy(model.state_dict()), epoch
        if epoch - best_epoch >= 25:
            break
    model.load_state_dict(best)
    with torch.no_grad():
        predicted = model(torch.tensor(x), offset).exp().numpy()
    return model, predicted, {"selectedEpoch": best_epoch, "epochs": epoch, "trace": trace,
                              "parameters": sum(p.numel() for p in model.parameters())}


def metrics(y, expected):
    expected = np.maximum(expected.astype(np.float64), 1e-12)
    factorial = np.array([math.lgamma(int(v) + 1) for v in y.flat]).reshape(y.shape)
    ll = y * np.log(expected) - expected - factorial
    return {"events": int(y.sum()), "expectedCount": float(expected.sum()),
            "logLikelihood": float(ll.sum()), "meanAbsoluteError": float(np.abs(y - expected).mean())}


def train(payload):
    started = time.monotonic()
    o = payload["options"]
    cat = catalog(payload["events"], o["minMagnitude"])
    x, y, cutoffs, splits = dataset(cat, o)
    if any(np.sum(splits == split) < 26 for split in ["train", "validation", "test"]):
        raise ValueError("Each split requires at least 26 complete weekly windows")
    mask = splits == "train"
    if y[mask].sum() < 100:
        raise ValueError("Training requires at least 100 catalog events")
    mean, scale = x[mask].mean(axis=(0, 1)), x[mask].std(axis=(0, 1)).clip(.01)
    standardized = ((x - mean) / scale).astype(np.float32)
    base = ((y[mask].sum(axis=0) + .5) / (mask.sum() + 1)).astype(np.float32)
    model, graph_pred, graph_fit = fit(standardized, y, splits, base, o["seed"])
    _, local_pred, local_fit = fit(standardized, y, splits, base, o["seed"], graph=False)
    # Fixed, predeclared comparator: four recent weeks plus one training-average pseudo-week.
    recent = (np.expm1(x[:, :, 2]) + base) / 5
    predictions = {"graph": graph_pred, "noNeighbors": local_pred,
                   "trainingMean": np.broadcast_to(base, y.shape), "recentRate": recent}
    scores = {}
    for split in ["train", "validation", "test"]:
        sel = splits == split
        values = {name: metrics(y[sel], p[sel]) for name, p in predictions.items()}
        denom = values["graph"]["events"] * math.log(2)
        for name, value in values.items():
            value["bitsPerEventVsTrainingMean"] = (value["logLikelihood"] - values["trainingMean"]["logLikelihood"]) / denom if denom else None
        scores[split] = {"windows": int(sel.sum()), "firstCutoff": int(cutoffs[sel][0]),
                         "lastEnd": int(cutoffs[sel][-1] + 7 * DAY), "models": values}
    weights = {key: value.tolist() for key, value in model.state_dict().items()}
    artifact = {"weights": weights, "mean": mean.tolist(), "scale": scale.tolist(), "base": base.tolist()}
    model_hash = hashlib.sha256(json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    report = {"version": VERSION, "options": o, "features": FEATURES,
              "grid": {"rows": ROWS, "columns": COLS, "cells": NODES, "areaKm2": 4 * math.pi * 6371.0088 ** 2 / NODES,
                       "method": "Equal sin(latitude) and longitude bins; four edge-sharing neighbors with dateline wrap, no polar shortcut."},
              "training": graph_fit, "ablation": local_fit, "scores": scores,
              "artifact": artifact, "weightsSha256": model_hash,
              "runtime": {"torch": torch.__version__, "numpy": np.__version__, "python": sys.version.split()[0],
                          "device": "cpu", "threads": 4, "elapsedSeconds": time.monotonic() - started},
              "testWindows": [{"cutoff": int(cutoffs[i]), "end": int(cutoffs[i] + 7 * DAY), "observed": y[i].tolist(),
                               **{name: p[i].tolist() for name, p in predictions.items()}} for i in np.flatnonzero(splits == "test")],
              "limitations": ["Exploratory revised-catalog hindcast; M5 detection completeness is assumed, not verified region by region.",
                              "Expected seven-day catalog counts in very broad cells, not calibrated probability or precise epicenter/magnitude prediction.",
                              "Clustering may reflect aftershocks; this does not establish advance mainshock prediction or stress transfer.",
                              "Validation selects checkpoints; test windows never update weights or normalization. Earlier observed test events may enter later test features.",
                              "Single predeclared seed and architecture; no significance claim. Weeks and neighboring cells are dependent."]}
    report["projection"] = predict({"report": report, "events": payload["events"], "cutoff": o["end"]})
    return report


def predict(payload):
    report, cutoff = payload["report"], payload["cutoff"]
    o, a = report["options"], report["artifact"]
    if cutoff < o["validationEnd"]:
        raise ValueError("Inference cutoff precedes model checkpoint selection")
    model = CountGraph()
    model.load_state_dict({key: torch.tensor(value, dtype=torch.float32) for key, value in a["weights"].items()})
    x = features(catalog(payload["events"], o["minMagnitude"]), cutoff, o["minMagnitude"])
    model.eval()
    with torch.no_grad():
        expected = model(torch.tensor((x - np.array(a["mean"])) / np.array(a["scale"]), dtype=torch.float32),
                         torch.log(torch.tensor(a["base"]))).exp().numpy()
    return {"cutoff": cutoff, "end": cutoff + 7 * DAY, "days": 7, "cells": expected.tolist(),
            "totalExpectedCount": float(expected.sum()), "units": "Expected M>=5 catalog events per equal-area cell in seven days"}


if __name__ == "__main__":
    torch.set_num_threads(4)
    torch.use_deterministic_algorithms(True)
    try:
        payload = json.load(sys.stdin)
        result = train(payload) if payload.get("action", "train") == "train" else predict(payload)
        print(json.dumps(result, separators=(",", ":"), allow_nan=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
