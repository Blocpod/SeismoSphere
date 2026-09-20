"""Bounded offline dictation worker. PCM and transcript remain in process memory."""
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import wave

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
directory = Path(__file__).resolve().parent.parent / 'data' / 'speech-small.en'
provider = 'Local Whisper small.en'
try:
    available = all((directory / name).is_file() for name in ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt', 'source.json']) and importlib.util.find_spec('faster_whisper') is not None
    if sys.argv[1] == 'status':
        print(json.dumps({'available': available, 'provider': provider, 'recognizers': [{'language': 'en-US', 'id': 'whisper-small.en', 'name': provider}] if available else []}))
        sys.exit(0)
    if not available:
        raise ValueError('Install local English speech using scripts/setup-speech.ps1, then restart SeismoSphere.')
    request = json.load(sys.stdin)
    if request['language'] != 'en-US':
        raise ValueError('This local Whisper model supports English.')
    audio = base64.b64decode(request['audio'], validate=True)
    with wave.open(io.BytesIO(audio), 'rb') as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2 or not 3200 <= wav.getnframes() <= 480000:
            raise ValueError('Provide 0.2–30 seconds of mono 16 kHz, 16-bit PCM speech.')
        pcm = wav.readframes(wav.getnframes())
    import numpy as np
    samples = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
    segments = []
    if np.max(np.abs(samples)) > 0.0001:
        from faster_whisper import WhisperModel
        model = WhisperModel(str(directory), device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
        recognized, info = model.transcribe(samples, language='en', beam_size=5, temperature=0, condition_on_previous_text=False, vad_filter=True, vad_parameters={'min_silence_duration_ms': 500})
        segments = [{'text': segment.text.strip()} for segment in recognized if segment.text.strip()]
    print(json.dumps({'text': ' '.join(segment['text'] for segment in segments), 'segments': segments, 'provider': provider, 'model': 'small.en / CPU int8', 'language': 'en-US'}, ensure_ascii=True))
except Exception as error:
    print(json.dumps({'error': str(error)}, ensure_ascii=True))
    sys.exit(1)
