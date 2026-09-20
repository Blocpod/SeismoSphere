# Craton reference boundaries

**Layers → Cratons** opens the pinned Hasterok et al. geological reference. Search retained attributes, inspect a province, locate its boundary on Earth, or rank nearby boundary rings from a selected epicenter or the camera's surface point. Teal marks source `reworked = no`, violet `yes`, and white the selected region. Boundaries follow the Earth section clipping planes and appear in publication captures with attribution and exact feature hashes.

The dataset contains **114 regions, 119 polygon rings and 12,796 retained vertices**. Of these regions, **59 are marked reworked and 55 unreworked**. These are mapped regions with known or sampled Archean basement. They include later reworking and internal province boundaries. An individual ring must not be presented as the outer edge of an entire craton. No polygon area fill, subsurface extrusion, thickness or pressure measurement is inferred.

Proximity reuses the existing spherical minor-arc segment calculation. It measures epicentral surface distance to any retained ring, including internal edges and holes. It does not classify whether a point lies inside a region, measure hypocentral or rupture-plane distance, establish causal fault assignment or validate pressure transfer. The source remains separate from the illustrative research route graph. Canonical craton-edge forecast progression remains unfinished.

All source attributes are retained, including empty fields, original references, source province type and reworking status. `FROMAGE = 9999` and `TOAGE = -999` are reconstruction sentinel fields; the interface and AI do not interpret them as geological ages. Accented source names are decoded with Latin-1; the DBF has language driver 0x57 and no supplied CPG file. Ring order and coordinates are preserved without repairs or simplification.

## Source and restoration

- [Hasterok et al. (2022), New Maps of Global Geological Provinces and Tectonic Plates](https://doi.org/10.1016/j.earscirev.2022.104069), Earth-Science Reviews 231, 104069.
- [Author-maintained global_tectonics repository](https://github.com/dhasterok/global_tectonics), pinned revision `6cdcbf021178e9adf65e7f9c3d77c5497a976bf4`.
- Original `cratons.shp`, SHX, DBF, PRJ, QMD, README and repository GPL-3.0 license are hash-pinned in `config/craton-source.json`. A ZIP of these unmodified source files and the full license are available from the source inspector.

The offline conversion uses [PyShp 2.3.1](https://pypi.org/project/pyshp/2.3.1/), installed only into the project's ignored converter directory. The running app does not require Python or PyShp. From the project root:

```powershell
python -m pip install --target data/geology/craton-tools pyshp==2.3.1
python scripts/setup-cratons.py
```

Use the available Python executable's absolute path if `python` is not on PATH. This is a separate restoration step from `node scripts/setup.mjs`. Downloads are checked against exact byte lengths and SHA-256 values before conversion; cached sources can be reused offline. The server verifies the converted feature collection against canonical feature SHA-256 `f974c5f3731ea5d0dc761c371239ad247a9fe697370396cdc61d78483ee80fae`.

The initial rendered dataset SHA-256 is `815ae011fdfda1b23ed9287988c17aa18097571ec221a3f8fc42b6317bfefc61`. Collection provenance includes the installation receipt time, so that whole-file digest can differ on a fresh installation while the feature digest remains identical. Save the source checkpoint, receipt and exported data together.

## AI and verification

Qwen and subscription-backed Astra receive one selected region's attributes, source provenance and explicit limits. The endpoint rejects mixed analytical contexts and analysis cutoffs before the reference was received. Historical Earth can display the later static reference for inspection, with a visible later-reference label and disabled AI explanation. Pending explanation output is cleared if the cutoff becomes ineligible.

The unit check preserves reworking and sentinel fields, rejects unknown regions and early/nonfinite cutoffs, and exercises the deterministic brain. Real Chrome and Windows WebKit checks cover fresh 1536, 390, 320 and 844-pixel views, search, selection, surface proximity, clipping/restoration, original data export and historical gating. Real Qwen and Astra explanations identify the Limpopo Belt as a reworked shield within the Kalahari Craton and reject pressure, thickness and causation inferences. Figure checks verify final camera focus, embedded evidence and matching hashes. These are browser checks, not physical phone or full visual-quality acceptance.
