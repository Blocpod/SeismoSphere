# Registered prospective experiments

Open Research → Prospective experiments. Enter a hypothesis and future schedule, review the complete frozen protocol, then choose **Freeze & schedule experiment**. Registration authorizes this host to issue every selected DS target and its matched Recent-rate and uniform-area Null controls. Previewing alone does not issue watches. Viewer accounts cannot register or stop experiments.

The protocol preserves scientific settings, routes, boundary points, source code, source hashes, Node version, control seed, schedule, outcome delay and analysis rules. There can be at most three unfinished experiments. The live USGS catalog with a lookback of at most 30 days is required. The registry shows current operational state independently of globe replay.

## Timing and exclusions

Keep the backend running for issuance and assessment. The scheduler checks every 30 seconds, allows five minutes after each scheduled time, and requires a successful feed whose retrieval and source generation are no more than 15 minutes old. Closing a browser alone does not stop the backend. Sleeping or stopping the computer can miss a window.

Inputs use only revisions received by the actual processing cutoff. Forecast validity starts at actual issuance after computation. Missed windows are recorded and never backdated or caught up. No-target slots remain empty. Forecasts, input snapshots and slot receipts are written in one transaction.

Assessment runs once after the forecast window ends plus the registered delay of 1–7 days. It has the same five-minute grace and fresh-feed requirement. Outcomes and retrieval coverage are frozen at this assessment. Insufficient coverage produces ambiguous outcomes; a missed assessment remains missing. Later general-ledger result reviews cannot replace the protocol's primary assessment. Retrieval coverage does not establish complete earthquake detection.

Changing frozen scientific source files or Node versions causes version skips, rather than silently changing the registered experiment. Review an export before upgrading an installation with an active experiment. There is no automatic execution of archived code.

**Stop future issuance** irreversibly cancels remaining unissued slots. Assessments of already-issued watches continue. A stop receipt and cancelled slots remain visible; data-dependent stopping can bias the retained comparison.

## Meaning of the result

The primary statistic is the equal-issuance mean of DS full-hit fraction minus matched Recent-rate full-hit fraction, reported in percentage points. Only groups with all three engines fully assessed enter this mean. The secondary statistic compares DS with Null in the same way. Empty, skipped, cancelled and incomplete groups are disclosed and excluded. Partial hits do not count as full hits. No completed groups means **Not available**, never zero.

This descriptive comparison is not a calibrated probability, independent-trial significance test, Brier score, population recall or demonstrated predictive skill. Targets, windows and aftershocks can overlap. The current DS route graph remains illustrative. Local immutable records and hashes are not an external timestamp authority or CSEP certification.

## Export and verification

Each JSON export includes the frozen code and protocol, issuance slots, stop receipt, assessments, exact input/outcome snapshots and forecast hash proofs. With the matching local code and Node version:

```powershell
node scripts/reproduce-protocol.mjs path/to/export.json
```

The verifier checks hashes, regenerates targets and controls, and re-scores outcomes using the frozen coverage. Comparisons use the persisted canonical JSON representation, which normalizes JavaScript negative zero to zero.

Software acceptance uses explicitly synthetic experiments in isolated databases. The scored fixture deliberately gives DS one full hit and its controls none: its +100 percentage-point result verifies calculation, not scientific performance. Tests cover transaction rollback, idempotence, immutable records, future cutoffs, missed windows, version changes, cancellation, incomplete coverage, authorization and API selection isolation. Chrome and WebKit pass fresh desktop, 320/390-pixel phone and landscape workflows; these are not physical-device acceptance.

Actual Qwen 3.6 35B and ChatGPT-authenticated Astra calls were checked on completed and empty fixtures. The command matcher suppresses all actions for this evidence context. An exact primary-result sentence is required: a changed or omitted result withholds the explanation and leaves the saved result available. This targeted guard is not general factual validation; model prose can still contain errors. Tests verify rejection of both a missing completed score and an invented score for an empty experiment.
