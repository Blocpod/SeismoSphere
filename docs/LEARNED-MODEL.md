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


## Validation-weighted count ensemble

Saved-run navigation: the lab lists every retained run by UTC creation time, implementation version and ID. Selecting a run loads its original report and binds map, uncertainty and evidence-export controls to that ID. Background polling preserves the user's selection; stale selection responses are ignored. History summaries omit weights and test-window arrays, which remain available in the full export. Older implementation checkpoints remain viewable/exportable, with the existing source-version guard retained for inference. Actual selection of all-history entries, the oldest run's export hashes and 390-pixel layout have been checked; the persistence test covers more than ten runs.

### Paired uncertainty comparison

The research lab compares graph versus no-neighbor, ensemble versus graph, and ensemble versus recent rate using saved test windows. `/api/learned-uncertainty?id=RUN_ID` exports derived evidence with model/test-window hashes, version, seed and interval endpoints. Model records remain unchanged.

Circular blocks of 1, 4 and 13 consecutive weeks each generate 2,000 paired resamples, retaining all 72 cells and model outputs together. Uniform start indices use SHA-256 counter draws with rejection of modulo bias. Concatenated blocks wrap and truncate to the original week count. Each score is the summed paired Poisson log-likelihood difference divided by the resampled event count and ln(2); log-factorials cancel. Zero-event replicates are excluded and counted. Percentile endpoints use linear interpolation at 2.5% and 97.5%. Positive favors the first model.

Block lengths are sensitivity choices, not validated correlation scales. One-week blocks ignore serial dependence. Circular wrapping joins the last and first weeks. Stationarity and sufficiently short dependence are assumptions. These conditional intervals exclude training, model-selection, detection and magnitude uncertainty. They are neither p-values nor multiplicity-adjusted tests and cannot establish prospective skill. [Methodology reference](https://stat.cmu.edu/~cshalizi/uADA/16/lectures/26.pdf).

The saved 312-week 0.2.1 run has ensemble-minus-graph gain 0.017409 bits/event. Intervals are 0.007399–0.028240 (1 week), 0.007764–0.027316 (4 weeks), and 0.009371–0.025887 (13 weeks). Independent Python calculations reproduce these endpoints. Constant-contrast fixtures check scores, pairing, deterministic output, unchanged evidence and invalid-input rejection. The full suite passes 139 tests.

Version 0.2.0 adds a convex average of the graph, no-neighbor ablation, training mean and recent-rate weekly count predictions. A fixed 0.1-step simplex enumerates 286 candidate weight vectors. Validation Poisson log likelihood selects the vector; the omitted log-factorial is constant across candidates. Ties within 1e-9 prefer descending graph, then no-neighbor, then training-mean weight. Training normalization and network fits are unchanged. The ensemble weights and complete selection grid are included in the hashed model artifact; per-cell test predictions are exported alongside their components.

Validation selects both checkpoints and ensemble weights, so its score is selection-biased. Test outcomes are excluded from both selections, verified by perturbing those outcomes. The 2020–2025 interval has nevertheless been examined during earlier development and is not a fresh confirmatory dataset. This combines comparable seven-day count estimates; DS envelopes and ETAS intensities are not substituted into these units. Version 0.2.1 adds a graph/ensemble map selector and retains the no-neighbor checkpoint for inference. Ensemble map evidence includes all four component cell arrays and frozen weights. Figure and video captions identify the selected model. Copilot receives compact selected-weight evidence rather than the candidate search grid; exact model, weights, count and interpretation sentences are checked before an AI answer is displayed. Isolated model explanations cannot change the view.

Actual run `4c62e1013187658dbc832c9adf37a9aeba1f412fce15152206ecda0994b08ed0` selected weights 0.4/0.2/0.2/0.2. Across 312 weeks and 10,783 observed events, ensemble log likelihood was -17505.19767120703 versus graph -17635.316610378573; bits/event versus training mean were 0.206941 versus 0.189532. Independent standard-library calculations reproduced all 22,464 weighted cell predictions, log likelihood, total expected count and mean absolute error. Source and model export integrity checks pass. This remains exploratory, without a significance or prospective-skill claim.

Method references: [weighted prediction averaging](https://scikit-learn.org/1.5/modules/ensemble.html#voting-regressor) and [keeping test data out of model selection](https://github.com/scikit-learn/scikit-learn/blob/main/doc/common_pitfalls.rst). The implementation uses existing NumPy; no new runtime dependency.

Integration verification (2026-09-28): real run `4f666dc2f069ae0bb72e3dd9d4b5b183298b02d38b0c6a2a77fa2607a8f11e18` at the 2026-01-01 cutoff yields 34.771209748365806 expected events over 72 cells. Weighted component sums reproduce the projection. Local Qwen 3.6 35B and subscription-backed Astra both preserve 40/20/20/20 weights, 34.77 rounded global count and the retrospective limitations, with no UI actions. The 138-test suite passes, including tampered AI-weight rejection, inference future-outcome exclusion and isolated chat routing. Encoded-video delivery and physical-device acceptance remain separate checks.
