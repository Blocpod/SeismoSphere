# Forecast results after catalog corrections

The forecast ledger now preserves both the **original frozen result** and the **latest retained assessment**. Its assessment-basis selector changes which result is used for the prospective leaderboard; each forecast is still counted once. Historical forecasts remain excluded from that leaderboard, and stored experiment summaries remain unchanged.

Open **Forecast ledger → Result history** to inspect a forecast's assessments, reproduce a selected result from its saved outcome evidence, export that evidence, or ask the local/Astra brain to explain it. On a phone, the ledger is accessible through **Research → Open forecast ledger**. Original outcome cutoffs and the actual date a result was first stored are shown separately: a 2011 hindcast was not necessarily evaluated in 2011.

## Append-only history

The existing `forecasts` and `resolutions` records are not rewritten. New `resolution_reviews` records form a per-forecast SHA-256 chain anchored to the original forecast hash and original result. Each review retains:

- Its actual creation time and observation cutoff.
- The unchanged forecast identity and scoring version.
- A hashed snapshot of relevant outcome events, including source revision/reception metadata.
- The coverage evidence used, including the full partial-hit magnitude floor.
- The assessment, quantitative errors, previous status and change indicator.

SQL triggers reject updates and deletions. Integrity checks verify the forecast chain, original result anchor, review chain and outcome snapshots. Repeated checks with unchanged relevant evidence do not create duplicate reviews. Source metadata changes can create a review even when the status remains HIT; that is revised evidence for the same trial, not another success. The selected review export includes only its preceding history, not later assessments.

Closed forecasts are reviewed during catalog refreshes, after imports/deletion updates, through the ledger's evaluate/review button, or individually in Result history. Newly completed backtests receive retained outcome reviews during the same request. Coverage witnesses already retained by a review remain available when old live-feed coverage entries are pruned.

An unassessed forecast with missing coverage stays pending. An already assessed forecast may receive an AMBIGUOUS review when the retained evidence does not establish complete outcome coverage. This qualification does not delete its original result. Later completed coverage can support a further review. No proximity-based cross-provider association is introduced; the frozen forecast's provider remains the assessment source.

## Partial hits and coverage

The existing scorer classifies a partial hit only after finding no full hit: the event must be inside the frozen space/time region and within an additional half-magnitude tolerance outside the nominal magnitude envelope. Coverage therefore must extend to `forecast.magnitude.min − 0.5`. A catalog retrieved only down to the nominal forecast floor cannot establish that full partial-hit check.

The revised checks enforce that floor, including in new backtest/randomization requests. Analogue magnitude mode accounts for its possible lower source-follow-up magnitude when checking the retrieval floor. A partial hit is not a full hit and is not inside the nominal magnitude envelope. Native catalog magnitude scales remain native; `mlg` is not silently relabeled `Mw`. Magnitude error is the absolute difference from the central forecast magnitude, not the distance outside the nominal envelope; both quantities are separately named in AI evidence.

The scoring algorithm is identified as `frozen-envelope-0.1`. Reproduction uses the frozen geometry, source exclusions, magnitude envelope, window, retained event revisions and coverage. This is a revised-catalog assessment received at its recorded cutoff, not proof that the same revised catalog was publicly available in the original forecast period. Local hashes are not an independent timestamp authority.

## Actual ledger audit

The September 13, 2026 audit preserved all **282 forecasts and 282 original results** byte-for-byte. The original forecast-chain head remains:

`a66ab0a154d0647fbeb99afb7cc089bf821de8d4f76eecb62d16f68af9e7f81d`

The first review found 84 records without sufficient retained coverage for the partial-hit floor. A real USGS import then retrieved February 15–March 22, 2011 at M≥3.2: job `11419439-8952-4c5d-b458-9928d7c028cb`, two completed chunks, 3,550 received rows and 984 new revisions. The app appended follow-up reviews automatically.

The resulting **417 reviews** reproduce from the exported snapshots and coverage. Latest classifications agree with all original classifications: 98 HIT, 30 PARTIAL HIT and 154 MISS across the combined hindcast models. These totals are not a prospective skill result. Intermediate AMBIGUOUS assessments remain in the history; they were not erased after the additional data arrived.

Example: `DSP-b32f0946-9a5` retains its original PARTIAL HIT, an AMBIGUOUS review for insufficient coverage, and a later PARTIAL HIT after the import. Its M3.5 `mlg` event is below the nominal M3.75–5.75 range but inside the half-magnitude partial tolerance. The forecast itself never changed.

## Verification

- `node --test`: 70 tests, including original-record preservation, corrections received after a cutoff, repeated-review reuse, partial-range coverage, retained coverage after pruning, tamper rejection, both leaderboard bases, reproduction, and invalid/mixed AI context rejection.
- `scripts/resolution-audit.mjs`: independently reads the full application export, compares original forecasts/results with the pre-change capture, verifies each chain and snapshot hash, and recomputes all 417 review results.
- `scripts/resolution-history-check.mjs`: eight fresh Chrome/WebKit desktop, phone and landscape contexts; both assessment bases, mobile ledger access, readable history, exact reproduction, evidence download, 44-pixel close targets and delayed-response isolation.
- `scripts/resolution-history-ai-check.mjs`: actual local Qwen and ChatGPT-authenticated Astra explain saved AMBIGUOUS and PARTIAL HIT reviews. Initial local output confused the nominal/partial magnitude envelope and invented `Mw`; the supplied evidence now includes the exact classification sentence and native scale. A partial-hit answer that does not preserve that sentence is withheld; harmless capitalization, Markdown and dash styling are normalized. This targeted guard does not validate every possible claim an AI might make.

The review implementation uses native SQLite, the existing snapshot/scoring/coverage code and browser dialogs; no package was added. The current scan is appropriate for the 282-record ledger (about two seconds for its first review on this machine). Larger ledgers will need indexed or worker evaluation. Independent scientific validation, calibration and the remaining full project brief remain open.
