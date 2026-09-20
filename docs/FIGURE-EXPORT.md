# Earth figure export

Use **Figure** in the Earth toolbar, supply a title and choose **Capture current Earth**. The preview and all three download buttons refer to that single capture, even while live data or the timeline continues changing in the background. Capturing does not freeze or issue a forecast.

- PNG: 2400 × 1800 lossless figure with title, cutoff, depth scale, plotted-event count, layer disclosure, legend, credits and evidence checksum.
- SVG: the same composition with editable vector text and annotations around a 2000 × 1300 raster Earth. This is not vector terrain. Its metadata embeds the complete matching evidence object.
- JSON: matching catalog revisions used for the plotted point batch, current analysis and displayed candidates, selected object, filters, source/feed metadata, camera, layer settings, timestamps and limitations. It does not include AI credentials, session tokens, private keys or machine configuration.

The publication camera retains the current direction and reframes the whole Earth at a fixed distance. It does not reproduce the workspace's mobile view offset or zoom. Enabled geological cutaway and model layers remain visible. The renderer, camera and point-size settings are restored immediately after capture. DOM panels are excluded; plate labels are reprojected into the publication frame.

The event list in the evidence is the same highest-magnitude batch (up to 15,000) used for globe points. It includes events occluded by the Earth and does not mean every point is visible in the image. Cutaway adds a section projection; the section anchor and projection limitation are retained. Selected evidence can be from a previously opened ledger record and is distinguished from the current analysis and current observation cutoff.

The SHA-256 is calculated over UTF-8 `JSON.stringify(evidence)` in the stored property order. Recompute this from the JSON envelope's `evidence` field. The checksum is also printed on the figure. This binds the displayed identifier to matching evidence; it is not an independent timestamp, an image-authenticity signature, or a claim of prospective skill. The existing immutable forecast ledger remains a separate feature.

Imagery is illustrative. Cinematic mode uses directional shading; scientific mode uses an unlit day composite and solid markers. The figure captions and evidence identify the chosen presentation and actual effect visibility. D-SPF and model watches are explicitly uncalibrated; the route graph remains illustrative. Geological cutaway layers include a schematic uniform crust. These qualifications and the full source links travel with the evidence file instead of being lost during export.

With mapped faults enabled, the figure includes GEM attribution and CC BY-SA 4.0 labeling. The matching evidence records the pinned revision, selected source trace and proximity query separately from observations and forecasts. See `docs/MAPPED-FAULTS.md` for preservation, geometry and licensing details.
