"""Static elastic half-space calculation in the source model's local coordinates."""
import os
os.environ['CUTDE_USE_BACKEND'] = 'cpp'
import json
import math
import sys
from importlib.metadata import version
import numpy as np
import cutde.halfspace as hs


def number(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Invalid ' + name)
    return float(value)


def receiver_basis(strike, dip, rake):
    strike, dip, rake = np.deg2rad([strike, dip, rake])
    along = np.array([np.sin(strike), np.cos(strike), 0.])
    updip = np.array([-np.cos(strike)*np.cos(dip), np.sin(strike)*np.cos(dip), np.sin(dip)])
    normal = np.cross(along, updip)
    return normal, np.cos(rake)*along + np.sin(rake)*updip


def resolve_stress(stress, normal, slip, friction):
    tensors = stress[:, [[0, 3, 4], [3, 1, 5], [4, 5, 2]]]
    traction = tensors @ normal
    unclamping = traction @ normal
    shear = traction @ slip
    return shear, unclamping, shear + friction*unclamping


def calculate(data):
    if version('cutde') != '26.3.6':
        raise ValueError('Install pinned solver dependencies with scripts/setup-stress.ps1')
    patches = data['model']['patches']
    points = data['points']
    if not isinstance(patches, list) or not 1 <= len(patches) <= 10000 or not isinstance(points, list) or not 1 <= len(points) <= 4096 or len(points)*len(patches)*2 > 5000000:
        raise ValueError('Use 1–4096 points and at most five million point/triangle interactions')
    nu = number(data['poisson'], 0, .49, 'Poisson ratio')
    mu = number(data['shearModulusGPa'], 1, 100, 'shear modulus')*1e9
    friction = number(data['friction'], 0, 1, 'effective friction')
    receiver = data['receiver']
    strike = number(receiver['strike'], 0, 360, 'receiver strike')
    dip = number(receiver['dip'], .01, 90, 'receiver dip')
    rake = number(receiver['rake'], -180, 180, 'receiver rake')
    coordinates = []
    for p in points:
        coordinates.append([number(p['xKm'], -2000, 2000, 'east offset')*1000, number(p['yKm'], -2000, 2000, 'north offset')*1000, -number(p['depthKm'], 0, 1000, 'depth')*1000])
    obs = np.array(coordinates, dtype=np.float64)
    triangles, slips = [], []
    excluded = np.zeros(len(obs), dtype=bool)
    for p in patches:
        if p.get('kode') != 100:
            raise ValueError('Only Kode 100 rake/net-slip patches are supported')
        a = np.array([number(p['xStartKm'], -2000, 2000, 'source x')*1000, number(p['yStartKm'], -2000, 2000, 'source y')*1000, -number(p['topKm'], 0, 1000, 'top depth')*1000])
        b = np.array([number(p['xEndKm'], -2000, 2000, 'source x')*1000, number(p['yEndKm'], -2000, 2000, 'source y')*1000, a[2]])
        bottom = number(p['bottomKm'], 0, 1000, 'bottom depth')*1000
        angle = math.radians(number(p['dipDeg'], .01, 90, 'source dip'))
        length = np.linalg.norm(b-a)
        if length <= 0 or bottom <= -a[2]:
            raise ValueError('Degenerate rupture patch')
        along = (b-a)/length
        down = np.array([along[1]*math.cos(angle), -along[0]*math.cos(angle), -math.sin(angle)])
        width = (bottom+a[2])/math.sin(angle)
        c, d = b+down*width, a+down*width
        # Reversed winding gives an upward normal, along-strike and up-dip basis.
        triangles.extend([[a, c, b], [a, d, c]])
        magnitude = number(p['slipM'], 0, 100, 'source slip')
        source_rake = math.radians(number(p['rakeDeg'], -180, 180, 'source rake'))
        slips.extend([[magnitude*math.cos(source_rake), magnitude*math.sin(source_rake), 0.]]*2)
        delta = obs-a
        x, y = delta@along, delta@down
        closest = a + np.clip(x, 0, length)[:, None]*along + np.clip(y, 0, width)[:, None]*down
        # Constant-slip dislocations are singular on their edges; mask the whole
        # source surface within 100 m rather than display unstable near-fault values.
        excluded |= np.linalg.norm(obs-closest, axis=1) < 100
    valid = ~excluded
    values = [None]*len(points)
    if valid.any():
        strain = hs.strain_free(np.ascontiguousarray(obs[valid]), np.array(triangles), np.array(slips), nu)
        stress = hs.strain_to_stress(strain, mu, nu)
        if not np.isfinite(stress).all():
            raise ValueError('Non-finite stress from solver; change sampling locations')
        normal, direction = receiver_basis(strike, dip, rake)
        shear, unclamping, coulomb = resolve_stress(stress, normal, direction, friction)
        for k, index in enumerate(np.flatnonzero(valid)):
            values[index] = {'tensorPa': stress[k].tolist(), 'shearPa': float(shear[k]), 'unclampingPa': float(unclamping[k]), 'coulombPa': float(coulomb[k])}
    return {'version':'static-halfspace-1', 'solver':'cutde', 'solverVersion':version('cutde'), 'backend':'cpp', 'points':points, 'values':values, 'excludedCount':int(excluded.sum()), 'exclusionDistanceM':100,
            'parameters':{'poisson':nu, 'shearModulusGPa':mu/1e9, 'friction':friction, 'receiver':receiver},
            'conventions':{'coordinates':'Local source x east, y north, z up; km input converted to meters', 'tensorOrder':['xx','yy','zz','xy','xz','yz'], 'normal':'Positive tension/unclamping', 'shear':'Positive along specified receiver rake', 'coulomb':'shear + effective friction * unclamping; Pa'},
            'limitations':['Homogeneous isotropic linear elastic half-space with a flat traction-free surface.', 'Explicit receiver orientation and elastic assumptions; no pore-pressure calculation, dynamic stress, viscoelastic response or topography.', 'Local source coordinates only; no geographic projection is inferred.', 'Static stress change is not earthquake probability or a timed forecast.']}


if __name__ == '__main__':
    try:
        print(json.dumps(calculate(json.load(sys.stdin)), allow_nan=False))
    except Exception as error:
        print(json.dumps({'error':str(error)}))
        sys.exit(1)
