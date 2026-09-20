"""Theoretical 1-D travel times; no waveform detection or event association."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
import obspy
from obspy.geodetics import locations2degrees
from obspy.taup import TauPyModel

PHASES = {'P', 'p', 'Pn', 'Pg', 'Pdiff', 'PKP', 'PKIKP', 'S', 's', 'Sn', 'Sg', 'Sdiff', 'SKS', 'SKIKS', 'pP', 'sP', 'PP', 'SS'}

def calculate(request):
    name, phases = request['model'], request['phases']
    event, station = request['event'], request['station']
    if name not in ('iasp91', 'ak135') or not isinstance(phases, list) or not 1 <= len(phases) <= 10 or len(set(phases)) != len(phases) or not set(phases) <= PHASES:
        raise ValueError('Choose iasp91 or ak135 and 1–10 distinct supported phases')
    if not 0 <= event['depth'] <= 800:
        raise ValueError('The selected catalog depth must be within 0–800 km')
    for point in (event, station):
        if not -90 <= point['lat'] <= 90 or not -180 <= point['lon'] <= 180:
            raise ValueError('Invalid source or station coordinates')
    degrees = float(locations2degrees(event['lat'], event['lon'], station['lat'], station['lon']))
    model = TauPyModel(name)
    arrivals = model.get_travel_times(event['depth'], degrees, phase_list=phases, receiver_depth_in_km=0)
    rows = [{'index': i, 'phase': a.name, 'timeSeconds': float(a.time), 'rayParameterSecondsPerDegree': float(a.ray_param_sec_degree), 'takeoffDegrees': float(a.takeoff_angle), 'incidentDegrees': float(a.incident_angle)} for i, a in enumerate(arrivals)]
    model_file = Path(obspy.__file__).parent / 'taup' / 'data' / (name + '.npz')
    return {'distanceDegrees': degrees, 'receiverDepthKm': 0, 'arrivals': rows, 'implementation': {'obspy': obspy.__version__, 'numpy': np.__version__, 'model': name, 'modelSha256': hashlib.sha256(model_file.read_bytes()).hexdigest(), 'pythonSourceSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, 'limitations': ['Spherically symmetric 1-D reference model; no local crust, topography, ellipticity or receiver-elevation correction.', 'Station elevation and sensor depth are retained as metadata but receiver depth is explicitly zero in the calculation.', 'Multiple branches can share a phase name; no arrival is guaranteed to occur or be detectable in this recording.', 'No waveform detector, phase classifier, source relocation or causal event association is performed.']}

if __name__ == '__main__':
    try:
        print(json.dumps(calculate(json.load(sys.stdin)), allow_nan=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
