"""Retain the original CRUST1.0 columns without interpolation or gap repair."""
from pathlib import Path
import array
import hashlib
import json
import math
import sys
import tarfile
import urllib.request

url = 'https://igppweb.ucsd.edu/~gabi/crust1/crust1.0.tar.gz'
expected = '0b41b46fc3e1a76debbbcb66ab407febaeee4dc3033db7a0a24d2bb7c7adfe3e'
root = Path('data/geology/crust1')
assets = Path('public/assets/crust1')
root.mkdir(parents=True, exist_ok=True)
assets.mkdir(parents=True, exist_ok=True)
archive = root / 'crust1.0.tar.gz'
if not archive.exists():
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read(1155393)
    if len(data) != 1155392 or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('CRUST1.0 archive differs from the reviewed source')
    archive.write_bytes(data)
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise ValueError('Retained CRUST1.0 archive integrity mismatch')

metadata = {'model': 'CRUST1.0', 'homepage': 'https://igppweb.ucsd.edu/~gabi/crust1.html',
            'citation': 'Laske, Ma, Masters and Pasyanos (2013), CRUST1.0',
            'source': {'url': url, 'sha256': expected, 'bytes': 1155392},
            'width': 360, 'height': 180, 'latitudeStart': 89.5, 'latitudeStep': -1,
            'longitudeStart': -179.5, 'longitudeStep': 1, 'valuesPerCell': 9,
            'layers': ['water', 'ice', 'upper sediments', 'middle sediments', 'lower sediments',
                       'upper crystalline crust', 'middle crystalline crust', 'lower crystalline crust', 'mantle below Moho'],
            'boundaryConvention': 'Original signed boundary topography in km, positive above sea level; negate for positive-down depth. Column 0 is surface, column 8 is Moho.',
            'limitations': ['One-degree cell-average reference model, not local site geometry.',
                            'No interpolation, uncertainty estimates or model-data agreement inferred.'], 'files': {}}
with tarfile.open(archive, 'r:gz') as source:
    for field, units in [('bnds', 'km'), ('vp', 'km/s'), ('vs', 'km/s'), ('rho', 'g/cm^3')]:
        name = 'crust1.' + field
        member = source.getmember(name)
        if not member.isfile() or member.size > 6000000:
            raise ValueError('Unexpected CRUST1.0 member')
        original = source.extractfile(member).read()
        rows = [[float(value) for value in row.split()] for row in original.decode('ascii').splitlines()]
        if len(rows) != 64800 or any(len(row) != 9 or not all(map(math.isfinite, row)) for row in rows):
            raise ValueError('Invalid CRUST1.0 dimensions or numeric values')
        if field == 'bnds' and any(any(a < b for a, b in zip(row, row[1:])) for row in rows):
            raise ValueError('CRUST1.0 boundary ordering changed')
        if field != 'bnds' and any(value < 0 for row in rows for value in row):
            raise ValueError('Negative physical property in CRUST1.0')
        packed = array.array('f', (value for row in rows for value in row))
        if sys.byteorder != 'little':
            packed.byteswap()
        data = packed.tobytes()
        filename = field + '.f32'
        temporary = assets / (filename + '.tmp')
        temporary.write_bytes(data)
        temporary.replace(assets / filename)
        (root / name).write_bytes(original)
        metadata['files'][field] = {'file': filename, 'units': units, 'bytes': len(data),
                                   'sha256': hashlib.sha256(data).hexdigest(),
                                   'sourceSha256': hashlib.sha256(original).hexdigest()}
    (root / 'readme').write_bytes(source.extractfile('readme').read())
pin = Path('config/crust1.json')
if pin.exists() and json.loads(pin.read_text(encoding='utf-8')) != metadata:
    raise ValueError('CRUST1.0 conversion differs from retained metadata')
pin.write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
print('Verified 64,800 CRUST1.0 columns, four source properties and original README.')
