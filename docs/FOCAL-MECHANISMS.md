# Published focal mechanisms and moment tensors

Select a retained USGS earthquake, open **Mechanism** in the Earth toolbar, and choose **Inspect selected earthquake**. The server requests the event's public ComCat detail and saves its original JSON, SHA-256 source receipt, selected catalog revision, product identities and normalized solution fields. Saved receipts can be reopened from the menu. An event without a usable public solution remains without one; the app does not estimate a mechanism from magnitude, depth or nearby faults.

Public `moment-tensor` and `focal-mechanism` products are eligible. Internal USGS moment tensors are excluded from the displayed solution list. Deleted or rejected solutions cannot drive the diagram. The default selects the highest USGS preferred weight among eligible solutions; the user can compare the other products. Neither preferred weight nor double-couple fraction is forecast confidence.

## Scientific conventions

The six complete tensor components use the USGS/QuakeML basis **r up, t south, p east**, in **N m**. A theoretical P-radiation sign is `nᵀ M n`. The 2D diagram uses a lower-hemisphere Lambert equal-area projection, north up and east right, with black for nonnegative and white for negative radiation. It retains the full published tensor, including non-double-couple components. If only a valid nodal plane exists, it renders a unit double-couple reconstruction and labels that substitution; its normalization is not scalar moment.

The 3D sphere uses the same tensor signs transformed from local north/east/down into the application's Earth coordinates. Its mesh interpolates vertex colors at radiation boundaries. Amber and cyan circular outlines show the orientations of published nodal planes 1 and 2. These are symbolic plane outlines, not finite fault surfaces. Neither identifies the actual rupture plane without independent evidence.

The glyph uses the complete tensor-derived latitude, longitude and depth when available. Otherwise it uses the saved catalog hypocenter and identifies that fallback. The UI retains both origins separately. The glyph's fixed radius of 0.035 Earth radii serves visibility only: it represents neither rupture extent, stress influence nor magnitude. Its center follows the current Earth depth exaggeration and the existing 0.04-radius core clamp; cutaway mode restores true depth. **Locate in X-ray** makes the subsurface center inspectable. Geological clipping applies to the glyph and both plane outlines.

The USGS property named `percent-double-couple` can contain a QuakeML fraction: the verified sample contains `0.9706`, displayed as **97.06%**. The parser converts only a value from 0 through 1 accompanied by a QuakeML public ID; otherwise it retains the raw field and reports the normalized fraction unavailable. QuakeML defines doubleCouple as a decimal fraction, not a confidence score. Missing coordinates, incomplete tensors and missing scalar moments remain unknown.

Primary references:

