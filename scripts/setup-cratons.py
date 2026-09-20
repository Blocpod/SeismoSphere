"""Convert pinned WGS84 source polygon rings without repairing or simplifying them."""
import hashlib
import json
import math
from pathlib import Path
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, str(Path('data/geology/craton-tools').resolve()))
try:
    import shapefile
except ImportError:
    raise SystemExit('Install the converter: python -m pip install --target data/geology/craton-tools pyshp==2.3.1')
if shapefile.__version__ != '2.3.1':
    raise SystemExit('Use the pinned PyShp 2.3.1 converter.')

pin = json.loads(Path('config/craton-source.json').read_text(encoding='utf-8'))
cache, assets = Path('data/geology/cratons-cache'), Path('public/assets')
cache.mkdir(parents=True, exist_ok=True)
assets.mkdir(parents=True, exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
for source in pin['files']:
    target = cache / source['name']
    raw = target.read_bytes() if target.exists() else b''
    if sha(raw) != source['sha256']:
        with urllib.request.urlopen(source['url'], timeout=60) as response:
            raw = response.read(2_000_001)
    if len(raw) != source['bytes'] or sha(raw) != source['sha256']:
        raise SystemExit('Pinned craton source changed: ' + source['name'])
    target.write_bytes(raw)

# Source LDID 0x57, no .cpg; Latin-1 preserves the source accented names.
# Do not interpret GPlates FROMAGE/TOAGE sentinel fields as basement ages.
reader = shapefile.Reader(str(cache / 'cratons.shp'), encoding='latin1')
features = []
for i, item in enumerate(reader.iterShapeRecords()):
    if item.shape.shapeType != shapefile.POLYGON:
        raise ValueError('Expected source polygons')
    points, starts = item.shape.points, list(item.shape.parts) + [len(item.shape.points)]
    rings = [[list(p) for p in points[a:b]] for a, b in zip(starts, starts[1:])]
    for ring in rings:
        if len(ring) < 4 or ring[0] != ring[-1]:
            raise ValueError('Unclosed source polygon ring')
        if any(len(p) != 2 or not all(math.isfinite(v) for v in p) or abs(p[0]) > 180 or abs(p[1]) > 90 for p in ring):
            raise ValueError('Invalid WGS84 coordinate')
    features.append({'type': 'Feature', 'id': f'craton-{i}', 'properties': item.record.as_dict(), 'geometry': {'type': 'MultiLineString', 'coordinates': rings}})
if len(features) != 114:
    raise ValueError('Unexpected pinned feature count')
retrieved = datetime.now(timezone.utc).isoformat()
receipt = cache / 'receipt.json'
if receipt.exists():
    old = json.loads(receipt.read_text(encoding='utf-8'))
    if old.get('revision') == pin['revision'] and old.get('files') == pin['files']:
        retrieved = old['retrievedAt']
receipt.write_text(json.dumps({**pin, 'retrievedAt': retrieved}, indent=2), encoding='utf-8')
provenance = {
    'name': 'Hasterok et al. Archean basement regions', 'revision': pin['revision'], 'retrievedAt': retrieved,
    'source': 'https://github.com/dhasterok/global_tectonics', 'doi': 'https://doi.org/10.1016/j.earscirev.2022.104069',
    'citation': 'Hasterok et al. (2022), New Maps of Global Geological Provinces and Tectonic Plates, Earth-Science Reviews 231, 104069',
    'license': 'GPL-3.0, as supplied with the source repository', 'licenseUrl': '/assets/LICENSE-cratons.txt', 'sourceFiles': pin['files'],
    'coordinates': 'WGS84 longitude/latitude; source polygon rings displayed as spherical surface boundaries',
    'conversion': 'PyShp 2.3.1; DBF decoded Latin-1 (LDID 0x57). Original ring order, coordinates and attributes retained. No repair, simplification, polygon filling or subsurface extrusion.',
    'policy': 'Mapped regions with known or sampled Archean basement, including post-Archean reworking. Internal province boundaries are retained; these are not only the outer boundaries of whole cratons. This is not a pressure-transfer map, live measurement or historical forecast input. FROMAGE/TOAGE values are retained source fields, not interpreted geological ages.'
}
data = {'type': 'FeatureCollection', 'features': features, 'provenance': provenance}
content = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
(assets / 'cratons.json').write_bytes(content)
(assets / 'LICENSE-cratons.txt').write_bytes((cache / 'LICENSE').read_bytes())
with zipfile.ZipFile(assets / 'cratons-source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for source in pin['files']:
        archive.write(cache / source['name'], source['name'])
manifest = {**provenance, 'features': len(features), 'rings': sum(len(f['geometry']['coordinates']) for f in features), 'vertices': sum(len(r) for f in features for r in f['geometry']['coordinates']), 'reworked': {v: sum(f['properties']['reworked'] == v for f in features) for v in ['yes', 'no']}, 'sha256': sha(content)}
Path('data/geology/cratons-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({k: manifest[k] for k in ['features', 'rings', 'vertices', 'reworked', 'sha256']}))
