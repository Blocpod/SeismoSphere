"""Optional comparison with an externally installed OkadaPy 0.0.1 native library.

No reference solver is bundled or used by the application. Pass its native library
path, optionally followed by an exported SeismoSphere stress calculation.
"""
import ctypes
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'model'))
from stress import calculate, np

library = Path(sys.argv[1]).resolve(strict=True)
reference = ctypes.CDLL(str(library)).compute_okada_stress
array = np.ctypeslib.ndpointer(dtype=np.float64, flags='C_CONTIGUOUS')
reference.argtypes = [array, array, ctypes.c_int32, array, ctypes.c_int32,
                      ctypes.c_double, ctypes.c_double, ctypes.c_double, array, ctypes.c_int32]
reference.restype = None
counts = {'cases': 0, 'samples': 0, 'maxTensorErrorPa': 0., 'maxResolvedErrorPa': 0.}


def compare(data):
    rows = []
    for p in data['model']['patches']:
        rake = np.deg2rad(p['rakeDeg'])
        rows.append([p['xStartKm'], p['yStartKm'], p['xEndKm'], p['yEndKm'], 100,
                     -p['slipM']*np.cos(rake), p['slipM']*np.sin(rake),
                     p['dipDeg'], p['topKm'], p['bottomKm']])
    # OkadaPy accepts right-lateral/reverse components, km geometry, meters slip,
    # and E in the desired stress unit. Its native output order is xx yy zz yz xz xy.
    elements = np.array(rows, dtype=np.float64).ravel()
    points = data['points']
    expected = np.zeros((len(points), 6))
    for depth in sorted({p['depthKm'] for p in points}):
        indices = [i for i, p in enumerate(points) if p['depthKm'] == depth]
        x = np.array([points[i]['xKm'] for i in indices], dtype=np.float64)
        y = np.array([points[i]['yKm'] for i in indices], dtype=np.float64)
        output = np.zeros((len(indices), 6))
        reference(x, y, len(indices), elements, len(rows),
                  2*data['shearModulusGPa']*1e9*(1+data['poisson']),
                  data['poisson'], depth, output, 1)
        expected[indices] = output[:, [0, 1, 2, 5, 4, 3]]
    report = calculate(data)
    indices = [i for i, value in enumerate(report['values']) if value is not None]
    assert indices, 'Comparison requires unmasked samples'
    expected = expected[indices]
    actual = np.array([report['values'][i]['tensorPa'] for i in indices])
    np.testing.assert_allclose(actual, expected, atol=1e-4, rtol=1e-7)
    # Independent explicit traction projection, without the production helper.
    s, d, r = np.deg2rad([data['receiver'][k] for k in ['strike', 'dip', 'rake']])
    normal = np.array([np.cos(s)*np.sin(d), -np.sin(s)*np.sin(d), np.cos(d)])
    direction = np.array([np.cos(r)*np.sin(s)-np.sin(r)*np.cos(s)*np.cos(d),
                          np.cos(r)*np.cos(s)+np.sin(r)*np.sin(s)*np.cos(d),
                          np.sin(r)*np.sin(d)])
    tensors = expected[:, [[0, 3, 4], [3, 1, 5], [4, 5, 2]]]
    normal_stress = np.einsum('i,nij,j->n', normal, tensors, normal)
    shear = np.einsum('i,nij,j->n', direction, tensors, normal)
    resolved = np.column_stack([shear, normal_stress, shear+data['friction']*normal_stress])
    observed = np.array([[report['values'][i][k] for k in ['shearPa', 'unclampingPa', 'coulombPa']] for i in indices])
    np.testing.assert_allclose(observed, resolved, atol=1e-4, rtol=1e-7)
    counts['cases'] += 1
    counts['samples'] += len(indices)
    counts['maxTensorErrorPa'] = max(counts['maxTensorErrorPa'], float(np.max(np.abs(actual-expected))))
    counts['maxResolvedErrorPa'] = max(counts['maxResolvedErrorPa'], float(np.max(np.abs(observed-resolved))))


for strike in [0, 37, 143, 270]:
    angle = np.deg2rad(strike)
    for dip in [19, 45, 90]:
        for rake in [-90, 0, 90, 135]:
            for depth in [0, 6]:
                patch = dict(kode=100, xStartKm=-5*np.sin(angle), yStartKm=-5*np.cos(angle),
                             xEndKm=5*np.sin(angle), yEndKm=5*np.cos(angle), topKm=1,
                             bottomKm=8, dipDeg=dip, rakeDeg=rake, slipM=1.3)
                compare(dict(model={'patches': [patch]}, poisson=.25, shearModulusGPa=32,
                             friction=.4, receiver=dict(strike=strike, dip=dip, rake=rake),
                             points=[dict(xKm=x, yKm=y, depthKm=depth) for x in [-30, 11, 35] for y in [-21, 9, 27]]))

export_receipt = None
if len(sys.argv) > 2:
    raw = Path(sys.argv[2]).read_bytes()
    exported = json.loads(raw)
    compare(dict(exported['record']['options'], model=exported['source']['model']))
    export_receipt = {'id': exported['record']['id'], 'sha256': hashlib.sha256(raw).hexdigest()}
print(json.dumps(dict(counts, referenceLibrary=library.name,
                      referenceSha256=hashlib.sha256(library.read_bytes()).hexdigest(),
                      export=export_receipt, absoluteTolerancePa=1e-4, relativeTolerance=1e-7)))
