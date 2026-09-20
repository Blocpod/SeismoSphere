# Mapped active faults

**Faults** in the Earth toolbar opens a searchable source inspector. Enable the layer, search a name or catalog, inspect a record and choose **Locate on Earth**. **Near selected event** finds mapped traces around the selected catalog epicenter. **Below camera** queries the radial point under the camera. Both searches return up to six traces within 500 km.

## Source and preservation

The layer uses the [GEM Global Active Faults Database](https://github.com/GEMScienceTools/gem-global-active-faults), attributed to Styron and Pagani (2020), [doi:10.1177/8755293020944182](https://doi.org/10.1177/8755293020944182). The source is distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The accompanying source license is preserved in `public/assets/LICENSE-gem-faults.txt`.

The installer pins commit `56816508ad92fd6846dad1163b1c8c01376a2cd1` (2021-06-24) and verifies original GeoJSON SHA-256 `603513086b4693de6008e3444959995c34683b30dac291856340522a76d8505e`. It does not silently follow a changing branch. A future source update requires a reviewed revision/hash change.

This specific file contains 16,195 features and 161,622 line segments. All source vertices, feature order and attributes are retained. Collection-level provenance is added. No source record is merged or deleted because another record has the same catalog ID. The pinned file has repeated or absent source IDs; its feature index distinguishes records without inventing a geological identity.

Source attribute tuples retain their original values, including blanks and strings such as `nan`. The inspector explains the source's most-likely/minimum/maximum convention. Missing attributes are not filled from assumptions. A search that finds no name reports missing coverage rather than claiming there are no faults there.

## Geometry and rendering

The renderer batches the global traces into one line-segment draw object, with a separate highlighted source trace. Coral lines distinguish the mapped reference from plate boundaries and model paths. The layer uses a small visual offset above the spherical Earth to avoid surface flicker. Geological cutaway clips these lines using the same wedge planes as the Earth. It does not invent subsurface fault planes from missing dip or depth attributes.

Nearby search calculates the shortest distance from the query epicenter to each minor great-circle segment. It checks the interior projection and both endpoints, preserving the antimeridian and polar geometry. Identical endpoints use point distance. Antipodal endpoints have no unique minor arc and are explicitly identified as ambiguous, using endpoint distances rather than guessing a path. Earth radius is 6371.0088 km.

The spatial index stores endpoint unit vectors in a 7,757,856-byte Float64 array. A triangle-inequality bound skips segments that cannot enter the nearest set. Search runs in a browser worker so the main UI can continue responding. Desktop timings are evidence about this machine, not a phone performance guarantee.

Distances are to mapped surface projections. They are not hypocentral or rupture-plane distances, causal fault assignments, evidence of propagation, or calibrated hazard estimates. Mapping coverage and accuracy vary regionally. The dataset revision is a static geological reference, not a live rupture feed.

## AI and replay

The copilot now receives the selected event from the retained analysis snapshot, rather than trusting event attributes sent by a browser. A missing event ID is rejected. For fault/geology questions, the server computes nearby traces with the same geometry implementation and supplies source attributes, distance definitions, revision and dataset checksum.

Fault data received after an analysis cutoff is excluded from copilot historical evidence. The visual layer remains available as a separately labeled modern reference. It is not introduced into the Dutchsinse engine, historical input snapshots, calibration or forecast scoring. Saved conversations retain the supplied evidence context for later inspection. Frozen-forecast explanations continue using their frozen reasoning.

The local Ollama model remains the default brain; the same bounded context is available to the configured Astra brain. The model is instructed not to turn nearest-trace proximity into causation. A request to show mapped faults can open the inspector through the fixed `faults` UI action.

## Publication export and restoration

If the layer is enabled during figure capture, the SVG/JSON evidence includes its provenance, selected source feature, last proximity query and source revision. The rendered composite carries GEM attribution, a change notice and CC BY-SA 4.0 labeling. Downloads preserve the separate source credits. This does not relicense application code.

Run `node scripts/setup-faults.mjs` to restore the pinned dataset. Full asset setup also runs it. Its manifest is stored in `data/geology/faults-manifest.json`; raw source is cached under `data/geology/faults-cache/`. These generated files remain outside Git.

Restoring the same verified source retains its recorded first-retrieval time from the existing manifest, so a repair does not silently change its historical availability. Removing the manifest loses that local receipt history; the next installation records a new receipt.

## Verification

Numerical tests cover interior projections, endpoint minima, antimeridian, polar, degenerate and ambiguous geometry; whole-trace ranking; duplicate IDs; bounded searches; and exclusion after historical cutoffs. API tests verify selected-event grounding and reject IDs absent from the retained snapshot.

`scripts/faults-check.mjs` exercised the real layer in Chrome and WebKit: source load, name search, an empty search, source inspection, camera focus, nearby lookup, attributed PNG/JSON export, evidence checksum, cutaway compatibility and mobile dialog sizing. On this machine the initial runs loaded/indexed in 305–493 ms and completed the browser lookup interaction in 76–267 ms. Both engines reported no browser errors. Physical phone acceptance remains outstanding.

`scripts/fault-ai-check.mjs` also called the actual local Qwen 3.6 35B copilot. For event `USGS:ci41533416` near Coso Junction, it identified the supplied Airport Lake trace at 6.5 km (geometry result 6.545090718 km) and explained why that proximity does not establish the causative fault. The call took 42.9 seconds; this verifies a real model response, not a deterministic substitute.
