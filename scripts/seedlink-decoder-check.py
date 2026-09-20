"""Offline MiniSEED decoding and fragmented transport check; emits a synthetic packet for Node checks."""
import base64
import io
import json
import sys
from pathlib import Path
import numpy as np
from obspy import Stream, Trace, UTCDateTime
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'model'))
from seedlink import decode, exact

channel = dict(network='IU', station='ANMO', location='00', channel='BHZ')
trace = Trace(np.arange(40, dtype=np.int32), header={**channel, 'starttime': UTCDateTime('2026-01-01T00:00:00.019538Z'), 'sampling_rate': 40})
buffer = io.BytesIO()
Stream([trace]).write(buffer, format='MSEED', reclen=512, encoding='STEIM2')
packet = b'SLFFFFFF' + buffer.getvalue()
value = decode(packet, channel, 1767225601000)
assert value['sequence'] == 0xffffff
assert value['segment']['samples'][0] == [1767225600019538, 0]
assert value['segment']['samples'][-1] == [1767225600994538, 39]
assert value['segment']['metadata']['startNanoseconds'] == '1767225600019538000'
assert base64.b64decode(value['raw']) == packet
assert decode(packet, {**channel, 'location': ''}, 0) is None
class Fragmented(io.BytesIO):
    def read(self, n):
        return super().read(min(n, 3))
assert exact(Fragmented(packet), 520) == packet
for broken in [packet[:-1], b'XX000000' + packet[8:]]:
    try:
        decode(broken, channel, 0)
        raise AssertionError('Invalid packet accepted')
    except ValueError:
        pass
try:
    exact(Fragmented(packet[:-1]), 520)
    raise AssertionError('Truncated transport accepted')
except EOFError:
    pass
print(json.dumps(value, separators=(',', ':')))
