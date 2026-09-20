"""One exact channel over EarthScope's TLS SeedLink v3 service; no archive polling."""
import base64
import io
import json
import math
import re
import socket
import ssl
import sys
import time

HOST = 'rtserve.earthscope.org'


def emit(value):
    print(json.dumps(value, allow_nan=False, separators=(',', ':')), flush=True)


def exact(stream, count):
    data = bytearray()
    while len(data) < count:
        part = stream.read(count - len(data))
        if not part:
            raise EOFError('SeedLink connection ended')
        data.extend(part)
    return bytes(data)


def decode(packet, channel, received_at):
    from obspy import read
    if len(packet) != 520 or not re.fullmatch(b'SL[0-9A-Fa-f]{6}', packet[:8]):
        raise ValueError('Invalid SeedLink v3 packet')
    traces = read(io.BytesIO(packet[8:]), format='MSEED')
    if len(traces) != 1:
        raise ValueError('Expected one trace in a MiniSEED packet')
    trace = traces[0]
    if trace.id != '.'.join(channel[k] for k in ('network', 'station', 'location', 'channel')):
        return None  # A blank-location wildcard can receive other locations; never mix them.
    rate = float(trace.stats.sampling_rate)
    if not math.isfinite(rate) or rate <= 0 or rate > 1000000 or not 1 <= len(trace.data) <= 10000:
        raise ValueError('Unsupported packet sample rate or count')
    start_ns = trace.stats.starttime.ns
    samples = [[(start_ns + round(i * 1e9 / rate) + 500) // 1000, float(v)] for i, v in enumerate(trace.data)]
    if any(not math.isfinite(v) or abs(t) > 9007199254740991 for t, v in samples):
        raise ValueError('Invalid decoded samples')
    return {'type': 'packet', 'sequence': int(packet[2:8], 16), 'receivedAt': received_at,
            'raw': base64.b64encode(packet).decode('ascii'),
            'segment': {'sampleRateHz': rate, 'samples': samples,
                        'metadata': {'SID': trace.id, 'startNanoseconds': str(start_ns),
                                     'encoding': str(trace.stats.mseed.encoding),
                                     'dataQuality': str(trace.stats.mseed.dataquality),
                                     'sample_count': len(samples),
                                     'timestampPolicy': 'Source nanoseconds retained; sample timestamps rounded to nearest integer microsecond.'}}}


def acquire(config):
    channel = config['channel']
    for key, pattern in [('network', r'[A-Z0-9]{1,2}'), ('station', r'[A-Z0-9]{1,5}'), ('location', r'[A-Z0-9]{0,2}'), ('channel', r'[A-Z0-9]{3}')]:
        if not isinstance(channel.get(key), str) or not re.fullmatch(pattern, channel[key]):
            raise ValueError('Invalid exact channel identifier')
    sequence = config.get('sequence')
    if sequence is not None and (type(sequence) is not int or not 0 <= sequence <= 0xffffff):
        raise ValueError('Invalid resume sequence')
    with socket.create_connection((HOST, 18500), timeout=15) as tcp:
        with ssl.create_default_context().wrap_socket(tcp, server_hostname=HOST) as connection:
            with connection.makefile('rb') as stream:
                def command(text, reply=True):
                    connection.sendall((text + '\r\n').encode('ascii'))
                    if reply and stream.readline(1024).strip() != b'OK':
                        raise ValueError('SeedLink rejected ' + text.split()[0])
                command('HELLO', False)
                greeting = [stream.readline(1024).decode('ascii').strip() for _ in range(2)]
                if not greeting[0].startswith('SeedLink'):
                    raise ValueError('Unexpected SeedLink handshake')
                command('STATION ' + channel['station'] + ' ' + channel['network'])
                command('SELECT ' + (channel['location'] or '??') + channel['channel'] + '.D')
                command('DATA' + (f' {sequence:06X}' if sequence is not None else ''))
                command('END', False)
                connection.settimeout(300)  # No application keepalive faster than EarthScope's four-minute limit.
                emit({'type': 'connected', 'greeting': greeting, 'receivedAt': round(time.time() * 1000)})
                while True:
                    packet = exact(stream, 520)
                    if packet.startswith(b'SLINFO'):
                        continue
                    value = decode(packet, channel, round(time.time() * 1000))
                    if value:
                        emit(value)


if __name__ == '__main__':
    try:
        acquire(json.loads(sys.stdin.readline(8192)))
    except Exception as error:
        emit({'type': 'error', 'error': str(error)[:500]})
        sys.exit(1)
