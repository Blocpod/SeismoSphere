# Static stress calculation

The local numerical engine calculates static stress changes from archived, validated USGS Coulomb rake/net-slip fault patches. It uses pinned `cutde 26.3.6` CPU half-space triangular dislocations. Install with `scripts/setup-stress.ps1`; this installation already has the solver. This is an analytical calculation, not a timed earthquake forecast, a measured stress field, or an operational alert.

## Inputs and conventions

`POST /api/rupture-stress-query` takes `sourceId` from the rupture archive, elapsed `asOf`, `mode` (`strict` or `catalog-replay`), explicit `poisson`, `shearModulusGPa`, `friction`, `receiver` (`strike`, `dip`, `rake` in degrees), and `points` (`xKm`, `yKm`, `depthKm`). Coordinates are source-local east/north offsets and positive-down depth. The endpoint does not convert geographic positions or silently choose a receiver plane. It does not convert the source file's Young modulus; the shear modulus is an explicit input.

Rectangular patches are split into two triangles with upward normals. Rake zero is along strike; positive 90 degrees is up dip (reverse slip). Lengths become meters before computation, and elastic moduli become Pa. The tensor order is xx, yy, zz, xy, xz, yz. Normal traction is positive in tension (unclamping). Receiver shear is resolved along the specified rake; Coulomb change is shear plus effective friction times unclamping. No additional pore-pressure model is applied.

The solver assumes a flat, traction-free surface and homogeneous isotropic linear elasticity. It excludes points within 100 m of any source patch, returning null rather than unstable near-source values. Topography, elastic layering, dynamics and viscoelastic evolution are absent. Inputs are bounded to 4,096 points, 10,000 patches and five million point/triangle interactions; the existing scientific-worker runner enforces a 120-second deadline and process-tree cleanup.

## Saved evidence

Source inventory, exact rupture file, parsed patches and source reception time are immutable. Strict replay requires a file receipt available before its cutoff; revised-catalog mode does not establish historical availability. Calculations retain source ID/checksum, exact options, cutoff/mode, solver version, output, and the exact Python implementation with its checksum. Equivalent requests reuse the saved result. Results are immutable in SQLite. `GET /api/rupture-stress-export?id=...` exports the result and its archived source. It does not issue a forecast or modify the ledger.

## Checks and limits

`node --test test/stress.test.mjs test/rupture-inputs.test.mjs test/finite-fault.test.mjs` passes four focused tests. The Python check compares six selected strains to a pinned upstream MATLAB half-space fixture, verifies zero free-surface normal/shear traction, slip/modulus scaling, reversed slip, zero slip, analytic receiver traction, masking and invalid inputs. The fixture records its original URL, commit and file checksum. These tests are not a full independent comparison against Coulomb3 or evidence of forecasting skill.

The actual local API calculated 441 points for the archived 2015 Illapel model on a 20 km grid spanning ±200 km, at depth 10 km. Explicit assumptions: Poisson 0.25, shear modulus 32 GPa, effective friction 0.4, receiver strike/dip/rake 19/19/90 degrees. All values were finite, none were masked, and both result/implementation hashes passed. Saved result: `6f4df72da088c20000eac139d9da14764b1d8134aa1c65a6ffa15dd8c7c83357`. Local export: `artifacts/illapel-static-stress.json`. This receiver orientation is a test assumption, not identification of real future rupture surfaces.

Geographic projection validation, independent Coulomb3 application-level comparison and matched forecast evaluation remain unfinished. Saved-run comparison is available as described below. The independent rectangular-kernel comparison below now covers local geometry, units and traction projection.

## Primary references

