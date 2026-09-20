# Slab2 regional surfaces

**Layers → Slab surfaces** opens 27 published regional depth grids. Choose a region, enable its surface, color by signed depth or PDF depth standard deviation, adjust opacity, and locate it inside the Earth. Mouse clicks and touch taps on the exposed mesh inspect the nearest retained vertex. The coordinate form also inspects masked nodes. Original depth, uncertainty, dip, strike and thickness XYZ files can be downloaded from the inspector.

The implementation contains 1,021,034 finite grid nodes and 293,656 supplementary nodes. It loads one region at a time. Desktop meshes connect adjacent valid nodes; mobile meshes use every second node only when all intervening cells are finite. Missing source cells remain open. The supplementary branches are separate points; they are not flattened or joined into a guessed surface. Their original CSV files are available for inspection.

X-ray exposes subsurface geometry. Orbital picking rejects a mesh hidden behind the Earth. Cutaway uses true depth and preserves the slab's actual three-dimensional shape. The separate earthquake/contour profile projects its corridor onto the section plane; these are different representations. Leaving the section restores the prior display depth scale. Scientific view, publication captures and camera recordings include the surfaces and source evidence.

## Source and restoration

The source is the original March 2018 archive from [Hayes (2018), Slab2, USGS data release](https://doi.org/10.5066/F7PV6JNV), with [publication DOI](https://doi.org/10.1126/science.aat4723). The [official USGS landing page](https://www.usgs.gov/data/slab2-a-comprehensive-subduction-zone-geometry-model) identifies CC0 1.0. The [ScienceBase record](https://www.sciencebase.gov/catalog/item/5aa1b00ee4b0b1c392e86467) supplies `Slab2Distribute_Mar2018.tar.gz`.

- Archive length: 140,213,438 bytes.
- SHA-256: `3f53a835bfff6196eb89912deed131855fc525dc5e1332f2c5459b1e3b9f7b1d`.
- First receipt by this application: `2026-09-13T14:21:09.658Z`.
- Pin: `config/slab-surfaces.json`, including each original and converted file hash.
- Retained archive, receipt, catalog metadata and original text files: `data/geology/slab2-volume/`.
- Browser grids: `public/assets/slab-surfaces/`, 154,193,756 bytes across all regional grids and supplements.

From the project root, use Node 24 and Python with NumPy:

```powershell
node scripts/download-slab-volume.mjs
python scripts/setup-slab-surfaces.py
```

Use the available Python executable's absolute path if needed. NumPy is already present in this workspace's bundled Python; no additional package was installed for this converter. This is a separate restoration step from `node scripts/setup.mjs`. ScienceBase ignored HTTP Range for this archive; interrupted initial downloads restart, while a complete verified archive is reused. Restoration uses the retained application's receipt and source hash from the pin if the local receipt file is absent. It does not invent an earlier observation receipt for a newly changed source.

The converter reads selected archive members without extracting arbitrary paths. It validates matching field coordinates, regular axes, cell counts and masks. A repeat conversion must reproduce the existing pin. Derived files are hash-checked before atomic replacement. Browser and server readers verify their hashes; original-file downloads are also hash-checked.

## Values and limitations

XYZ grid depths use the source's negative-down sign and are negated once to signed positive-down kilometres. Positive depths lie below the mean-radius sphere; negative depths lie above it. Supplementary CSV depths already use positive-down values and are retained. The sphere has radius 6,371.0088 km; no ellipsoid correction or physical-boundary repair is applied. Display exaggeration does not alter source values.

Actual coordinate spacing is 0.05° in 22 regions and 0.02° in Hindu Kush, Manila, Muertos, Pamir and Puysegur. The original coordinates determine spacing, even where general source descriptions say 0.05°. Sixty-one Muertos grid nodes have negative signed depths, reaching approximately −2.66831 km. They remain inspectable and are flagged, not clamped to zero.

Source values are stored as Float32 little-endian. The grid fields are depth, PDF depth standard deviation, dip, strike and thickness. NaN is missing, not zero. Standard deviation is not thickness, earthquake probability or a calibrated confidence interval. Depth colors saturate at 0–700 km; uncertainty colors at 0–50 km; missing uncertainty is grey.

Izu-Bonin, Kermadec, Manila and Solomon Islands have supplied supplementary nodes. The nine original fields are `lon,lat,depth,strike,dip,dz1,dz2,dz3,thickness`. `dz1` supplies the displayed PDF uncertainty; the other source fields remain in the original download. Signed smoothing adjustments are not repaired. Solomon Islands retains 21 missing `dz1` values and 21,758 missing `dz2`/thickness values.

This archive is independently pinned from the existing ArcGIS contour layer. Matching region names do not establish identical source versions or point inventories. These surfaces do not establish measured boundaries, stress, pressure transfer, local crust structure, earthquake causation or forecasting skill. Continuous topology through the overturned branches, uncertainty volumes, fault surfaces and local crust models remain unfinished.

## AI and acceptance

Local Qwen and ChatGPT-authenticated Astra receive a selected grid node, units, source hashes and limitations. The server rejects mixed contexts, invalid coordinates, changed grid hashes and cutoffs before the receipt. Historical Earth may display the static model for reference, with a later-reference label; its AI explanation is disabled and delayed answers are withheld at ineligible cutoffs.

An actual Qwen answer initially described positive Kermadec depth as above the reference radius. The server now supplies the selected depth direction explicitly and requires its phrase in the answer. This targeted check avoids requiring insignificant Float32 digits to be copied verbatim; it is not general factual validation. Fresh actual Qwen and Astra answers correctly describe both Kermadec +8.78208 km below and Muertos −0.0872254 km above the reference radius. The deterministic values remain visible independently of AI availability.

The 62-test suite passes. `scripts/slab-surfaces-check.mjs` passed eight fresh Chrome/WebKit desktop, phone and landscape contexts, with actual GPU differences, numerical vertex radii, region switching, source/figure hashes and section depth restoration. `scripts/slab-surfaces-integration-check.mjs` passed four desktop/touch contexts: selection, orbital occlusion, retry after a controlled failed asset, delayed replay withholding and a real Chrome recording stopped by a layer change while retaining original evidence. All 27 grids independently passed hashes, finite-node counts and triangulation. Original station/waveform picking and oblique-section workflows also passed in both engines after the shared picking integration. Removing the decorative X-ray wireframe reduces clutter without changing source geometry; fresh render and scientific-mode checks pass. An isolated restoration retained the original receipt, reproduced all 27 grids and rejected a changed conversion without replacing a working asset. A clean restart retained the source pin and the valid, unchanged 282-record forecast ledger. These are browser checks, not physical-device performance, Safari rotation or full visual-quality acceptance.
