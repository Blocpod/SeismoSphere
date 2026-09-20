"""One-sided modified periodogram of one retained, continuous sample window."""
import json
import sys
import numpy as np


def periodogram(request):
    values = np.asarray(request['values'], dtype=np.float64)
    fs = float(request['sampleRateHz'])
    n = values.size
    if values.ndim != 1 or not 16 <= n <= 250000 or not np.isfinite(values).all() or not np.isfinite(fs) or fs <= 0:
        raise ValueError('Invalid finite sample vector or sample rate')
    if request['window'] not in ('hann', 'boxcar') or request['detrend'] not in ('constant', 'linear'):
        raise ValueError('Unsupported spectral processing')
    mean = values.mean()
    centered = values - mean
    t = np.arange(n, dtype=np.float64) - (n - 1) / 2
    slope = float(np.dot(t, centered) / np.dot(t, t)) if request['detrend'] == 'linear' else 0.0
    residual = centered - slope * t
    window = .5 - .5 * np.cos(2 * np.pi * np.arange(n) / n) if request['window'] == 'hann' else np.ones(n)
    density = np.abs(np.fft.rfft(residual * window)) ** 2 / (fs * np.dot(window, window))
    density[1:-1 if n % 2 == 0 else None] *= 2
    frequencies = np.fft.rfftfreq(n, 1 / fs)
    if not np.isfinite(density).all():
        raise ValueError('Spectral density overflow; sample values exceed numerical range')
    peak = int(np.argmax(density[1:]) + 1) if np.any(density[1:] > 0) else None
    return {
        'frequencyHz': frequencies.tolist(), 'psdCounts2PerHz': density.tolist(),
        'summary': {'samples': n, 'sampleRateHz': fs, 'binSpacingHz': fs / n, 'nyquistHz': fs / 2,
                    'fftDurationSeconds': n / fs, 'sampleSpanSeconds': (n - 1) / fs,
                    'removedMeanCounts': float(mean), 'removedSlopeCountsPerSecond': slope * fs,
                    'residualRmsCounts': float(np.sqrt(np.mean(residual ** 2))),
                    'integratedPsdCounts2': float(density.sum() * fs / n),
                    'peakNonzeroBinHz': float(frequencies[peak]) if peak is not None else None,
                    'peakPsdCounts2PerHz': float(density[peak]) if peak is not None else None,
                    'equivalentNoiseBandwidthHz': float(fs * np.dot(window, window) / window.sum() ** 2),
                    'units': 'digital counts squared / Hz'},
        'implementation': {'algorithm': 'one-sided modified periodogram', 'numpy': np.__version__,
                           'window': request['window'], 'detrend': request['detrend'],
                           'normalization': '|rfft(detrended counts × window)|² / (fs × sum(window²)); double interior positive-frequency bins',
                           'padding': 'none', 'hannConvention': 'periodic (DFT-even)'}}


def raw_analysis(request):
    result = periodogram(request)
    if 'timeFrequency' not in request:
        return result
    options = request['timeFrequency']
    size, hop, n = options['frameSamples'], options['hopSamples'], len(request['values'])
    if type(size) is not int or type(hop) is not int or not 16 <= size <= min(8192, n) or not (size + 3) // 4 <= hop <= size:
        raise ValueError('Choose frame size 16–8192 within the selection and hop between one-quarter and one frame')
    starts = list(range(0, n - size + 1, hop))
    if len(starts) > 1024 or len(starts) * (size // 2 + 1) > 200000:
        raise ValueError('Time-frequency map exceeds 1024 frames or 200000 cells; shorten the selection or increase hop')
    frames = [periodogram({**request, 'values': request['values'][i:i + size]}) for i in starts]
    fs = result['summary']['sampleRateHz']
    centers = [(i + (size - 1) / 2) / fs for i in starts]
    peaks = [f['summary']['peakNonzeroBinHz'] for f in frames]
    result['spectrogram'] = {
        'frequencyHz': frames[0]['frequencyHz'], 'frameStartIndices': starts,
        'frameCenterSeconds': centers, 'psdCounts2PerHz': [f['psdCounts2PerHz'] for f in frames],
        'summary': {'frames': len(starts), 'frequencyBins': size // 2 + 1,
                    'frameSamples': size, 'hopSamples': hop, 'overlapFraction': 1 - hop / size,
                    'frameDurationSeconds': size / fs, 'hopSeconds': hop / fs, 'binSpacingHz': fs / size,
                    'firstCenterSeconds': centers[0], 'lastCenterSeconds': centers[-1],
                    'unusedTailSamples': n - starts[-1] - size, 'peakNonzeroBinHzByFrame': peaks,
                    'units': 'digital counts squared / Hz',
                    'processing': 'Independent detrending and tapering in each complete frame; no padding, gap filling or phase interpretation. Frame times are midpoints of first and last nominal sample times.'}}
    return result


def analyze(request):
    units = request.get('sampleUnits')
    if units is not None and units not in ('m', 'm/s', 'm/s²'):
        raise ValueError('Unsupported physical sample units')
    result = raw_analysis(request)
    if units is None:
        return result
    result['psd'] = result.pop('psdCounts2PerHz')
    summary = result['summary']
    for old, new in [('removedMeanCounts', 'removedMean'), ('removedSlopeCountsPerSecond', 'removedSlopePerSecond'),
                     ('residualRmsCounts', 'residualRms'), ('integratedPsdCounts2', 'integratedPsd'),
                     ('peakPsdCounts2PerHz', 'peakPsd')]:
        summary[new] = summary.pop(old)
    summary.update(sampleUnits=units, units=f'({units})²/Hz', meanSquareUnits=f'({units})²')
    result['implementation']['normalization'] = result['implementation']['normalization'].replace('counts', 'samples')
    if 'spectrogram' in result:
        spectrogram = result['spectrogram']
        spectrogram['psd'] = spectrogram.pop('psdCounts2PerHz')
        spectrogram['summary'].update(sampleUnits=units, units=summary['units'])
    return result


if __name__ == '__main__':
    try:
        print(json.dumps(analyze(json.load(sys.stdin)), allow_nan=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
