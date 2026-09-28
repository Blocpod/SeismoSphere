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
