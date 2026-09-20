# Geological reference view

## Slab2 contours

The Slabs control loads the [USGS Slab2 depth-contour service](https://earthquake.usgs.gov/arcgis/rest/services/eq/slab2_depth/MapServer/0). The locally downloaded collection has 909 contour features across 27 service-named regions. The source uses the region name “Kermadec” for geometry spanning the Tonga/Kermadec system; original names are retained.

Cite [Hayes et al. (2018), Slab2, a comprehensive subduction zone geometry model](https://doi.org/10.1126/science.aat4723). The [USGS Slab2 page](https://earthquake.usgs.gov/slab2/) describes the model and its publication provenance. This application reads the published service; it does not submit the email-based model-generation form.

`node scripts/setup-geology.mjs` retrieves each source feature respecting the service's one-feature response limit, using four concurrent requests and bounded retries. Per-feature caches support interrupted downloads. The original source vertices are retained in `public/assets/slab2-depth.json`. The manifest, retrieval date, named regions and SHA-256 digest are in `data/geology/slab2-manifest.json`. To intentionally refresh existing cached features, use a separate empty cache directory or explicitly remove that specific cache after reviewing the target path; the script currently resumes rather than refreshes caches.

First complete artifact SHA-256: `6785dd30bd9a0dc9199d0f7af8939b2092f6586078291c5d219554ec526812d0` (10,244,650 bytes). A manifest rebuild changes its retrieval timestamp and therefore its digest.

Longitude/latitude vertices are placed on a spherical Earth at radius `1 - depthKm / 6371.0088`. A single batched line geometry renders all contour segments. No triangles are generated between contours, no slab thickness is fabricated, and this is not a volumetric tomographic model. Colors encode depth. The ordinary X-ray view follows the selected depth exaggeration and clamps impossible displayed depths at the same radius as earthquake points.

The geological model is a modern reference in every replay era. It does not assert availability in historical forecasting and is not used as input to the DS rules or fitted ETAS experiments.

## Radial cutaway

Cutaway clips a 90-degree wedge from the textured Earth using two perpendicular clipping planes. Both faces are capped with annular meshes, so rotating the camera shows a three-dimensional clipped solid. Plate lines use the same clipping planes; projected plate labels are hidden. The initial section runs north–south through the selected event, or near Tonga. Section tools can set an arbitrary oblique direction, length and corridor width.

Reference depths are rounded educational values: a schematic uniform 35 km crust, a mantle/core boundary at 2,900 km and an outer/inner-core boundary at 5,120 km. The [USGS Earth-interior overview](https://pubs.usgs.gov/gip/dynamic/inside.html) describes approximate mantle and core dimensions and crustal variability. The uniform crust is explicitly schematic; it is not a local Moho estimate. Face colors distinguish layers and lighting orientation, not measured temperature or rock imagery.

Earthquake hypocenters and enabled slab segments inside the chosen great-circle corridor are projected onto the primary cap. The default length is 6,000 km and half-width is 100 km. Both along-track extent and surface cross-track distance determine inclusion, independently of earthquake depth. Projection preserves radial depth rather than shortening the radius by perpendicular projection. The opposite half-plane is excluded. This is a corridor projection, not exact intersection of a continuous slab surface.

Cutaway forces true depth (1×) and temporarily disables the depth exaggeration selector, forecast paths and hypothesis field. Leaving the section restores the previous layer and depth settings. Original observation depths are never edited. The independently loaded Slab2 layer remains a geological model; earthquake points remain catalog observations.

## Arbitrary section workflow

Open **Section** in the Earth toolbar or **Configure & inspect section** in the cutaway caption. Enter a centre, clockwise-from-north bearing, length (50–18,000 km) and half-width (10–500 km). Alternatively, enter two exact coordinates or choose **Pick A → B on Earth**, then click/tap two surface locations. Dragging rotates the Earth instead of placing a point. Escape or Cancel exits picking and restores the previous section; a still-current statistical overlay is also restored when appropriate.

Endpoints use the shorter great-circle arc, including dateline crossings and routes over a pole. Coincident, antipodal and overlong routes are rejected. Exact coordinate fields provide a keyboard alternative to surface picking. An optional **Follow selected event** setting moves the section centre; endpoint-defined sections stay fixed when an event is selected. Selecting an observation outside a fixed corridor does not fabricate an on-section marker.

The frame consists of centre radial, along-track tangent and plane-normal unit vectors. For a surface unit vector v, `along = R atan2(v·tangent, v·radial)` and `cross = R asin(v·normal)`. Cross is positive to the left of A → B. The oblique-coordinate convention and finite length/width selection are also described in [GMT project](https://docs.generic-mapping-tools.org/latest/project.html); this application implements its own spherical vector geometry, not an ellipsoidal geodesic solver. R is 6,371.0088 km.

On the cut face, radius remains `1 - originalDepth/R`, with angular position given by along/R. Slab2 source segments are projected to along/cross coordinates and clipped linearly at corridor boundaries. A segment crossing the corridor is retained even when both original endpoints are outside it. Segments spanning the opposite projection seam are excluded. The approximation is piecewise linear in projected coordinates; no slab thickness or continuous surface is generated.

## Profile and export

The profile plots distance from A against catalog depth. The three-dimensional Earth stays at true depth; the profile's independent axis scales are explicitly labeled as a relative depth scale. Earth time, provider and current filters control the input. Every included event is plotted, with a native selector listing up to the 500 largest for keyboard inspection. Slab contours can be loaded directly from the tool. An empty corridor is reported explicitly.

On phones the profile scrolls horizontally to retain readable labels, with a visible hint and keyboard-focusable scroll region. Forms and export controls reflow, and the dialog's close control stays visible. No physical-device validation is claimed.

Section JSON includes capture time, catalog mode/provider/filter context, spherical frame, endpoints, all included observation revisions with along/cross coordinates, projected slab segments/provenance and schematic reference depths. SVG contains editable chart geometry and the same embedded metadata. CSV headers identify epoch milliseconds, degree/km units, centre-relative along distance and left-positive cross distance. The chart uses A-relative distance, so add half the profile length to the CSV's along value. Section exports are snapshots, not immutable forecast ledger records.

Earth figure exports also contain this complete section evidence. Their plotted event count now refers to the actual corridor subset, and the caption states the selected width and bearing.

Three numerical tests cover arbitrary bearings, dateline/polar endpoints, preserved depth, depth-independent width and crossing-segment clipping. `scripts/section-check.mjs` passed in Chrome and WebKit: the March 15, 2011 Japan check at 38° N / 142° E, 70° bearing, 2,500 km length and ±200 km included 1,507 earthquakes and 4,946 Slab2 segments from the current 30-day catalog view. It verifies fixed selection, exact endpoints, surface picking, cancel restoration, all three exports, figure checksum/evidence and 320/390/768-width dialogs.

The separate [Slab2 surface layer](SLAB-SURFACES.md) now connects published depth grids and displays their PDF uncertainty, preserving actual 3D geometry in this wedge. [ETOPO relief](RELIEF.md) supplies global terrain/bathymetric displacement, and selected earthquakes have focus annotations. Still needed: continuous topology through supplied overturned branches, uncertainty volumes, sampled local crust/fault models, multi-segment curved section paths and further section annotations. Physical-device performance testing is also outstanding.
