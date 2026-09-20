"""One-time model installation. Recognition itself never downloads or sends audio."""
import hashlib
import json
from pathlib import Path
from huggingface_hub import snapshot_download
from faster_whisper import WhisperModel

repository = 'Systran/faster-whisper-small.en'
revision = 'd1d751a5f8271d482d14ca55d9e2deeebbae577f'
directory = Path(__file__).resolve().parent.parent / 'data' / 'speech-small.en'
files = ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt']
snapshot_download(repository, revision=revision, local_dir=str(directory), allow_patterns=files)
WhisperModel(str(directory), device='cpu', compute_type='int8', local_files_only=True)
hashes = {}
for name in files:
    with (directory / name).open('rb') as source:
        hashes[name] = hashlib.file_digest(source, 'sha256').hexdigest()
manifest = {'repository': repository, 'revision': revision, 'files': hashes}
(directory / 'source.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'ready': True, 'directory': str(directory), **manifest}))
