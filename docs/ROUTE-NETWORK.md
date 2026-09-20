# Directed route network

Open Tools → Route network. Changes are drafts until Save and use new version. The editor supports ordered latitude/longitude waypoints, surface picking, first-to-last or reversed direction, explicit outgoing route IDs, termination reflection, per-route source records, history and JSON import/export. Preview draws arrows on the globe; amber is illustrative and turquoise is source-traced. Escape returns to the editor. Historical versions can be loaded and saved as a new revision, without rewriting history.

A connection must explicitly name another route whose directed start matches the current directed end within 1 km. Nearby faults, slabs, plate boundaries and cratons never generate connections. A termination cannot have outgoing connections. A source-traced claim requires an HTTP(S) URL and a map/page/video locator. It records trace provenance, not independent validation of the hypothesis. Initial routes remain illustrative.

The network is a directed waypoint graph with immutable SHA-256 revision IDs. Every save records its parent, date, note and full geometry/provenance. Database triggers prevent updates/deletions. Stale base revisions are rejected. GET /api/routes returns the active version and history; ?version=ID retrieves a verified prior version. POST /api/routes-preview validates without saving; POST /api/routes-save saves and activates atomically. Import never fetches source URLs or creates reference-derived paths. Existing forecast snapshots, issued records and result reviews remain intact.

Engine 0.3.0 applies the requested rules:

- Deep initiation: catalog sources deeper than the configured threshold initiate directed walks from a waypoint inside the capture radius.
- Directional transfer: follow entered waypoints and explicit branches, bounded to 1–12 steps; this is an inferred path, not a measured flow.
- Fulcrums: both great-circle event midpoints and length-weighted midpoints along entered routes.
- Silence: local catalog-release contrast relative to sources contributes positive or negative evidence; absent catalog events do not establish complete detection.
- Equidistant progression: temporally ordered route anchors can target a downstream waypoint within 15% of their along-route separation.
- Craton progression: only explicitly entered craton-edge hypotheses receive the craton progression factor; the reference dataset does not enter routing.
- Termination/reflection: a walk reaching an entered termination reverses along that path when the reflection rule is enabled.
- Swarm redistribution: descriptive clusters feed the configured routes, with source events retained in the evidence. Toggle swarm in Mission settings.
- Magnitude: adjacent maximum, configured deep escalation, approximate Mw-equivalent moment sum, or completed historical-analogue outcome median with explicit fallback.
- Forecast duration: the configured 7–10-day window, unchanged after issuance.

Computational ceilings remain explicit: strongest 180 significant events; at most 24 deep initiators; 64 walks per initiator; eight descriptive two-degree swarm bins and 30 strongest retained sources per bin; eight route anchors per route. Anchoring uses entered waypoints, so add waypoints to represent a corridor accurately. These heuristics are configurable research methodology, not validated earthquake probabilities. Empty or incomplete source geometry is never invented. Earlier stored research runs retain their original engine versions and results. The randomization reproduction tool selects the archived 0.2 implementation for existing 0.2 exports. New 0.3 runs use the new engine; existing protocols retain their original frozen source files.
