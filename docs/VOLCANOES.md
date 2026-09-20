# Smithsonian Holocene volcano reference

Open **Volcanoes** in the Earth toolbar, search a name, country, volcanic region or GVP number, then inspect its source record. **Show these volcano results on Earth** plots the current result set. **All volcanoes** clears the search; the results list expands in batches of 100. **Near selected earthquake** and **Below camera** return up to eight catalog points within 500 km, ranked by spherical surface distance. Those distances do not use earthquake depth and establish no causal association.

**Locate on Earth** opens a surface view. Each volcano is a flat triangle with an outline, not a geometric model of the volcano or magma chamber. The 14-pixel symbols sit at 1.015 Earth radii solely to remain visible over the Earth and earthquake projections; this offset is unrelated to the catalog's elevation. Selected symbols are brighter orange. Picking uses projected screen coordinates, with a 10-pixel mouse radius and 22-pixel touch radius, so target size does not grow with camera zoom. A nearby visible volcano symbol takes picking priority over earthquake points. Hidden-hemisphere and cutaway-clipped points cannot be picked.

## Source and preserved information

The pinned source is [Global Volcanism Program, Smithsonian Institution](https://volcano.si.edu/), **Volcanoes of the World 5.4.0, 7 August 2026**, [DOI](https://doi.org/10.5479/si.GVP.VOTW5-2026.5.4). The [official WFS](https://volcano.si.edu/database/webservices.cfm) and [Holocene list](https://volcano.si.edu/volcanolist_holocene.cfm) agree on **1,214 records**. The source describes Holocene inclusion as eruptions during roughly the last 12,000 years. This is not a current activity classification.

`node scripts/setup-volcanoes.mjs` retrieves the complete EPSG:4326 GeoJSON response. It validates every GVP identity and coordinate, agreement between point geometry and latitude/longitude properties, epoch and response counts. It preserves all original attributes in each normalized record and retains the exact WFS source separately. Records are sorted by stable Volcano_Number; transient service-generated feature IDs are omitted only from the normalized representation. The 366 absent eruption years remain null. All 112 negative elevations remain negative meters relative to sea level, not earthquake depths. BCE years retain their sign and receive a BCE display label.

The source configuration pins the normalized content hash:

`420fbb7e81377ce81bcaa878a4a7de81397853920bfbb86367fd256847fc18b6`

The received WFS JSON has SHA-256:

`e325b864bd70b697aa78f751938a42b1c5583c1e45ebaa2e8f69797136d1d836`

The rendered dataset file has SHA-256:

`828bff93535d22bd4a9b718dc7d9eb8a89dcf2583504b02d3a6757d8549e6876`

Its receipt is **2026-09-13T10:37:48.056Z**. Setup reuses a verified local raw cache and retains this timestamp; it does not make restored data appear newly received. A changed upstream dataset fails the reviewed normalized hash before replacing assets. A future source version needs an explicit code/data review. GVP does not offer previous website versions, so distribution must retain the reviewed local cache if upstream content changes.

The source's [terms](https://volcano.si.edu/gvp_termsofuse.cfm) describe the database compilation as work by US government employees and require attribution and preservation of source notices. The UI and exports retain the database citation, home link, DOI and terms link. No source photographs are downloaded or displayed. Source-specific reuse terms remain applicable.

## Replay, AI and exports

The Earth can display this **static reference** alongside an older replay, with its actual version and explicit static-reference label. Its latest recorded eruption year is always an attribute of the pinned 2026 database, never an assertion about conditions at that replay date. The layer is not an input to the forecast engines.

The copilot is more restrictive: if the analysis cutoff precedes the installation receipt, no volcano attributes or later eruption years are supplied to the model. It explains that the reference was unavailable. Already displayed AI text is hidden when changing to such a cutoff, including a response that finishes after the time change. Returning to an eligible cutoff restores the retained explanation. The static source inspector remains separately labeled.

**Explain with my AI** uses local Qwen by default or the existing ChatGPT-authenticated Astra integration. The server resolves the source identity and any selected earthquake itself, then computes proximity and supplies only the normalized source fields and explicit limitations. It does not send source photographs or the long geological description to the AI. An earthquake near a volcano is not thereby classified as volcanic, and the latest recorded eruption year does not establish current eruption or inactivity.

The source inspector exports its exact normalized record, full attributes, provenance and rendered dataset checksum. Full normalized and original WFS JSON downloads remain available. Earth figures include source citation/terms, selected record, plotted coordinates and IDs, query, symbol dimensions and the static-reference policy. These exports do not imply a live activity feed, uncertainty bounds, volcanic alert level or predictive skill.

## Verification

`node --test test/volcanoes.test.mjs` checks incomplete responses, identity and coordinate mismatches, duplicate numbers, unknown years, negative elevation, dateline proximity, source-cutoff exclusion and deterministic explanations. The complete test suite passes 49 tests at this checkpoint.

`node scripts/volcano-check.mjs` checks Chrome and WebKit fresh contexts at desktop, 390- and 320-pixel portrait, and 844×390 landscape sizes: search, empty results, expanded lists, Axial Seamount's negative elevation, Kilauea source values, JSON/source hashes, marker placement, clipping, scientific rendering, static historical reference and publication metadata. `--desktop-only` checks the full 1,214-marker view and publication details without repeating the phone layouts. The known Windows WebKit compositor issue after resizing is not claimed fixed; fresh-view tests and actual physical-device acceptance are separate.

`node scripts/volcano-picking-check.mjs` verifies visible orange triangle pixels and actual mouse/touch selection in Chrome and WebKit, including taps 20 pixels from the marker center. The initial dense-earthquake interaction failed because quake glow covered the triangle and captured its click; the visibility offset, outline, depth writing and screen-space picking fixed that observed issue.

`node scripts/volcano-cutoff-check.mjs` holds a clearly labeled test-only response until after the UI moves to an earlier replay. The response remains hidden there and is restored only after returning to an eligible live cutoff. It performs no real model call or source mutation.

`node scripts/volcano-ai-check.mjs` exercises the actual local UI and authenticated Astra integration. Both retained Kilauea's supplied elevation of **1,222 m** and latest recorded year **2026**, while excluding claims of live activity or earthquake causation. The six main application viewports, 959-event historical replay, scrub and midpoint flow were also rerun. The forecast ledger remains unchanged and valid at 282 records. Continuous volcanic monitoring, alert feeds, broader geological/model work and physical-device acceptance remain open.


A separate [Volcano activity layer](VOLCANO-ACTIVITY.md) now refreshes official USGS U.S. ground alerts and aviation codes. It has its own source receipts, historical cutoffs and Earth markers; the Holocene reference above remains a dated geological dataset.
