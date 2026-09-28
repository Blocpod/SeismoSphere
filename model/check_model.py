"""Run: data/model-runtime/Scripts/python.exe model/check_model.py"""
import copy
import math
import numpy as np
import torch
from seismic_gnn import DAY, NODES, adjacency, catalog, cell, dataset, features, metrics, predict, train, select_ensemble

torch.set_num_threads(4)
torch.use_deterministic_algorithms(True)
o = {"start": 0, "trainEnd": 730 * DAY, "validationEnd": 1095 * DAY,
     "end": 1460 * DAY, "minMagnitude": 5, "provider": "USGS", "seed": 20260913}
events = [{"id": str(i), "type": "earthquake", "time": (i + .5) * DAY, "lat": -55 + i % 110,
           "lon": -179 + i * 19 % 358, "mag": 5 + i % 5 * .2, "depth": i % 600} for i in range(1460)]
cat = catalog(events, 5)
x, y, cutoffs, splits = dataset(cat, o)
assert cell(0, 180) == cell(0, -180)
assert cell(90, 0) < NODES and cell(-90, 0) >= 0
assert np.allclose(adjacency().sum(axis=1), 1)
assert adjacency()[0, 11] > 0 and adjacency()[11, 0] > 0
assert not np.any(np.diag(adjacency()))
for cutoff, split in zip(cutoffs, splits):
    if split == "train":
        assert cutoff + 7 * DAY <= o["trainEnd"]
    elif split == "validation":
        assert cutoff >= o["trainEnd"] and cutoff + 7 * DAY <= o["validationEnd"]
    else:
        assert cutoff >= o["validationEnd"]
assert np.all(np.diff(cutoffs) >= 7 * DAY)
boundary = [{**events[0], "time": 28 * DAY}, {**events[0], "time": 28 * DAY + 1},
            {**events[0], "time": 35 * DAY}, {**events[0], "time": 35 * DAY + 1}]
bx, by, _, _ = dataset(catalog(boundary, 5), o)
assert math.isclose(np.expm1(bx[0, :, 2]).sum(), 1)
assert by[0].sum() == 2  # cutoff excluded; target end included.
assert math.isclose(metrics(np.array([[2.]]), np.array([[2.]]))["logLikelihood"], 2 * math.log(2) - 2 - math.lgamma(3))
report = train({"options": o, "events": events})
changed = copy.deepcopy(events)
for e in changed:
    if e["time"] > o["validationEnd"]:
        e["lat"], e["lon"], e["mag"] = 1, 1, 9
second = train({"options": o, "events": changed})
assert report["artifact"] == second["artifact"], "Test outcomes leaked into checkpoint or normalization"
assert report["training"] == second["training"]
assert report["ensemble"] == second["ensemble"], "Test outcomes leaked into ensemble selection"
assert len(report["ensemble"]["trials"]) == 286
assert math.isclose(sum(report["ensemble"]["weights"]), 1)
for window in report["testWindows"]:
    blend = sum(w * np.array(window[name]) for w, name in zip(report["ensemble"]["weights"], report["ensemble"]["components"]))
    assert np.allclose(blend, window["ensemble"])
fixture = {name: np.full((2, 1), value) for name, value in zip(["graph", "noNeighbors", "trainingMean", "recentRate"], [2, 8, 8, 8])}
_, selection = select_ensemble(fixture, np.array([[2], [1000]]), np.array(["validation", "test"]))
assert selection["weights"] == [1, 0, 0, 0]

cutoff = 1200 * DAY
before = features(catalog(events, 5), cutoff, 5)
future = events + [{**events[0], "mag": 9, "time": cutoff + 1}]
assert np.array_equal(before, features(catalog(future, 5), cutoff, 5))
assert np.array_equal(before, features(catalog(events + [{**events[0], "time": cutoff, "mag": 9, "type": "nuclear explosion"}], 5), cutoff, 5))
a = predict({"report": report, "events": events, "cutoff": cutoff})
b = predict({"report": report, "events": future, "cutoff": cutoff})
assert a == b
ensemble_a = predict({"report": report, "events": events, "cutoff": cutoff, "model": "ensemble"})
ensemble_b = predict({"report": report, "events": future, "cutoff": cutoff, "model": "ensemble"})
assert ensemble_a == ensemble_b
assert ensemble_a["model"] == "ensemble"
expected = sum(w * np.array(ensemble_a["componentCells"][name]) for name, w in ensemble_a["ensembleWeights"].items())
assert np.allclose(expected, ensemble_a["cells"])
assert math.isclose(sum(ensemble_a["cells"]), ensemble_a["totalExpectedCount"], rel_tol=1e-9)
assert np.array_equal(ensemble_a["componentCells"]["graph"], a["cells"])
try:
    predict({"report": report, "events": events, "cutoff": cutoff, "model": "invalid"})
    raise AssertionError("Accepted an unknown model")
except ValueError:
    pass

assert all(math.isfinite(v) and v > 0 for v in a["cells"])
assert math.isclose(sum(a["cells"]), a["totalExpectedCount"], rel_tol=1e-6)
try:
    predict({"report": report, "events": events, "cutoff": o["validationEnd"] - 1})
    raise AssertionError("Accepted a pre-selection cutoff")
except ValueError:
    pass
print("PASS: graph topology, disjoint boundaries, exact Poisson scoring, held-out isolation, deterministic weights and cutoff-safe inference")
