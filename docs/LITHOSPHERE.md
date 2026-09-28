# LITHO1.0 source preparation

The brief requires lithosphere and asthenosphere layers. Independent mantle-lid and asthenosphere controls are now available in Earth Layers. The original X-ray reference shells remain schematic.

`python scripts/setup-lithosphere.py` now restores and verifies the original author-hosted archive, retaining 40,962 tessellation nodes and the LID-TOP, LID-BOTTOM, ASTHENO-TOP and ASTHENO-BOTTOM properties. The binary contains 39 little-endian Float32 values per node: all three original coordinate columns followed by nine original properties for each named boundary. Depths and velocities remain in metres and metres/second; density remains kg/m³. `config/litho1.json` pins the source and output hashes, units and ordering.

Source: https://igppweb.ucsd.edu/~gabi/litho1.0.html ; Pasyanos et al. (2014), DOI:10.1002/2013JB010626.

The author page warns of negative interpolation weights in the supplied interpolator. This preparation does not invoke that interpolator or invent a regular grid. Future display must distinguish sampled nodes from continuous surfaces and retain model provenance. The first source latitude column is the one used by the original access_litho distance calculation; both latitude columns are preserved pending explicit coordinate-convention review.

Exactly one source node (node26) declares 143 rows but supplies 142. This discrepancy is retained in metadata. All four requested named boundaries are present and have consistent depth ordering at every node. No missing row is fabricated. The original archive and README remain under data/geology/litho1.

Verification: `python test/lithosphere-source.test.py` checks an original node's four boundaries and physical properties and rejects missing or reversed boundaries. Conversion verifies the entire archive hash, all node IDs and every retained boundary. Selectable boundary rendering, startup restoration, figure evidence and recording context/labels are integrated. The source node values are triangulated on unit directions with SciPy ConvexHull: 81,920 facets, two incident triangles per edge, maximum edge 1.18459°. This is display interpolation, not the author interpolator. Filled bands now intersect corresponding top/bottom facets with the central section plane and clip polygons to the selected corridor endpoints. Bands overlay the schematic interior cap and retain source/frame evidence in section exports. Coordinate-based nearest-node inspection is available, with source distance, both latitude columns, all four boundary values, layer thicknesses and a JSON provenance download. Original Q values, anisotropic velocities and eta remain in the downloaded source arrays. Physical device performance and publication/video visual acceptance for these new layers remain unverified.

Restore both stages with `node scripts/setup-lithosphere.mjs` using the existing NumPy/SciPy model runtime. Numerical JS verification: `node --test test/lithosphere.test.mjs`. Full JavaScript suite: 180 passes. Browser evidence: `artifacts/lithosphere-layers-phone.png`; no browser errors during enabling both layers and changing cutaway mode.

Filled-section check: plane crossings, exact on-plane source edges, and endpoint bounds pass. Full suite at this checkpoint: 181 tests. Desktop cutaway visibly shows both source-based bands at the selected rim; mobile combines the source labels into one inspection card.

Inspector verification: query -22°, -177° selects source node 26774, 59.26 km away, with lid depths 22–25 km and asthenosphere depths 25–125 km. The browser shows these exact values and reports no errors. Dateline, coordinate validation and unscaled-source preservation checks pass; full JavaScript suite: 182 passes. Screenshot: `artifacts/lithosphere-node-inspector.png`.
