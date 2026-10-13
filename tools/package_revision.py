"""Create the delivery ZIP without private runtime files or build-only geography."""
from pathlib import Path
from datetime import datetime
import json, re, zipfile, hashlib

root = Path(__file__).resolve().parents[1]
destination = Path('/Users/timofei/Downloads')
name = 'EV-Option-Grid-N2-Krutya-2026-10-13'
archive = destination / (name + '.zip')
if archive.exists():
    archive = destination / (name + '-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.zip')
excluded_dirs = {'.git', 'node_modules', 'source-data', '__pycache__', '.venv', '.vercel'}
excluded_debug = {'app-before.txt', 'kazan-api.json', 'kazan-water-complete.json', 'overpass-headers.txt', 'overpass-response.txt'}
files = []
secret_pattern = re.compile(rb'(?:sk-(?:proj-|or-v1-|xt-)?[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{30,}|[a-f0-9]{32}\.[A-Za-z0-9_-]{20,})')
for file in sorted(root.rglob('*')):
    if not file.is_file():
        continue
    rel = file.relative_to(root)
    if any(part in excluded_dirs for part in rel.parts):
        continue
    if file.name in {'.DS_Store', 'package-verification.json'} | excluded_debug or file.name.endswith('.pyc'):
        continue
    if file.name.startswith('.env') and file.name != '.env.example':
        continue
    if rel.parts[:2] == ('data', 'moscow-osm') and file.suffix == '.json' and file.name != 'manifest.json':
        continue
    if secret_pattern.search(file.read_bytes()):
        raise RuntimeError('Credential-like data detected in a release file; packaging stopped.')
    files.append((file, rel))
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
    for file, rel in files:
        output.write(file, str(Path(name) / rel))
with zipfile.ZipFile(archive) as check:
    damaged = check.testzip()
    if damaged:
        raise RuntimeError('ZIP integrity check failed: ' + damaged)
report = {'archive': archive.name, 'files': len(files) + 1,
          'zipCRC': 'passed', 'credentialScan': 'passed', 'envLocalIncluded': False,
          'buildOnlySourceDataIncluded': False}
with zipfile.ZipFile(archive, 'a', compression=zipfile.ZIP_DEFLATED) as output:
    output.writestr(name + '/docs/revision-2026-10-13/package-verification.json', json.dumps(report, ensure_ascii=False, indent=2))
with zipfile.ZipFile(archive) as check:
    if check.testzip():
        raise RuntimeError('Final ZIP integrity check failed.')
report.update({'archive': str(archive), 'bytes': archive.stat().st_size,
               'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()})
(root / 'docs/revision-2026-10-13/package-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False))
