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

The interactive stress explorer, geographic projection validation, independent end-to-end Coulomb comparison, and matched forecast evaluation remain unfinished.

## Primary references

- [cutde documentation and implementation](https://github.com/cutde-org/cutde).
- [Nikkhoo & Walter triangular dislocations](https://academic.oup.com/gji/article/201/2/1119/572006).
- [USGS Coulomb3 user guide](https://pubs.usgs.gov/of/2011/1060/).
- [USGS finite-fault source models](https://earthquake.usgs.gov/data/finitefault/).
