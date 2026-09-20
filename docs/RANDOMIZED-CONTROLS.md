# Randomized-catalog controls

Open **Research lab → Randomized-catalog controls**. Choose an elapsed interval of at most 90 days, issuance spacing, 19–999 replicates, a reproducible seed and a timestamp-shuffle block size. Zero uses the entire conditioning/evaluation interval as one block. Current research settings, revised catalog, route graph, sampled plate vertices and retrieval coverage are frozen before work begins. Complete retrieval coverage at the configured magnitude floor is required; retrieval coverage does not establish magnitude completeness.

The worker recomputes DS, matched recent-rate and uniform-area controls for the observed catalog and every synthetic catalog. It does not hold observed-data predictions fixed while shuffling outcomes. Each issuance uses only events at or before its synthetic cutoff. Forecast envelopes and source exclusions use the existing scoring engine; partial matches are not hits. Overlapping forecasts stay together in each replicate.

Only event timestamps are permuted. Joint location, depth, magnitude, identity and other marks stay together; the exact timestamps and counts within each block remain unchanged. Blocks are anchored at first issuance minus the configured lookback. Older imported history remains fixed. This null assumes within-block time exchangeability and disrupts within-block space-time aftershock association. It is not a complete physical or ETAS catalog simulator.

The primary statistic is `(DS hits − matched recent-rate hits) / issuance steps`; larger favors DS. The displayed Monte Carlo tail is `(1 + replicates at least as high as observed) / (1 + completed replicates)`, counting ties. The chart's central 95% range describes the randomized distribution. The Wilson interval describes Monte Carlo sampling uncertainty in its tail estimate. Neither is a confidence interval for real-world skill or a calibrated earthquake probability. Searching multiple dates, rules, blocks or seeds needs separate multiple-testing control and prospective validation.

## Persistence and reproduction

Pause, resume and cancel retain completed replicate checkpoints. A backend restart makes a running job paused; resume it explicitly. One worker runs at a time. Completed reports and input snapshots have SQLite mutation guards and SHA-256 checks. Synthetic catalogs and forecasts never enter the observation catalog or forecast ledger. Export contains the report, all replicate summaries/digests and exact frozen input snapshots, settings and geometry.

SHA-256 counter streams with rejection sampling drive unbiased Fisher–Yates swaps. To verify an exported replicate:

```powershell
node scripts/reproduce-randomization.mjs path/to/export.json 0
node scripts/reproduce-randomization.mjs path/to/export.json 98 artifacts/reproduced.json
```

The optional output contains the reconstructed catalog and individual scored forecast trials. New job identities include both algorithm and forecast-engine versions; resume refuses incompatible or unversioned checkpoints. Algorithm and engine versions must match for reproduction; source-code bytes are not embedded or independently timestamped. Preserve the source checkpoint with exports. The first completed 99-replicate run predates the input engine-version field but retains its report version and verified replicate digests. Its frozen report is preserved. A local administrator can replace the database and retained hashes, so local immutability is not an external trusted timestamp.

The local Qwen brain and subscription-backed Astra receive the saved comparison and limitations without the full synthetic catalogs. Outcomes cannot be explained before the run's outcome cutoff; strict mode also requires the saved report to have existed by that cutoff. Mixed forecast/model evidence is rejected. AI prose remains labeled as AI explanation.

## Verified historical run

Run `e9c31c66bddb5599ddea6d951f49fee3800893273157b2205b72e0d7b46f2509` uses first issuance February 15, outcomes through March 25, 2011, five-day steps, seven-day blocks, seed 71 and 99 replicates. Its snapshot contains 24,411 eligible historical earthquakes and 2,182 sampled boundary vertices. Six issuance steps produced:

| Observed-catalog engine | Hits / forecasts |
|---|---:|
| DS | 27 / 95 |
| Recent-rate | 56 / 95 |
| Uniform-area null | 12 / 95 |

Observed extra hits per issuance: −4.833333. Of 99 randomized statistics, 27 were at least as high; corrected tail **0.28**, minimum attainable tail 0.01. Null median −5.333333 and central 95% range [−7.091667, −3.558333]. Simulation-tail Wilson 95% interval [0.194724, 0.367709]. This result does not establish prospective DS skill. It is a new revised-catalog experiment; the earlier frozen 28/94 DS experiment remains unchanged.

The actual worker paused and resumed, completed all 99 replicates, and reproduced first/last catalog and forecast digests independently. Chrome and Windows WebKit passed report, export and 320/390/768/844-pixel dialog checks. Numerical, worker-restart, immutable-report and isolated HTTP checks are in `test/randomization.test.mjs`. Real AI evidence is checked by `scripts/randomization-ai-check.mjs`. All 282 ledger records retain their previous verified head.

## Methodological sources

- [Luen and Stark, Testing earthquake predictions](https://arxiv.org/abs/0805.3032): conditioning and null-model choices can make earthquake-prediction tests misleading. This motivates full regeneration and comparison against a recent-activity predictor; it does not validate our chosen null.
- [Phipson and Smyth, Permutation P-values Should Never Be Zero](https://gksmyth.github.io/pubs/PermPValuesPreprint.pdf): finite Monte Carlo tail correction. Interpretation remains conditional on the sampling and exchangeability assumptions.
- [pyCSEP evaluation concepts](https://docs.cseptesting.org/concepts/evaluations.html): reference for probabilistic forecast evaluation. This heuristic-envelope experiment is not claimed to be a CSEP implementation.

New experiment requests now require retrieval coverage down to the partial-hit magnitude tolerance (and the lower possible analogue-derived magnitude when applicable), not only the nominal forecast floor. Existing frozen experiment inputs, results and summaries remain unchanged. See [resolution review policy](RESOLUTION-REVIEWS.md).
