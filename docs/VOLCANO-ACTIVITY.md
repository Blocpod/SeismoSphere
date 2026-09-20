# Refreshed USGS volcano status

**Layers → Volcano activity** displays the official U.S. Volcano Hazards Program status feed. The app checks it on startup when due and every 15 minutes while running. The inspector shows the latest successful check, source notice publication, original date strings, ground alert and aviation code separately. A manual check is available, with a 30-second minimum between attempts. The last valid snapshot remains available after a failed request and is marked stale after 30 minutes without a successful check.

The initial actual feed contains 161 U.S. volcanoes. Four match elevated ground or aviation status: Great Sitkin and Kilauea are WATCH/ORANGE; Shishaldin and Ahyi Seamount are ADVISORY/YELLOW. These are values in the saved September 13, 2026 snapshot, not timeless status assertions. The source may change on subsequent polls.

Search, elevated/all/unassigned filters, source inspection, mouse/touch selection, source downloads and both AI backends are implemented. Triangles use the aviation color, with white for the selected volcano. Ground alerts remain explicit text because the two classifications may differ. Symbols follow terrain displacement and cutaway clipping. Publication and recording evidence include the exact displayed source records and successful-check timestamp. A source refresh changes the recording context and ends the clip while preserving the earlier evidence.

## Source and meaning

- [USGS Volcano API documentation](https://volcanoes.usgs.gov/vsc/api/volcanoApi/).
- [Original status GeoJSON endpoint](https://volcanoes.usgs.gov/vsc/api/volcanoApi/geojson).
- [Official ground-alert and aviation-code definitions](https://www.usgs.gov/programs/VHP/volcanic-alert-levels-characterize-conditions-us-volcanoes).

The API covers U.S. volcanoes, including some with insufficient monitoring information. UNASSIGNED does not mean normal, inactive or safe. NVEWS threat is a long-term threat classification, distinct from current activity. Notice synopses are attributed USGS source text; they are not forecasts by SeismoSphere. A notice's relative terms such as “today” refer to its publication context, not the application's retrieval time. A successful poll does not establish that a new notice has been issued or that the source describes every current condition.

USGS volcano codes are the stable identities in this feed. Folsoms Bluff (`ak102`) has no supplied Smithsonian number; it is retained with a missing number, not dropped or given an invented association. A timezone-qualified date can be extracted from a notice identifier. The API's separate `alertDate` and `colorDate` strings lack time zones and are preserved verbatim without guessed UTC conversion. Absent notice text, dates and long-term threat values remain missing.

This layer is separate from the [pinned Smithsonian Holocene reference](VOLCANOES.md) and the now-integrated [global weekly report feed](WEEKLY-VOLCANOES.md). The U.S. status layer must not be described as comprehensive global activity. The separate weekly inspector preserves its source publication dates and explicitly marks older reports; reporting categories are not USGS status codes.

## Persistence and historical isolation

The native SQLite tables `volcano_status_records` and `volcano_status_checks` preserve source bodies and successful polls with update/delete rejection triggers. A record identity hashes the source text plus parser version. Unchanged responses reuse their first source receipt and add a successful-check record; changed responses create new immutable records. Failed requests update the live connection state without replacing a good snapshot. Raw GeoJSON and saved receipts are downloadable.

Historical Earth selects the most recent successful check at or before its cutoff. Before the first receipt, no activity markers or source explanations are available. Future hypotheses do not display current volcano status. Delayed AI responses are withheld after an incompatible cutoff or source change. Server-side AI requests reject mixed evidence, unknown volcano codes, missing source identities, unsupported modes, and later receipts/notices. The models receive readable ISO UTC receipt/check times, explicit missing fields, the dated synopsis and coverage limitations.

Initial saved source:

- Record: `6332e898fe4667578dffef24472a7d58f62b9b534b38fc97f2c04cb1a30e6d0b`.
- Original SHA-256: `05cef0b7d9f3213577ef1879e0bd6951d531391177941fc854b425e913ff3b75`.
- Original length: 116,598 bytes.
- First receipt: `2026-09-13T15:04:21.934Z`.
- A second actual check at `2026-09-13T15:11:10.968Z` reused that same source record.

## Verification and limits

The complete suite passed 64 tests. Focused tests preserve missing identifiers, independent alert systems and timezone-qualified notice dates; reject duplicate or invalid observations; preserve historical snapshots after changes/failures; and reject SQL rewrites. The shared source downloader supports cancellation without adding a package dependency. Record reads also compare normalized values against the retained raw source; controlled corruption is rejected. A clean restart preserved both successful checks, the original receipt and the valid unchanged 282-record forecast ledger. The existing static-volcano workflow passed again in eight fresh browser contexts.

`scripts/volcano-activity-check.mjs` passed eight fresh Chrome/WebKit desktop, phone and landscape contexts. It exercises filters, Folsoms Bluff's missing number, actual mouse/touch selection, source download hashes, cutaway clipping, matching figure evidence and withholding a controlled delayed response after switching to 2011. A real refresh ended a Chrome recording while preserving its original source/check evidence. Controlled mobile failure and staleness checks retain the earlier data, enable retry, show the stale label and clear selections after an empty search.

`scripts/volcano-activity-ai-check.mjs` uses the actual UI and local Qwen plus ChatGPT-authenticated Astra. Both retain WATCH/ORANGE for the saved Kilauea notice and UNASSIGNED/UNASSIGNED for Folsoms Bluff. Their source dates are separate from retrieval dates. Invalid HTTP contexts are rejected. This verification does not make AI explanations independently authoritative.

No waveform analysis, magma geometry, causal earthquake association or forecast-engine factor is inferred from these statuses. Continuous observatory telemetry, physical-phone acceptance and the rest of the full project brief remain open.
