# Regional magnitude completeness diagnostics

Research → Magnitude completeness analyzes a successfully imported rectangle and elapsed interval. Choose provider, retrieval floor, native magnitude type, magnitude bin width and temporal window. The report freezes its source snapshot. Reloading or subsequent catalog revisions cannot rewrite a saved result. JSON includes the exact input events and verifies the snapshot hash; SVG contains the selected plot plus its sample, method, source links and limitations as metadata.

The interface shows pooled results, non-overlapping temporal windows and 16 equal-area regional cells. Selecting a window or cell changes both plots and the exported sample. A missing MBS estimate remains missing. Charts reflow to the available width; tables retain labeled horizontal scrolling. The dialog title and close button remain available in portrait, landscape and desktop layouts.

## Estimators and limits

The implementation follows the [SeismoStats completeness formulations](https://seismostats.readthedocs.io/latest/user/estimate_mc.html): MAXC selects the modal incremental magnitude bin and applies an explicit +0.2 correction. MBS selects the first candidate whose b-value differs from the mean across K adjacent candidates by less than its approximate standard error. K = ceil(0.5 / bin width); each individual b-fit needs at least 100 events. Available bin widths are 0.05, 0.1 and 0.2. All candidates, sample sizes and stability ratios are exported.

Magnitudes are rounded to those bins. The b-fit uses the exact geometric maximum likelihood for discrete magnitudes, `b = log(1 + binWidth / (meanMagnitude − threshold)) / (binWidth × ln(10))`. Its approximate uncertainty is the Shi–Bolt expression described in the [SeismoStats b-value documentation](https://seismostats.readthedocs.io/latest/user/estimate_b.html). Constant-magnitude tails have no finite fitted b. The partially retrieved lowest rounded bin cannot be an MBS candidate.

The pooled report performs 200 seeded IID magnitude bootstrap replicates. Each replicate repeats threshold selection. The report counts failed fits and gives 2.5–97.5% percentiles conditional on successful fits. Those percentiles do not include earthquake clustering, missing observations, native-scale uncertainty or uncertainty in detection probability. They are not a completeness certification. MAXC remains a heuristic diagnostic even when its modal bin is easy to identify.

Retrieval coverage and earthquake detection completeness are different. A peak or stable threshold at the retrieval floor is censored; a lower-magnitude import is needed to inspect the turnover. Pooled results can hide location and time variation. A mixed native-scale fit does not homogenize mb, ML and moment magnitudes. Threshold selection using later observations cannot establish earlier prospective performance.

## Persistence and copilot

`POST /api/completeness` requires spatially containing, temporally complete retrieval coverage at a sufficiently low floor. It runs analysis in the existing worker mechanism, with a 90-second bound and a 250,000-event input ceiling. Runs accept at most 600 time windows. A shared statistical lock avoids overlapping fits. `GET /api/catalog-diagnostics` lists recent saved reports; `GET /api/diagnostic-export?id=…` exports a report and exact source snapshot. SQLite triggers prohibit report updates and deletions.

“Explain selected sample with my AI” uses the configured local or Astra brain. The backend loads the saved report itself, supplies the selected and pooled summaries, and excludes unrelated forecasts. It rejects a report ending after the requested analysis cutoff. Strict replay additionally requires the report to have existed at that cutoff. Copilot answers remain labeled AI explanations. Both actual brains were checked with the saved Japan diagnostic; deterministic rendering and cutoff rejection have runnable API tests.

## Verified experiment

The USGS import for 2010-01-01 through 2012-01-01, M≥2, 30–46°N and 130–148°E contains 5,474 earthquakes. The pooled mixed-scale diagnostic has raw modal bin 4.6, MAXC 4.8 and MBS 5.1, with 657 tail events and b = 0.980808. There were 198 successful pooled bootstrap fits out of 200. Most 30-day windows do not support a stable estimate at the configured sample requirement. This is an exploratory revised-catalog diagnostic, not a threshold validated for every year, cell or forecast model.

Saved run: `aada219e5f814d57c6a83b6b2b7a960df2e2493b7f4bf715df8973942a275e59`.

`test/completeness.test.mjs` checks a seeded discrete power-law catalog, exact b calculation, floor censoring, constant/weak samples, provider/type/time isolation, partitions and historical evidence boundaries. The API test verifies retrieval requirements, duplicate reuse, immutable reports and snapshot export. `scripts/completeness-check.mjs` checks the real Japan report, native-scale filtering, reloads, keyboard selection, SVG metadata, JSON hashes and Chrome/WebKit layouts at 320, 390, 768 and 844×390. `scripts/completeness-ai-check.mjs` exercises the actual UI → local AI flow and Astra with matching frozen evidence. Physical phone and full-platform acceptance remain separate work.
