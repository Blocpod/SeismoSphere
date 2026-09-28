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

Geographic projection validation, independent end-to-end Coulomb comparison, saved-run comparison and matched forecast evaluation remain unfinished.

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