- [USGS GeoJSON event detail and product inventory](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php).
- [USGS moment-tensor product fields and units](https://ghsc.code-pages.usgs.gov/hazdev/pdl/userguide/products/known-types/moment-tensor.html).
- [QuakeML 1.2 BED specification](https://quake.ethz.ch/quakeml/docs/REC?action=AttachFile&do=get&target=QuakeML-BED-20130214.pdf), tensor and MomentTensor definitions.
- [USGS QuakeML-to-product property mapping](https://usgs.github.io/pdl/userguide/quakeml.html).

## Persistence, cutoffs and AI

The record is immutable in SQLite. Requests reuse a receipt tied to the selected event's catalog revision and installation observation time; an explicit API `refresh` can retain another source snapshot. At most one mechanism retrieval runs at a time, using the existing 45-second / 16 MB source reader. The history menu lists the latest 40 receipts; earlier IDs remain exportable. There is no background mechanism poll or reconstruction of historical product revisions.

Both display and AI reject an event or product updated after the analysis cutoff. Strict replay additionally requires this installation to have received the mechanism before the cutoff. A new network fetch cannot satisfy an earlier strict cutoff. Revised-catalog mode can inspect a current archived product whose last update predates the cutoff, while disclosing that this does not prove historical availability. Switching to an ineligible cutoff hides the diagram, glyph and explanation controls.

**Explain with my AI** uses the configured local Qwen brain or the existing authenticated Codex/Astra subscription integration. The server resolves the retained record and selected product itself. It supplies normalized metadata, tensor values, both planes, origins and limitations; large raw product properties and content inventories are omitted from the AI context. Scalar moment also has an explicit scientific-notation string. An explanation that fails to preserve that exact required string is withheld. This focused check is not a general mathematical or factual validator of language-model prose; the published values remain authoritative.

JSON exports include the original source text and integrity checks. `raw=1` returns that exact source JSON text. Diagram SVGs embed the chosen product, event, receipt, projection and interpretation; the radiation diagram is a raster within the SVG. Earth publication evidence includes the visible mechanism, center convention, symbolic size and depth scaling. No slip distribution, finite-fault dimension, stress tensor field, Coulomb calculation or predictive skill is inferred.

## Verified record and checks

USGS `us7000tgrk`, M6.5 north of Teluknaga, Indonesia, has a retained catalog depth of **372 km**. The preferred public Mww tensor origin is **340.5 km** deep, scalar moment **6.75e+18 N m**, double-couple fraction **0.9706**. Its planes are **148.02 / 89.34 / −59.97°** and **239.16 / 30.03 / −178.69°** (strike/dip/rake). All three public Mww/Mwc/Mwb solutions were retrieved. Receipt ID: `b3b2c1c068e768af2dc4695efc71131b56a14ffaed066630b75d72cf4b36f81e`.

`node --test test/mechanisms.test.mjs` checks projection, normal/reverse/strike-slip signs, the near-equivalence of both published planes, NED/Earth coordinates, null/status parsing, immutable receipts, revision caching, cutoff rejection and AI exponent corruption. `node scripts/mechanism-check.mjs` checks the actual application in Chrome and WebKit at 1536×1024, 390×844, 320×740 and 844×390: source/body hashes, product selection, black/white diagram pixels, three 3D parts, exact 1×/5× center radii, cutaway clipping/restoration across scientific rendering, no horizontal overflow, SVG metadata, publication evidence hash and earlier-cutoff hiding. It uses fresh viewports; it does not claim the known Windows WebKit resize-compositor defect is resolved.

`node scripts/mechanism-ai-check.mjs` exercises the selected-event query and local explanation through the actual UI, then the authenticated Astra integration. The first local run corrupted the moment exponent; the explicit scientific string and rejection check were added, and a fresh local/Astra run preserved `6.75e+18 N m`, both planes, both depths and the double-couple fraction. Physical Safari/Android acceptance and the remaining full-platform work remain open.


## Finite-fault source inventory

The inspector also reads public finite-fault products from the exact retained USGS detail JSON. Existing immutable receipts are not rewritten. It lists revision dates and official HTTPS links for Coulomb INP, slip FSP/PARAM and GeoJSON model-map files. Withdrawn or post-cutoff products have no actionable file links; strict replay also requires a receipt predating its cutoff. “Fetch a new source revision” requests another immutable receipt through the existing API. No finite-fault product is an explicit empty state, not an inferred zero-slip model.

The file inventory is exportable even for events without a usable focal mechanism. Linked file bytes have not yet been archived or interpreted. This is the source-discovery step toward the required stress engine, not a completed Coulomb calculation, rupture reconstruction or forecast. File formats and interpretation follow [USGS finite-fault documentation](https://earthquake.usgs.gov/data/finitefault/).

Verification: five focused finite-fault/mechanism tests pass, covering official-host links, withdrawal, revised/strict/future cutoffs and existing receipt integrity. A live USGS request for Illapel 2015 (`us20003k7a`) found Coulomb INP, PARAM, FSP and GeoJSON files at product revision `1539809967421`. The running UI displayed the existing Indonesia receipt and its explicit no-finite-fault state; screenshot `artifacts/finite-fault-inspector.png`. Populated-link UI and physical mobile acceptance remain unverified.


## Archived Coulomb inputs

“Archive & inspect input” now downloads the selected official Coulomb file through the bounded source reader, resolves its URL from the retained inventory on the server, and stores exact text, checksum, reception time, source-product identity and parsed patches in immutable `rupture_inputs` records. The JSON export verifies both the complete record and original text. Repeated requests reuse the archived record. Strict replay requires both the parent inventory and file receipt to predate the cutoff; new downloads cannot fill an earlier strict history.

Supported parsing is deliberately explicit: rake/net-slip columns, Kode 100, zero regional-fault counts, matched fixed-row count, finite coordinates/slips, valid dip/depth geometry, map origin and matching elastic input pairs. Other encodings fail instead of guessing slip signs. Horizontal/depth coordinates remain km, slip m and angles degrees. Young's modulus stays in original source-file units pending the solver's independently verified conversion. No stresses, rupture triangles, receiver-fault assumptions or forecast scores are computed yet.

Seven focused tests pass (`node --test test/rupture-inputs.test.mjs test/finite-fault.test.mjs test/mechanisms.test.mjs`). The actual application archived Illapel 2015 through the UI: 450 patches, 53,579 bytes, source SHA-256 `28b012f858f68074a93882cdd5dab08b6e9e511dd253f021cd22d58ed9f5346c`, retained record `391de152174904958ddfb09c7c6870e492bf651b81b56ce472b644afb9dc402b`. Its HTTP export reports both integrity checks true. The full stress/comparison requirement remains open.
