"""Independent known-gain SI scaling check, including encoded XML and invalid metadata."""
import base64
import io
import json
import sys
from pathlib import Path
import numpy as np
from obspy import Inventory, UTCDateTime
from obspy.core.inventory import Network, Station, Channel, Response, InstrumentSensitivity, PolesZerosResponseStage
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'model'))
from response import process

gain, fs, n, frequency = 2000000, 64, 2048, 4
stage = PolesZerosResponseStage(1, gain, 1, 'M/S', 'COUNTS', 'LAPLACE (RADIANS/SECOND)', 1, [], [], normalization_factor=1)
response = Response(instrument_sensitivity=InstrumentSensitivity(gain, 1, 'M/S', 'COUNTS'), response_stages=[stage])
epoch = UTCDateTime('2020-01-01T00:00:00Z')
channel = Channel('BHZ', '00', 34, -106, 1600, 100, start_date=epoch, sample_rate=fs, response=response)
inventory = Inventory([Network('IU', stations=[Station('TEST', 34, -106, 1600, channels=[channel])])], source='Vélocité test')
buffer = io.BytesIO()
inventory.write(buffer, format='STATIONXML')
# Exercise a declared single-byte encoding rather than assuming UTF-8.
xml = buffer.getvalue().decode('utf-8').replace("encoding='UTF-8'", "encoding='ISO-8859-1'").encode('latin1')
station = dict(network='IU', station='TEST', location='00', channel='BHZ', startUs=1577836800000000, endUs=None)
t = np.arange(n) / fs
values = gain * 3 * np.sin(2 * np.pi * frequency * t)
options = dict(output='VEL', detrend='constant', preFilterHz=[.5, 1, 20, 28], waterLevelDb=None, taperFraction=.05)
request = dict(operation='correct', xmlBase64=base64.b64encode(xml).decode(), station=station, startUtc=str(epoch), endUtc=str(epoch + n / fs), selectionStartUtc=str(epoch), sampleRateHz=fs, values=values.tolist(), options=options)
for output, expected in [('VEL', 3 * np.sin(2 * np.pi * frequency * t)), ('DISP', -3 * np.cos(2 * np.pi * frequency * t) / (2 * np.pi * frequency)), ('ACC', 3 * 2 * np.pi * frequency * np.cos(2 * np.pi * frequency * t))]:
    result = process({**request, 'options': {**options, 'output': output}})
    actual = np.asarray(result['values'])
    relative_rms = np.sqrt(np.mean((actual[256:-256] - expected[256:-256]) ** 2)) / np.sqrt(np.mean(expected[256:-256] ** 2))
    assert relative_rms < .002, (output, relative_rms)
    assert len(actual) == n and np.isfinite(actual).all()
for invalid in [{**request, 'sampleRateHz': 20}, {**request, 'station': {**station, 'channel': 'BHN'}}, {**request, 'station': {**station, 'startUs': station['startUs'] - 1}}, {**request, 'options': {**options, 'preFilterHz': [1, .5, 20, 28]}}, {**request, 'xmlBase64': base64.b64encode(xml.replace(b'M/S', b'PA')).decode()}, {**request, 'xmlBase64': base64.b64encode(b'<!DOCTYPE root [<!ENTITY x SYSTEM "file:///not-allowed">]><root>&x;</root>').decode()}]:
    try:
        process(invalid)
        raise AssertionError('Invalid response request accepted')
    except ValueError:
        pass
print(json.dumps({'xmlBase64': request['xmlBase64'], 'station': station, 'sampleRateHz': fs, 'values': values.tolist(), 'options': options, 'knownGainScalingPassed': True}))
