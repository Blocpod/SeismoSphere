# LITHO1.0 source preparation

The brief requires lithosphere and asthenosphere layers. These remain pending UI integration; the existing X-ray shells are schematic.

`python scripts/setup-lithosphere.py` now restores and verifies the original author-hosted archive, retaining 40,962 tessellation nodes and the LID-TOP, LID-BOTTOM, ASTHENO-TOP and ASTHENO-BOTTOM properties. The binary contains 39 little-endian Float32 values per node: all three original coordinate columns followed by nine original properties for each named boundary. Depths and velocities remain in metres and metres/second; density remains kg/m³. `config/litho1.json` pins the source and output hashes, units and ordering.

Source: https://igppweb.ucsd.edu/~gabi/litho1.0.html ; Pasyanos et al. (2014), DOI:10.1002/2013JB010626.

The author page warns of negative interpolation weights in the supplied interpolator. This preparation does not invoke that interpolator or invent a regular grid. Future display must distinguish sampled nodes from continuous surfaces and retain model provenance. The first source latitude column is the one used by the original access_litho distance calculation; both latitude columns are preserved pending explicit coordinate-convention review.

Exactly one source node (node26) declares 143 rows but supplies 142. This discrepancy is retained in metadata. All four requested named boundaries are present and have consistent depth ordering at every node. No missing row is fabricated. The original archive and README remain under data/geology/litho1.

Verification: `python test/lithosphere-source.test.py` checks an original node's four boundaries and physical properties and rejects missing or reversed boundaries. Conversion verifies the entire archive hash, all node IDs and every retained boundary. Sampling API, selectable layer rendering, startup restoration and exported scene evidence are the next integration work; preparation alone does not satisfy the layer requirement.
