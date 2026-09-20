"""Validate a saved StationXML response and deconvolve one uninterrupted sample window."""
import io
import base64
import json
import sys
import warnings
import numpy as np
import obspy
from obspy import Trace, UTCDateTime, read_inventory
from lxml import etree


def channel_response(request):
    xml, source = base64.b64decode(request['xmlBase64'], validate=True), request['station']
    if len(xml) > 16000000:
        raise ValueError('StationXML exceeds the size limit')
    root = etree.fromstring(xml, parser=etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True))
    if root.getroottree().docinfo.doctype:
        raise ValueError('StationXML document/entity declarations are unsupported')
    inventory = read_inventory(io.BytesIO(etree.tostring(root, encoding='utf-8', xml_declaration=True)), format='STATIONXML')
    start, end = UTCDateTime(request['startUtc']), UTCDateTime(request['endUtc'])
    matches = [c for n in inventory if n.code == source['network'] for s in n if s.code == source['station'] for c in s
               if c.code == source['channel'] and c.location_code == source['location']
               and c.start_date is not None and c.start_date <= start and (c.end_date is None or c.end_date > end)]
    if len(matches) != 1:
        raise ValueError('Expected exactly one response epoch covering this complete waveform interval')
    channel = matches[0]
    if channel.start_date.ns // 1000 != source['startUs'] or (channel.end_date.ns // 1000 if channel.end_date else None) != source['endUs']:
        raise ValueError('Response epoch differs from the saved channel metadata; retrieve updated station metadata')
    response = channel.response
    if not response or not response.response_stages or not response.instrument_sensitivity:
        raise ValueError('A complete response and instrument sensitivity are required')
    sensitivity = response.instrument_sensitivity
    units = sensitivity.input_units.upper().replace(' ', '')
    # Evalresp also supports strain/pressure. Those must not be labeled as displacement/velocity/acceleration.
    physical_units = {prefix + suffix for prefix in ('M', 'NM', 'CM', 'MM') for suffix in ('', '/S', '/SEC', '/S**2', '/SEC**2', '/(S**2)', '/(SEC**2)')} | {'M/S/S'}
    if units not in physical_units or sensitivity.output_units.upper() not in ('COUNTS', 'COUNT'):
        raise ValueError('Response must convert supported translational ground-motion units to digital counts')
    if not np.isfinite(sensitivity.value) or sensitivity.value <= 0 or not channel.sample_rate or channel.sample_rate <= 0:
        raise ValueError('Invalid response sensitivity or sample rate')
    metadata = {'id': '.'.join(source[k] for k in ('network', 'station', 'location', 'channel')),
                'startUtc': str(channel.start_date), 'endUtc': str(channel.end_date) if channel.end_date else None,
                'sampleRateHz': float(channel.sample_rate), 'latitude': float(channel.latitude), 'longitude': float(channel.longitude),
                'inputUnits': sensitivity.input_units, 'outputUnits': sensitivity.output_units,
                'sensitivity': float(sensitivity.value), 'sensitivityFrequencyHz': float(sensitivity.frequency),
                'stages': [{'number': s.stage_sequence_number, 'type': type(s).__name__, 'inputUnits': s.input_units,
                            'outputUnits': s.output_units, 'gain': s.stage_gain, 'gainFrequencyHz': s.stage_gain_frequency}
                           for s in response.response_stages]}
    return response, metadata


def process(request):
    response, metadata = channel_response(request)
    if request['operation'] == 'metadata':
        return {'response': metadata, 'implementation': {'obspy': obspy.__version__, 'validation': 'Exact NSLC, complete interval, matching saved metadata epoch, response stages and physical/count units'}}
    if request['operation'] != 'correct':
        raise ValueError('Unknown response operation')
    values = np.asarray(request['values'], dtype=np.float64)
    fs, options = float(request['sampleRateHz']), request['options']
    if values.ndim != 1 or not 64 <= values.size <= 250000 or not np.isfinite(values).all() or not np.isfinite(fs) or fs <= 0 or not np.isclose(fs, metadata['sampleRateHz'], rtol=1e-8, atol=0):
        raise ValueError('Choose 64–250000 finite samples at the response sample rate')
    output, detrend = options['output'], options['detrend']
    corners = np.asarray(options['preFilterHz'], dtype=float)
    water = options['waterLevelDb']
    fraction = options['taperFraction']
    if output not in ('DISP', 'VEL', 'ACC') or detrend not in ('constant', 'linear'):
        raise ValueError('Unsupported output units or detrending')
    if corners.shape != (4,) or not np.isfinite(corners).all() or not 0 < corners[0] < corners[1] < corners[2] < corners[3] < fs / 2:
        raise ValueError('Four increasing pre-filter corners must lie strictly between zero and Nyquist')
    if water is not None and (type(water) not in (float, int) or not np.isfinite(water) or not 20 <= water <= 120):
        raise ValueError('Water level must be disabled or 20–120 dB')
    if type(fraction) not in (float, int) or not .01 <= fraction <= .2:
        raise ValueError('Time taper fraction must be 0.01–0.20')
    trace = Trace(values.copy(), header={'sampling_rate': fs, 'starttime': UTCDateTime(request['selectionStartUtc'])})
    trace.stats.response = response
    trace.detrend(detrend)
    trace.remove_response(output=output, pre_filt=corners.tolist(), water_level=water, zero_mean=False, taper=True, taper_fraction=fraction)
    if not np.isfinite(trace.data).all():
        raise ValueError('Response correction produced non-finite output')
    frequencies = np.geomspace(max(corners[0] / 2, fs / (values.size * 10)), fs / 2, 256)
    transfer = response.get_evalresp_response_for_frequencies(frequencies, output=output)
    if not np.isfinite(transfer).all():
        raise ValueError('Non-finite instrument transfer function')
    units = {'DISP': 'm', 'VEL': 'm/s', 'ACC': 'm/s²'}[output]
    return {'values': trace.data.tolist(), 'units': units, 'response': metadata,
            'responseCurve': {'frequencyHz': frequencies.tolist(), 'amplitudeCountsPerUnit': np.abs(transfer).tolist(),
                              'phaseRadians': np.angle(transfer).tolist(), 'units': 'counts / (' + units + ')'},
            'implementation': {'algorithm': 'ObsPy full response deconvolution (evalresp)', 'obspy': obspy.__version__, 'numpy': np.__version__,
                               'detrend': detrend, 'output': output, 'preFilterHz': corners.tolist(), 'waterLevelDb': water,
                               'taperFraction': fraction, 'timeTaper': 'ObsPy SAC cosine taper, fraction across both ends',
                               'padding': 'ObsPy internal FFT padding; output trimmed to original sample count',
                               'steps': list(trace.stats.processing)},
            'limitations': ['Band-limited response-corrected motion estimate, conditional on the supplied metadata and processing choices.',
                            'Pre-filtering removes frequencies outside the selected band. Time taper and finite-window deconvolution affect edges.',
                            'No gap filling, resampling, phase picking, event association or propagation inference.',
                            'Output is along the sensor channel orientation; it is not a geographic-component rotation.',
                            'Water-level clipping can suppress useful frequencies, particularly when output differs from native sensor units.']}


if __name__ == '__main__':
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            result = process(json.load(sys.stdin))
            result['warnings'] = list(dict.fromkeys(str(w.message) for w in caught))
        print(json.dumps(result, allow_nan=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
