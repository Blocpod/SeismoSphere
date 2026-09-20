"""Verify every retained binary packet against the exported decoded samples."""
import base64
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'model'))
from seedlink import decode

record = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/seedlink-capture.json').read_text(encoding='utf-8'))['record']
raw = base64.b64decode(record['raw'], validate=True)
assert hashlib.sha256(raw).hexdigest() == record['receipt']['sha256']
assert len(raw) == len(record['segments']) * 520 == record['receipt']['bytes']
for i, segment in enumerate(record['segments']):
    packet = raw[i * 520:(i + 1) * 520]
    receipt = record['receipt']['packets'][i]
    assert hashlib.sha256(packet).hexdigest() == receipt['sha256'] == record['query']['packetHashes'][i]
    decoded = decode(packet, record['station'], receipt['receivedAt'])
    assert decoded['sequence'] == receipt['sequence']
    assert decoded['segment'] == segment
print(json.dumps({'id': record['id'], 'packets': len(record['segments']), 'samples': sum(len(s['samples']) for s in record['segments']), 'allSamplesExact': True, 'sourceSha256': record['receipt']['sha256']}))
