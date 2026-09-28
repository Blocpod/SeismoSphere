# Learned depth-threshold selection

Research → Learned depth calibration fits one Dutchsinse-rule parameter from earlier hindcast performance. Candidate thresholds are the unchanged threshold plus 200, 300 and 400 km. It does not learn route geometry, model weights or earthquake probabilities.

Selection maximizes DS minus matched recent-rate full hits per scheduled issuance. Each selectable candidate needs at least five training forecasts. Ties prefer the threshold closest to the unchanged setting, then the lowest threshold. The selected configuration is frozen before the later test interval is evaluated; the unchanged configuration is also evaluated for comparison. Partial hits are not full hits. Training and test intervals each span one forecast window through 90 days, with a one-day gap. Issuance spacing equals the configured window length; targets within a step remain dependent.

The server requires recorded global coverage across conditioning, training and testing, including the existing partial-hit magnitude floor. It keeps an immutable catalog snapshot, configuration, route graph, implementation sources and report checksum. A bounded worker uses the existing statistical-analysis runner. The canonical workspace configuration and forecast ledger are never changed by fitting.

Saved runs can be inspected and exported. Reproduce an export with:

```powershell
node scripts/reproduce-calibration.mjs exported-calibration.json
```

The reproducer verifies input, snapshot, implementation and report hashes and recomputes selection and test results. It requires the matching implementation; exported source is retained for historical reproduction and is never executed automatically.

This is revised-catalog parameter selection, not prospective validation. Repeatedly trying holdout intervals can overfit them. Five forecasts is only an operational eligibility minimum, not evidence of calibration quality. A separate registered prospective experiment is needed to assess forecasting skill. The current workflow deliberately leaves all other parameters unchanged.

Verification: the training-selection test changes only later observations and checks unchanged selected configuration, with changed test output. Isolated desktop/phone HTTP flows verify saving, reuse, input export, exact reproduction, unchanged canonical settings, an empty issuance ledger, and no horizontal overflow or JavaScript errors. All acceptance data are synthetic software fixtures.

## Prospective use

Research → Prospective experiments → Rule configuration can select a saved calibration. The server resolves the saved configuration, route graph and boundary reference from the retained run, checks its evidence hashes and requires unchanged engine/routing/geometry code. Preview and registration freeze the calibration ID, report/input hashes, training/test interval and selection objective with the protocol. Canonical settings stay unchanged. Newly fitted runs appear in the selector without reloading the app. Future outcomes are collected only after explicit protocol registration.

The protocol also preserves the selected midpoint definition. Calibration provenance is included in the AI evidence context and protocol export; export the linked calibration separately for its full fitting inputs and source. Six focused checks and an isolated HTTP fit → preview → registration → protocol-export verification passed. The synthetic registration issued no forecasts, and no production protocol was registered.

## Copilot explanations

Saved runs expose **Explain calibration with my AI**. The selected workspace brain receives only a verified saved calibration summary, its earlier training and later test intervals, comparison counts and stated limitations. Requests before creation time are rejected. Explanations cannot trigger globe commands or register experiments; answers that alter the required threshold/test-count sentence are withheld. Switching runs or starting another fit suppresses delayed answers. This guard covers those anchor values, not general factual validation of AI prose.

Seven focused checks pass. Isolated HTTP requests verified deterministic output, earlier-cutoff rejection, and actual local Qwen 3.6 and ChatGPT-authenticated Astra responses. Both preserved the fixture threshold and test counts. A focused prompt correction removed local instruction echo; the local rerun produced natural explanatory prose. The fixtures issued no forecasts and did not change production settings or records. Run scripts/calibration-protocol-check.mjs --ai for both brains or --local for just the configured local brain.


## Retained-catalog acceptance run

The 2026-09-28 run `a8298ff5eb189e1b1a45588958a385302bab1f0daf9b8ed13e136de3ed5c4de0` uses global USGS retrieval through M3 for 2011-02-01–2011-04-01. Training runs 2011-02-15–2011-03-05; the later test runs 2011-03-06–2011-04-01. It contains only one scheduled training issuance and two test issuances, so this is a functional acceptance example with weak statistical support.

The objective selected 400 km. All three candidates had six DS training hits; their matched recent-rate controls differed. The selected variant later had 9/29 DS full hits versus 10/29 for unchanged 300 km. It therefore did not improve the DS full-hit count. The workspace remains at 300 km. This previously explored historical interval is not an untouched scientific test.

The exported source/input/report checksums verified, and `scripts/reproduce-calibration.mjs` reproduced the report identically. Actual local Qwen 3.6 35B explained both counts correctly with no actions. The saved UI now identifies exact training/test dates, creation time, run ID and issuance counts, and restores its dates when selected.

The actual subscription-backed gpt-6-astra also preserved 9/29 versus 10/29, explained that all candidates shared six training DS hits while matched-control counts differed, and returned no actions. Result retained locally in artifacts/calibration-2011-astra.json. Both providers passed this saved-run explanation check; the default remains local Ollama.
