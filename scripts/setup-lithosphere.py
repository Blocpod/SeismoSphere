"""Retain LITHO1.0 lid/asthenosphere nodes without the source interpolator."""
from pathlib import Path
import array
import hashlib
import json
import math
import re
import sys
import tarfile
import urllib.request

ARCHIVE = Path('data/geology/litho1/litho1.0.tar.gz')
URL = 'https://igppweb.ucsd.edu/~gabi/litho1/litho1.0.tar.gz'
SHA = '04f1f01a0bdb24d6aa0ec5d38707024a556aa06b0de9da12d442dd281bd92e36'
LAYERS = ['LID-TOP', 'LID-BOTTOM', 'ASTHENO-TOP', 'ASTHENO-BOTTOM']

def boundaries(text):
    lines = text.splitlines()
    if not lines[0].startswith('nlayers = '):
        raise ValueError('Unexpected node header')
    found = {}
    for line in lines[1:]:
        parts = line.split()
        if parts[-1] in LAYERS:
            values = list(map(float, parts[:-1]))
            if len(values) != 9 or not all(map(math.isfinite, values)) or parts[-1] in found:
                raise ValueError('Invalid LITHO1.0 boundary')
            found[parts[-1]] = values
    if set(found) != set(LAYERS):
        raise ValueError('Missing lithosphere/asthenosphere boundary')
    depths = [found[name][0] for name in LAYERS]
    if not depths[0] <= depths[1] == depths[2] <= depths[3]:
        raise ValueError('Invalid boundary ordering')
    return [value for name in LAYERS for value in found[name]]

def main():
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    if not ARCHIVE.exists():
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read(12419119)
        if len(data) != 12419118 or hashlib.sha256(data).hexdigest() != SHA:
            raise ValueError('Unexpected source archive')
        ARCHIVE.write_bytes(data)
    if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != SHA:
        raise ValueError('Source archive integrity mismatch')
    coordinates = None
    nodes = {}
    header_mismatches = 0
    with tarfile.open(ARCHIVE, 'r|gz') as source:
        for member in source:
            if not member.isfile():
                continue
            if member.name == 'README':
                (ARCHIVE.parent / 'README').write_bytes(source.extractfile(member).read())
            elif member.name.endswith('/Icosahedron_Level7_LatLon_mod.txt'):
                coordinates = [list(map(float, line.split())) for line in source.extractfile(member).read().decode().splitlines()]
            elif match := re.fullmatch(r'LITHO1.0/litho_model/node(\d+)\.model', member.name):
                text = source.extractfile(member).read().decode()
                header_mismatches += int(int(text.splitlines()[0].split()[-1]) != len(text.splitlines())-1)
                nodes[int(match[1])] = boundaries(text)
    if coordinates is None or set(nodes) != set(range(1, len(coordinates)+1)):
        raise ValueError('Node coordinates and profiles do not match')
    packed = array.array('f')
    for i, point in enumerate(coordinates, 1):
        if len(point) != 3 or not all(map(math.isfinite, point)):
            raise ValueError('Invalid source coordinate')
        packed.extend(point + nodes[i])
    if sys.byteorder != 'little':
        packed.byteswap()
    data = packed.tobytes()
    output = Path('public/assets/litho1/nodes.f32')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    metadata = {'model':'LITHO1.0 v1','citation':'Pasyanos et al. (2014), DOI:10.1002/2013JB010626','homepage':'https://igppweb.ucsd.edu/~gabi/litho1.0.html','source':{'url':URL,'sha256':SHA},'sourceHeaderRowCountMismatches':header_mismatches,'nodeCount':len(nodes),'stride':39,'coordinates':['source latitude (used by access_litho)','source glatitude','longitude'],'layers':LAYERS,'properties':['depth_m','density_kg_m3','Vp_m_s','Vs_m_s','Qkappa','Qmu','Vp2_m_s','Vs2_m_s','eta'],'file':'nodes.f32','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'policy':'Original tessellation nodes only, no interpolation. Static model reference, not local observations or a pressure-transfer map.'}
    pin = Path('config/litho1.json')
    if pin.exists() and json.loads(pin.read_text(encoding='utf-8')) != metadata:
        raise ValueError('Conversion differs from retained metadata')
    pin.write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
    print(f'Verified {len(nodes)} original LITHO1.0 lid/asthenosphere nodes.')

if __name__ == '__main__':
    main()
