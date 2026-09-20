# Local weekly cell-graph model

The Research lab trains a genuine neural network locally on the retained USGS M≥5 archive. This is separate from the existing pretrained nomic text-embedding analogue retrieval and from the deterministic Dutchsinse hypothesis engine. It estimates seven-day **catalog event counts**, with an explicit held-out comparison. It is not a calibrated earthquake probability, precise epicenter forecast, stress-transfer model or mainshock warning.

## Run and reproduce

The Windows runtime is isolated in ignored `data/model-runtime/`. Install it with `scripts/setup-model.ps1 -Python <path-to-python.exe>`; dependencies are pinned in `model/requirements.txt` (PyTorch 2.14.0 CPU and NumPy 2.4.2). `SEISMO_MODEL_PYTHON` can select an already prepared runtime. Nothing is installed into Ollama or the bundled global Python environment.

Open Research lab → **Learning the seismic week** → **Train locally + evaluate**. The complete global USGS M≥5 import from 2000-01-01 through 2026-01-01 must exist. A repeated request with the same source implementation and exact input revisions reuses its immutable run. Training runs in a bounded subprocess, with four CPU threads and a five-minute limit. Closing the browser does not cancel training; the completed run is available on reload. Stopping the server interrupts an unfinished fit; request it again after restart. Completed runs persist.

Export includes weights, normalization, graph adjacency, offsets, diagnostics, all held-out predictions/outcomes, source-code hash and exact source-event snapshot. SQLite guards reject changes/deletion of saved runs. Exports independently check model and snapshot hashes. The SHA-256 uses recursively key-sorted UTF-8 JSON from `server/store.mjs`; the original Python serialization hash is also retained. Inference refuses a checkpoint if its implementation hash differs from the current Python source, avoiding silent changes in model meaning.

## Fixed experiment

| Partition | Configured boundary | Purpose |
|---|---|---|
| Training | 2000-01-01 to 2017-01-01 | Learn normalization, regional offsets and network weights |
| Validation | 2017-01-01 to 2020-01-01 | Select each model's checkpoint independently |
| Test | 2020-01-01 to 2026-01-01 | Score frozen models; never selects weights or checkpoint |

Only provider records explicitly typed `earthquake` are eligible for both training and inference. Explosions, eruptions and landslides are excluded even if their magnitude exceeds M5. The first 28 days condition the first prediction. Seven-day target windows are anchored there, never overlap, and any target straddling a partition boundary is omitted. Each feature window is `(cutoff−lookback, cutoff]`; each target is `(cutoff, cutoff+7d]`. Therefore the scored windows do not cover every day in the configured interval. Past observed test events can enter later test features, but no event after a prediction cutoff does.

There are six equal sin(latitude) bands and twelve equal longitude bins: 72 equal spherical-area cells of approximately 7.08 million km² each. Longitude wraps at the dateline. Edge-sharing neighbors are averaged; polar bands have three neighbors and other bands four, without a cross-pole shortcut. This is a broad cell graph, not a learned event-to-event graph or detailed tectonic network.

Six features per cell are log1p counts over 1/7/28 days, log1p ≥300 km deep counts over 7/28 days, and maximum magnitude excess above M5 over 28 days. Training-only global feature means/standard deviations normalize them. Two mean-neighbor concatenation layers, each 24 units with ReLU, feed a scalar log-count residual. This adapts the mean aggregation idea from [GraphSAGE, Hamilton, Ying & Leskovec](https://arxiv.org/abs/1706.02216); all neighbors are used, without sampling or claiming their original benchmark results.

The regional offset is `(training target counts + 0.5) / (training weeks + 1)`. The network log-rate residual is bounded to [−5,5]. Adam uses learning rate 0.003, weight decay 0.001 and gradient-norm clipping at 5. Training uses Poisson negative log likelihood, maximum 200 epochs and validation patience 25 (improvement >10⁻⁶). The fixed seed is 20260913. The no-neighbor ablation uses the identical architecture/initialization and zero neighbor inputs, with its own validation checkpoint. No model selection uses the test scores.

Comparators are the frozen regional training mean and a fixed recent-rate model: `(preceding 28-day count + regional training weekly mean) / 5`. Full evaluation includes log-factorial in the Poisson log likelihood. Bits/event relative to training mean is `(model LL − mean LL) / (observed events × ln 2)`. Zero-count cells are scored, too. Mean absolute count error and total expected/observed counts remain visible rather than declaring one metric a universal winner.

## Actual archive experiment

Saved run: `c30dddc16a58fdc77a2ae618adfd13a29d67b2a094c624890355e80d37ac3c4e`.

- Training: 883 windows / 30,560 target events; graph checkpoint epoch 98.
- Validation: 155 windows / 4,920 target events; ablation checkpoint epoch 55.
- Test: 312 windows / 10,783 target events, first cutoff 2020-01-04, last end 2025-12-27.

| Test model | Expected count | Log likelihood | Bits/event vs training mean |
|---|---:|---:|---:|
| Cell graph | 10,641.80 | −17,635.32 | 0.18953 |
| No-neighbor ablation | 10,499.47 | −17,822.03 | 0.16455 |
| Training mean | 10,798.59 | −19,051.92 | 0 |
| Recent rate | 10,777.12 | −18,912.77 | 0.01862 |

Version 0.1.1 excludes 60 non-earthquake entries from the associated import (55 volcanic eruptions, four nuclear explosions and one landslide), leaving 46,460 eligible source earthquakes. An earlier 0.1.0 run remains immutable for audit but included those entries and is superseded by this earthquake-only run; its weights cannot be used with the corrected implementation.

This one experiment favors the graph's test likelihood over these comparators. It does not establish statistical significance, prospective skill, generalization to other catalog thresholds or causal physical propagation. The catalog includes later revisions and assumes M5 completeness without region/era detection validation. Weekly/cell errors can be dependent, especially after large events. The six features compress temporal history; a trained event-graph analogue/discovery system and transformer remain separate work.

## Maps, explanations and checks

Choose a map cutoff from 2020 onward. The model stays frozen and a new exact 28-day inference snapshot is retained. Earth uses curved equal-area cell patches with a labeled logarithmic color scale. A native selector shows every cell's expected count and latitude/longitude bounds and focuses it. Competing heuristic volumes, field and watch cards are hidden while a model layer is active and restored on exit. Moving the timeline clears a map whose cutoff no longer matches. Figure PNG/SVG/JSON exports identify the learned layer and include inference/model provenance.

Strict observation replay rejects a model created after its cutoff. Revised hindcasts can examine earlier event times, with that distinction explicit. Copilot context contains only evaluation intervals ending by its cutoff. Both local Qwen and subscription-backed Astra use this context, not the heuristic watch explanation. Model training date and retrospective data period are separate fields. The language models' own pretrained world knowledge remains a limitation of historical explanations.

Run `node --test` for persistence, cutoff guards and the Python model self-check. The latter changes every test event's location/magnitude and verifies identical learned weights, normalization and selected checkpoint; it also checks exact feature/target boundaries, dateline adjacency, Poisson scoring, deterministic inference and future-event exclusion. Run `node scripts/learned-check.mjs` for real Chrome/WebKit lab, map, source/figure export, integrity, scene restoration and narrow/landscape UI checks. `node scripts/learned-ai-check.mjs` exercises the actual local and Astra explanations and strict-cutoff rejection. Browser tests supplement physical-device acceptance; they do not replace it.
