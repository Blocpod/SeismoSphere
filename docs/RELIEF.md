# Terrain and bathymetry

Layers → Terrain & seafloor loads a pinned NOAA ETOPO 2022 global elevation grid. Enable sourced relief, optionally expose below-datum terrain, and choose imagery or elevation colors. Height choices are 1×, 5×, 20× and 50×; X-ray and geological sections always use 1×. Presets locate the Himalaya, Tonga trench and Mid-Atlantic ridge. The point inspector reports both the nearest retained grid cell and the interpolated height at the requested coordinates.

## Source and restoration

The source is NOAA NCEI's ETOPO 2022 v1 **ice-surface / seafloor** 60-arc-second NetCDF grid, derived upstream from the 15-arc-second model. Heights are metres, positive upward from the EGM2008 geoid, with WGS84 geographic coordinates. Ice-covered land shows ice height, not sub-ice bedrock. Cite [NOAA NCEI, ETOPO 2022](https://doi.org/10.25921/fd45-gt74); see the [product page](https://www.ncei.noaa.gov/products/etopo-global-relief-model) and [user guide](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/docs/1.2%20ETOPO%202022%20User%20Guide.pdf).

`node scripts/setup-relief.mjs` restores the source and browser assets using native Node fetch, hashing and file APIs. The main setup script includes it. The specialized DAP2 parser checks grid dimensions, duplicate XDR array lengths, finite coordinates, regular spacing, valid heights and exact byte consumption. A missing or changed pinned source fails explicitly. No new runtime dependency is required.

The request retains source indices `4:9:10795` in latitude and `4:9:21595` in longitude: one central source cell from each 9×9 block. This is **point decimation, not a block mean**. The resulting 2,400×1,200 grid has 9-arc-minute spacing. Float32 source heights remain in the original DAP2 response; browser values are signed Int16 little-endian metres, rounded with a maximum 0.5 m quantization error. Retained source extrema are −10,445.2725 m and +7,678.3462 m, not the global unsampled extrema.

| Receipt | Value |
|---|---|
| First local reception | 2026-09-13T13:26:54.164Z |
| Original 11,549,078-byte DAP2 subset SHA-256 | `655f4b486080aa9983a28ae52a44d3f2f547224dcdcdaa6b439e5861b25a2e8b` |
| Source attributes SHA-256 | `719939e2f21687bbea552e898f3ce0bb7b9a5b25fb781507e2e4e4360f4b61da` |
| 5,760,000-byte display grid SHA-256 | `6466f4468cef8942e5bafd4ca1a1d0fb728b221e9bf857e86f6e06a994846a5c` |

The checked-in pin is `config/relief-source.json`; raw files live under ignored `data/geology/relief-source/`. Browser assets live under ignored `public/assets/`. Repeated setup validates the existing hashes and retains the first reception time. The dialog downloads the original subset, metadata and packed display grid. The browser validates its grid hash before use; the API verifies raw exports.

## Geometry and evidence

Bilinear interpolation wraps longitude. Polar caps converge to the mean of the last retained latitude ring; these means are not observations at the poles. Heights are placed radially on a sphere of radius 6,371,008.8 m. There is no EGM2008-to-WGS84-ellipsoid conversion. Below-datum values are flattened to zero unless exposed. Positive displayed land lifts surface overlays; ocean markers remain projected above the reference datum. True hypocenter coordinates and depths are unchanged.

The mesh contains 525,825 vertices on desktop and 131,841 on mobile. Normals come from the displaced geometry; the decorative normal map is disabled. Cinematic relief adds a camera-following inspection light and moves decorative cloud/atmosphere shells outward to clear raised land. These are display choices, not solar or atmospheric measurements. Scientific mode remains unlit. The outer edge of each section's schematic crust face follows true-scale relief; its existing 35 km inner boundary is still schematic, not a measured local Moho.

Figures and recordings retain the source pin, actual and requested scales, below-datum setting, color mode, vertex count, lighting description and selected source sample. Changing relief settings ends a recording and preserves its original scene evidence. Static reference geometry may be viewed with historical catalogs, with its source date disclosed. The AI rejects a cutoff before source reception and withholds late responses after the user moves to an earlier cutoff.

At the Tonga query −22°, −174°, the nearest retained cell is −21.975°, −174.075°, rounded to −7,823 m; the interpolated value is approximately −8,399 m. The extra reported decimal places do not imply survey precision. Actual local Qwen and subscription-backed Astra explain these separate values, the geoid, point sampling and display-only exaggeration without issuing model actions.

## Verification and limits

`node --test` covers parser rejection, interpolation, poles, longitude wrapping, source/display separation and historical evidence guards. `scripts/relief-check.mjs` checks eight fresh Chrome/WebKit layouts, actual GPU surface pixels, source-derived vertex radii, unchanged hypocenters, exact overlay restoration, section scale, scientific capture and downloaded source/figure hashes. Its measured frame-interval medians were 16–17 ms on this machine; this is not physical-phone performance evidence. `scripts/relief-ai-check.mjs` exercises both real brains and invalid/mixed API context rejection. `scripts/relief-integration-check.mjs` covers raised-terrain station picking, numerical section edges, recording scene changes and delayed AI cutoff behavior.

This static global grid can miss small islands, narrow trenches and individual peaks. It is not a local survey, tide model, crust-thickness model or stress input. Regional detail, the requested final visual quality and physical-device acceptance remain open. The existing Windows WebKit resize/compositing limitation also remains; fresh viewport checks do not establish real Safari rotation support.