- [cutde documentation and implementation](https://github.com/cutde-org/cutde).
- [Nikkhoo & Walter triangular dislocations](https://academic.oup.com/gji/article/201/2/1119/572006).
- [USGS Coulomb3 user guide](https://pubs.usgs.gov/of/2011/1060/).
- [USGS finite-fault source models](https://earthquake.usgs.gov/data/finitefault/).


## Interactive explorer

Open **Layers → Mechanism**, select a saved source receipt (or inspect an event), then **Archive & inspect input** on a published Coulomb input. The stress explorer accepts receiver strike/dip/rake, Poisson ratio, shear modulus, effective friction, depth, source-local center offsets, half-width and 11×11 / 21×21 / 31×31 resolution. Initial receiver and material values are displayed assumptions, not inferred receiver geology. Calculate explicitly to create a saved result.

The square sampling plane plots exact solver samples without interpolation. Blue is negative Coulomb change, orange positive, pale zero, and dark masked. A symmetric color limit in MPa can be edited; the displayed count discloses saturation. Click/tap a cell or use the keyboard-accessible sample slider to inspect exact position, shear, unclamping and Coulomb change. The export link returns the saved calculation and source. Editing calculation parameters hides the previous output; responses arriving after such edits or source changes are discarded. Cutoff changes hide ineligible source/results.

Actual UI verification: Illapel's 450-patch archive produced 441 displayed samples at 10 km with receiver 19/19/90 degrees, 32 GPa, Poisson 0.25 and friction 0.4. Keyboard inspection moved to sample 222 at east 20 / north 0 km: Coulomb −0.382249 MPa, shear −0.514738 MPa and unclamping +0.331224 MPa. The 1 MPa scale reported 14 saturated samples; changing it to 0.5 MPa reported 27. At an emulated 390×844 viewport, fields and numeric readout wrapped within the phone layout and the scale control worked. Editing depth to 12 km hid the old result. Physical mobile devices, all breakpoint combinations and a completed browser file download are not established by this check. Screenshots: `artifacts/stress-explorer-desktop.png` and `artifacts/stress-explorer-phone.png`.


## Reproduce an exported calculation

Run `node scripts/reproduce-stress.mjs EXPORTED_JSON` from the repository. The command verifies the complete source/result chain, requires the locally installed Python solver source to match the saved implementation exactly, reparses the original Coulomb text, and recalculates the numerical report using the bounded worker. It never executes code embedded in an export. Exact report equality is required; a different platform's floating-point result is reported as a mismatch rather than silently accepted.

Both retained 441-point Illapel reports reproduced exactly: the initial API result `6f4df72da088c20000eac139d9da14764b1d8134aa1c65a6ffa15dd8c7c83357` and actual UI result `6db38cfcd7451cb8c92a2db95336f43415b32d8531093ee0852edbd5b02636ed`. All five source/result/implementation integrity flags pass in the running HTTP export. Tests reject changed source text, substituted source IDs and altered result bodies. These are integrity and repeatability checks, not independent scientific validation or proof of source authorship.


## Reopen saved runs

After opening an archived input, use **Saved stress calculations**. It lists retained results for that exact source, with reception time, sample count, depth and receiver orientation. Selection verifies all five export integrity flags and source identity before restoring the form and plot. No calculation is rerun. Strict history filters out results created after the selected cutoff; loading also checks the current cutoff. Late responses cannot replace a changed source or edited form.

Stored point order is not assumed: regular square grids are reordered north-to-south, west-to-east for display while preserving coordinate/value pairs and the immutable original report. Irregular, duplicate, missing or mixed-depth grids are rejected by the plot (their original JSON remains exportable).

Three focused grid/persistence tests pass. Following a real server restart, the UI reopened result `6f4df72da088c20000eac139d9da14764b1d8134aa1c65a6ffa15dd8c7c83357`, originally stored in a different point order. The restored east 20 / north 0 / depth 10 km sample matched −0.382249 MPa Coulomb change and its saved shear/normal terms. History remained at two records, confirming that browsing did not create another run. Screenshot: `artifacts/stress-history.png`.

## Independent rectangular-fault comparison

`scripts/stress-independent-check.py` compares the production triangular-patch adapter with the separate [OkadaPy 0.0.1](https://pypi.org/project/okada/0.0.1/) rectangular-dislocation implementation. OkadaPy is an optional external validation tool, not an application dependency or bundled component. Install it separately with `data/model-runtime/Scripts/python.exe -m pip install --no-deps --only-binary=:all: --target data/stress-reference okada==0.0.1` on this Windows/Python 3.12 installation, then run:

```powershell
.\data\model-runtime\Scripts\python.exe scripts/stress-independent-check.py data/stress-reference/okada/core/src/libokada.cp312-win_amd64.pyd artifacts/illapel-static-stress.json
```

The optional final argument adds a real exported source/options pair; omit it to run the synthetic matrix alone. The adapter calls the external native library directly, avoiding its plotting dependencies. It converts rake/net slip to right-lateral/reverse components, derives Young's modulus from the explicit shear modulus and Poisson ratio, and reorders the reference tensor. Receiver traction is independently projected without calling the production projection helper.

Verified 97 cases / 1,305 samples: four strikes, three dips (including vertical), four slip directions, surface and 6 km depth, plus all 441 points of the 450-patch Illapel model at 10 km. All six tensor components and resolved shear/unclamping/Coulomb values satisfy `abs(error) <= 0.0001 Pa + 1e-7 * abs(reference)`. Maximum absolute differences were 0.001257 Pa for tensor components and 0.001609 Pa for resolved values. These maxima occur within the combined relative/absolute tolerance; they are not claims of geological accuracy.

Reference binary SHA-256: `ad5e1b5f214003c23607dda8cd553a5dec9c653f93046f3926af95aa76e9dc47`. Compared export SHA-256: `dbef44e3faee58e34eb5632628d0c3b577d6b4591924d64756ff461fb4defc29`. The script prints the actual hashes on each run and fails on numerical disagreement. This establishes agreement of these local-coordinate static calculations with another analytical implementation. It does not validate geographic projection, real fault/receiver assumptions, the full Coulomb3 application workflow, or earthquake forecasting skill.

## Compare saved assumptions

With a result open, choose **Compare against saved calculation**. The plot and sample inspector show **current minus baseline**, using the existing symmetric MPa scale. Baseline receiver, elastic assumptions and solver version are displayed alongside a link to its complete export. Choose **Show current calculation only** to restore absolute values. Both original records remain unchanged.

Comparison requires the same archived source and identical sample locations/depth. Original storage order may differ; coordinate/value pairs are reordered before subtraction. A sample masked in either run remains masked. Different grids are rejected without interpolation. Five integrity flags, strict cutoff availability and late-response guards apply to the baseline as well as the current result.

Four focused grid/persistence tests passed. In the running UI, the two original Illapel runs compared to zero despite different storage order. A new run with friction 0.6 (`1a90407536fdba3832335c8ead3694010c3faa99ba8b98b0d93f361050fca58b`) compared against the 0.4 baseline: at east 20 / north 0 / depth 10 km, Coulomb difference +0.0662449 MPa and zero shear/unclamping differences. Switching back restored −0.316004 MPa absolute Coulomb stress. This is parameter sensitivity, not improved forecasting accuracy. Screenshot: `artifacts/stress-comparison.png`.

## Geographic consistency gate

An INP map origin does not identify its projection. The [current USGS exporter](https://github.com/DOI-USGS/neic-finitefault/blob/main/src/ffm/eventpage_downloads.py) derives local centers with WGS84 geodesics, but this convention cannot be assumed for older products. The archived 2015 Illapel patches instead agree closely with spherical azimuthal-equidistant coordinates using the application's 6,371.0088 km radius.

`node scripts/check-stress-coordinates.mjs artifacts/illapel-static-stress.json artifacts/illapel.fsp` verifies the immutable source/result chain, reparses the source, and compares reconstructed 3D patch centers against latitude/longitude in the [same product's FSP file](https://earthquake.usgs.gov/product/finite-fault/us20003k7a/us/1539809967421/complete_inversion.fsp). It requires explicit center/column headers, matching patch count, depth, slip and rake, then rejects geographic discrepancies above 50 m. The FSP local X/Y columns are not treated as geographic positions. No source or calculation is modified.

All 450 Illapel centers passed: maximum 12.8407 m, RMS 6.88354 m. Companion FSP SHA-256: `1d2137f6cc1b6644942119098215f33430b7c6f1d6ff753251c6472225740631`. A focused test rejects shifted origins, mismatched slips/counts and ambiguous center conventions. These residuals measure file-to-file consistency, not real rupture-location uncertainty. Other projection conventions and the globe stress overlay remain unfinished; this check does not authorize assuming the same projection for other models.

### Archived companion verification in the app

After opening an archived rupture input, select its **Geographic companion file** and use **Archive & verify geographic placement**. The server resolves the URL from that exact source product, checks the declared byte length, saves the original text and reception time, and runs the same center-consistency gate. Supported results retain the spherical mapping and residuals. Unsupported or inconsistent files retain a failed verification receipt without authorizing geographic placement. No client-supplied URL is fetched.

`POST /api/rupture-projection-query` accepts `sourceId`, optional `fileName` (required if ambiguous), `asOf` and `mode`. Repeated requests reuse the immutable receipt. Strict replay permits only receipts available by the cutoff and never downloads a new companion. `GET /api/rupture-projection-export?id=...` includes the companion, archived rupture source, and five integrity flags. Source changes and late replies cannot replace the current UI; cutoff changes hide unavailable receipts.

Four focused coordinate/archive tests passed, including strict hindsight rejection, exact bytes, reuse, database immutability and retained failures. Following server restart, actual UI archival saved Illapel receipt `2001a3547eec07358d90c0f0732e715d53ca778de1d5293d15676d40c2eb46ce` (44,092 bytes); all five HTTP export integrity flags pass. Screenshot: `artifacts/stress-geographic-receipt.png`.

## Stress samples on Earth

With a saved calculation and successful companion verification loaded, enable **Show verified stress samples on Earth** or choose **Locate stress in X-ray**. The latter opens a close view of the source origin with a translucent surface. The layer uses actual sample depths, the current Earth depth scale and its disclosed core clamp. Symbols are fixed-size squares; they do not represent rupture extent. Masked samples are omitted, and no interpolation is introduced. Normal opaque Earth occludes subsurface samples; geological cutaways apply their clipping planes.

The globe and explorer share the signed MPa palette and saturation limit. Selecting a comparison displays current-minus-baseline values on both. **Inspect samples** reopens the numeric explorer; **Hide stress** disables the layer. A separate **Calculated stress** section and source note identify it in the layer list. Figure evidence includes the current result, optional baseline, full companion verification, source identity/checksum, depth scale and color limit. Figure/video evidence integration is implemented; completed artifact downloads and physical XR acceptance are not established by the current check.

The layer requires a matching verified source, eligible results and companion receipt, a valid color scale, and observed time. It hides on invalid edits, changed sources, unavailable strict cutoffs or future view. Rendering reuses geometry until the result, comparison, depth scale or color limit changes; replacing a layer disposes its GPU geometry/materials.

Four focused geometry/grid/coordinate tests pass, including dateline/polar placement, depth radius and signed colors. Actual UI verification displayed the retained 441-point Illapel grid at 10 km beneath Chile, opened X-ray through the new shortcut, and hid the layer in +10D view. No browser errors were logged. Screenshot: `artifacts/stress-globe.png`. Physical mobile/XR rendering, further projection conventions and matched forecasting remain open.

Mobile/export follow-up: at an emulated 390×844 viewport, the stress locator now allows a regional camera close-up instead of the normal mobile whole-Earth framing. The complete 441-sample grid and caption controls fit visibly, and the layer summary reports seven active layers including calculated stress. The viewport override was reset afterward. Screenshot: `artifacts/stress-globe-phone.png`.

Figure and video renderers share a two-line stress legend with signed MPa scale, current-minus-baseline disclosure when applicable, sample depth, receiver orientation, depth scaling and forecast limitation. Two focused geometry/legend tests pass. An actual 2400×1800 figure capture completed with the stress legend visible in its preview (evidence prefix `e1783d14cdc0`); screenshot `artifacts/stress-figure-preview.png`. Completed browser downloads, encoded video legend acceptance and physical devices remain unverified.

## Geographic sample export

The verified explorer offers **Download geographic samples GeoJSON** after source-specific geographic validation. It exports every sample, including masked points with null stresses, in the displayed grid order. Values are unclipped Pa; comparison mode is explicitly current minus baseline. Result/source/projection identifiers, source hash, material/receiver options and projection validation accompany the collection.

Coordinates contain longitude and latitude only. Source-model `depthKm` remains a property: it is not assumed to be ellipsoidal height (see RFC 7946, https://www.rfc-editor.org/rfc/rfc7946#section-3.1.1). Coordinates follow the companion-checked spherical mapping; no ellipsoidal datum transformation or location-accuracy claim is made. Display depth scaling and color saturation never alter this data. Full immutable source/calculation JSON remains available separately.

Four focused export/grid/picking tests pass. An actual 441-feature Illapel artifact was generated from the live integrity-checked archive at `artifacts/illapel-stress-samples.geojson`; its center reproduces the model origin and exact saved stresses. Browser download completion and GIS application import remain unverified.

## Saved-sample copilot

**Explain this stress sample with my AI** uses the configured local/Astra brain and the selected saved grid sample. Server context verifies the immutable calculation, implementation and source hashes; checks source availability and calculation creation time; and rejects mixed evidence requests or invalid indices. Optional baseline comparisons require the same source and exact sampling locations. No workspace actions or forecast issuance are permitted from this explanation context.

The numerical sample sentence, receiver/friction sentence and explicit comparison/masking sentence must survive the model response or the answer is withheld. This guards those quoted facts, not every generated claim. Client responses are suppressed after sample, source, result or comparison changes. The deterministic provider renders the same evidence without a model call.

Actual Qwen 3.6 35B and ChatGPT-authenticated gpt-6-astra calls preserved Illapel sample 221, including −0.391640 MPa Coulomb, −0.514293 MPa shear, +0.306632 MPa unclamping, receiver 19/19/90°, friction 0.4, unmasked status and no baseline. Both returned no applied actions. An initial local answer incorrectly described a baseline and an initial Astra answer lacked mask status; explicit retained state plus response guards addressed those errors in subsequent actual calls. Four focused checks pass; the restarted HTTP API rejects negative sample indices, later-created calculations at earlier cutoffs and mixed event context with HTTP 400. Interactive UI and delayed-response acceptance remain pending. Artifacts: stress-ollama-verified-ai.json and stress-codex-verified-ai.json.

## Published rupture outlines on Earth

With a geographically verified calculation open, enable **Show published rupture patch outlines**, then **Locate stress in X-ray**. Amber rectangular outlines depict the archived inversion's source patches. They use the same top edge, right-hand down-dip direction and top/bottom depths as the solver. Depth exaggeration and section clipping apply consistently; original model coordinates remain unchanged. Outlines are distinct from stress-colored receiver samples and do not imply a measured fault surface, uncertainty bounds or slip animation. Figure/video legends and evidence retain whether outlines were shown.

Four focused checks cover strike/dip geometry, true depths, legend disclosure and unchanged sample picking. The actual 450-patch Illapel source rendered with its 441 receiver samples on desktop and at a 390×844 phone close-up, without browser errors. Screenshots: artifacts/rupture-outlines-desktop.png and artifacts/rupture-outlines-phone.png. This is a source-specific published inversion view, not a global subsurface fault model.
