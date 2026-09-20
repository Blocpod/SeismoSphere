# Global weekly volcano reports

**Layers → Global volcano reports** reads the Smithsonian / USGS Weekly Volcanic Activity Report RSS. Search reports by volcano, country or source category, inspect their dated text, locate supplied GeoRSS coordinates on Earth, download the original XML or saved receipt, and ask the selected local/Astra brain for an explanation. Teal triangles identify report locations without assigning a hazard color scale. Selection, terrain displacement, cutaway clipping, scientific presentation and historical isolation use the existing Earth workspace.

The source is checked on startup when due and every two hours while the app runs. Manual checks have a 30-second minimum interval. Failed requests retain the last valid publication. Four hours without a successful check produces a stale-check warning. Separately, a publication older than nine days produces an older-publication warning. These are application freshness thresholds, not publisher hazard standards. A successful download cannot remove the publication-age warning.

## Source and interpretation

- [Global Volcanism Program, Smithsonian Institution](https://volcano.si.edu/).
- [Published weekly RSS](https://volcano.si.edu/news/WeeklyVolcanoRSS.xml).
- [Weekly publication page and selection criteria](https://volcano.si.edu/reports_weekly.cfm).
- [GVP source terms and attribution](https://volcano.si.edu/gvp_termsofuse.cfm).

These preliminary reports are selective, not a comprehensive inventory of eruptions or unrest. Missing reports do not establish inactivity. “New Eruptive Activity,” “Continuing Unrest” and other source categories describe reporting activity; they are not USGS ground-alert levels, aviation codes or earthquake probabilities. Regional alert statements within report text belong to their named authorities and dates. No pressure-transfer, earthquake causation or model factor is inferred.

On September 13, 2026, the published RSS supplies 22 reports for **27 August–2 September 2026**, while the publisher webpage displays the following **3–9 September** period. The application retains and labels the actual RSS publication rather than inventing newer reports. The web page may continue to be newer than this feed. Its report fragment links lead to a changing publisher page; the retained XML is the exact saved source.

The channel's source date is `Thu, 03 Sep 2026 04:12:58 -0500` (09:12:58 UTC). Individual reports supply `Thu, 03 Sep 2026 04:12:58 -0400` (08:12:58 UTC). Both offsets remain independent. The reporting period, publication dates, first receipt and latest successful check are separate fields. Some source punctuation is already represented by literal question marks; the app does not guess replacements.

## Retention and replay

The downloader retains and hashes original bytes. The XML declares ISO-8859-1; Python's standard-library XML parser honors that declaration instead of decoding it as UTF-8. The source parser rejects document types/entity declarations, oversized feeds, duplicate identities, invalid coordinates, unexpected publisher URLs and publication dates without time zones. Embedded HTML becomes inert paragraph text; scripts/styles are excluded. Missing coordinates remain missing and disable location controls.

`weekly_volcano_records` stores immutable original bytes as base64, normalized publication data and source receipts. `weekly_volcano_checks` separately records successful checks. SQL triggers reject updates/deletes. Identical source content reuses its first receipt and appends a check; changed source content creates a new record. Reads verify byte hash, byte length, record identity, normalized content identity and receipt consistency.

The initial retained publication is:

- Record `222b77ea2a4de409b4eeb3d15275dc202e0a7ca8069599a908bd0a15f726145c`.
- Raw SHA-256 `a20bbda0e5db90b12c0dbbc1f0046c4fc8254f341b96e64ea3c999450af37fdf`.
- 29,070 original bytes; first app receipt `2026-09-13T15:30:30.048Z`.

Historical Earth selects a successful check received by its cutoff. Later publications and individual reports cannot be used as earlier AI evidence. Before the first receipt, report markers, downloads and explanations are withheld from that historical view. Changing cutoff, selection or source check while an answer is pending prevents that answer from appearing in the new context. Server requests reject mixed evidence, unknown reports, unsupported modes and incomplete identities.

Figure JSON includes displayed reports, selected text, source receipt, publication date, check date and source terms. Figures also print Smithsonian attribution and the publication-age warning. Video evidence freezes the same fields; a source/check change ends a clip while preserving its earlier scene. Video prints the publication date and Smithsonian credit.

## Verification and limits

The full automated suite passes 66 tests. Focused tests cover Latin-1 text, separate offsets, absent coordinates, rejected XML, exact raw-byte hashing, immutable history, unchanged-poll reuse, older publications, stale checks, failures and controlled stored-content corruption.

`scripts/weekly-volcanoes-check.mjs` passes eight fresh Chrome/WebKit desktop, 320/390-pixel phone and landscape contexts. It checks source/search details, actual mouse/touch globe selection, 44-pixel close targets, no dialog overflow, exact XML download hashes, cutaway materials, figure evidence and withholding delayed replies during historical replay. Fresh viewport contexts avoid the previously isolated Windows WebKit compositor resize defect; these are not physical-phone acceptance tests.

`scripts/weekly-volcanoes-ai-check.mjs` exercises the actual UI/default local Qwen and ChatGPT-authenticated Astra with frozen source context. Initial local output misattributed Etna's regional alert authority to INGV; the instruction now explicitly separates observation sources from alert issuers. This targeted verification does not make model summaries authoritative; the original dated report remains inspectable alongside them.

`scripts/weekly-volcanoes-lifecycle-check.mjs` checks a real repeated source download, preservation of the first receipt/publication date, recording termination with earlier evidence, printed figure attribution, and mobile recovery from a controlled publisher failure.

No extra npm package is required. XML parsing uses the same `SEISMO_PYTHON` override/bundled-Python discovery convention as local certificate setup; otherwise it uses `python` on PATH. The app remains available if that parser is unavailable, and the source status reports the error. Continuous observatory telemetry, physical-device acceptance and the remaining full project brief remain separate work.
