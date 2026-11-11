#!/usr/bin/env python3
"""Build and inspect publications in an isolated copy, including an SDK trap."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'kit/tools'))
import build_store as store


def run(*args, cwd):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result.stdout


def main():
    store.prepare(check=True)
    with tempfile.TemporaryDirectory(prefix='id7-store-test-') as tmp:
        root = Path(tmp)
        paths = set(store.SHARED + ['kit/tools/build_store.py', 'kit/tools/check_store_runtime.js',
                                    'store', 'mgu-repo.json'] + ['apps/' + s for s in store.APPS])
        for relative in paths:
            src, dst = ROOT / relative, root / relative
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                shutil.copytree(src, dst, ignore=shutil.ignore_patterns('__pycache__'))
            else:
                shutil.copy(src, dst)
        # An installed local SDK must never change what the public build ships.
        sdk = root / 'oap-sdk'
        sdk.mkdir()
        marker = 'PRIVATE_SDK_MUST_NOT_SHIP'
        (sdk / 'index.js').write_text(marker)
        (sdk / 'package.json').write_text(json.dumps({'name': 'oap-sdk', 'version': '1.0.0'}))
        run(sys.executable, 'kit/tools/build_store.py', cwd=root)
        out = root / 'dist/store'
        catalog = json.loads((out / 'catalog.json').read_text())
        assert catalog['schema'] == 2 and len(catalog['components']) == 4
        uuids, logs, checked_js = set(), set(), set()
        for c in catalog['components']:
            app_id = c['id']
            source = app_id.removeprefix(store.PREFIX)
            artifact = out / c['artifact']['name']
            assert c['artifact']['size'] == artifact.stat().st_size
            assert c['artifact']['sha256'] == store.sha(artifact)
            assert c['iconSha256'] == store.sha(out / c['icon'])
            assert (out / c['icon']).stat().st_size <= 128 * 1024
            with tarfile.open(artifact) as tf:
                members = tf.getmembers()
                assert all(m.name.startswith('package') and '..' not in Path(m.name).parts for m in members)
                assert not any('oap-sdk' in m.name or m.issym() or m.islnk() for m in members)
                data = {m.name.removeprefix('package/'): tf.extractfile(m).read() for m in members if m.isfile()}
                assert all(marker.encode() not in b for b in data.values())
            pkg = json.loads(data['package.json'])
            spec = json.loads(data['javascript/kit/app-spec.json'])
            hmi = json.loads(data['rhmiData/application.json'])['application']
            assert pkg['name'] == spec['id'] == hmi['name'] == app_id
            assert pkg['version'] == c['version'] and pkg['mguHmi'] == ['ID7']
            assert pkg['requires'] == c['requires'] and pkg['mguInternet'] is False
            assert pkg['license'] == 'MIT' and data['LICENSE'] == (ROOT / 'LICENSE').read_bytes()
            assert 'javascript/kit/fonts/OFL-NotoSansSC.txt' in data
            assert data['icon.png'] == (ROOT / 'apps' / source / 'icon.png').read_bytes()
            assert 'rhmiData/uiDescriptions/ID7/application.xml' in data
            assert 'rhmiData/uiDescriptions/ID7/uiDescription.json' in data
            assert all(u['hmi'] == ['ID7'] for u in hmi['uiDescriptions'])
            assert set(json.loads(data['config/base.json'])['settings']) == {app_id}
            assert hmi['uuid'] not in uuids
            uuids.add(hmi['uuid'])
            assert pkg['oapAppSettings']['loggingId'] not in logs
            logs.add(pkg['oapAppSettings']['loggingId'])
            assert json.loads((root / 'apps' / source / 'app.json').read_text())['id'] == source
            assert next(s for s in spec['settings'] if s['key'] == 'demo')['default'] == 'off'
            if source in ('ixdrive', 'tripcapsule'):
                assert next(s for s in spec['settings'] if s['key'] == 'distUnit')['default'] == 'mi'
            if source == 'ixdrive':
                assert 'rhmiDataStartWidget/application.json' in data
            if source == 'tripcapsule':
                assert pkg['requires']['suhailpatel_ixdrive'] == store.read(ROOT / 'apps/ixdrive/app.json')['version']
                assert spec['config']['journeySource'] == 'suhailpatel_ixdrive'
            app_data = root / ('data-' + source)
            app_data.mkdir()
            node = os.environ.get('ID7_RUNTIME_NODE', 'node')
            for name, body in data.items():
                if name.endswith('.js') and body not in checked_js:
                    run(node, '--check', str(root / 'dist/store-build' / app_id / 'source' / name), cwd=root)
                    checked_js.add(body)
            print(run(node, 'kit/tools/check_store_runtime.js',
                      str(root / 'dist/store-build' / app_id / 'source'), str(app_data), cwd=root).strip())
        # Mimic the Store's manifest/folder rename. Build under the supplied ID.
        original = root / 'store/apps/suhailpatel_ixdrive'
        renamed = original.with_name(original.name + '2')
        shutil.copytree(original, renamed)
        meta = json.loads((renamed / 'app.json').read_text())
        meta['id'] = renamed.name
        (renamed / 'app.json').write_text(json.dumps(meta))
        run(sys.executable, 'kit/tools/build_store.py', '--component', str(renamed), '--id', renamed.name, cwd=root)
        stage = root / 'dist/store-build' / renamed.name / 'source'
        assert json.loads((stage / 'package.json').read_text())['name'] == renamed.name
        assert json.loads((stage / 'rhmiData/application.json').read_text())['application']['uuid'] not in uuids
        renamed_data = root / 'data-renamed'
        renamed_data.mkdir()
        print(run(node, 'kit/tools/check_store_runtime.js', str(stage), str(renamed_data), cwd=root).strip())
        run(sys.executable, 'kit/tools/build_store.py', '--release-tag', 'catalog', cwd=root)
        published = json.loads((out / 'catalog.json').read_text())
        for c in published['components']:
            assert c['artifact']['url'] == 'https://github.com/suhailpatel/id7-apps/releases/download/catalog/' + c['artifact']['name']
            assert c['artifact']['sha256'] == store.sha(out / c['artifact']['name'])
        # Version drift must fail before artifacts are offered.
        p = root / 'apps/ixdrive/app.json'
        spec = json.loads(p.read_text())
        major, minor, patch = map(int, spec['version'].split('.'))
        spec['version'] = f'{major}.{minor}.{patch + 1}'
        p.write_text(json.dumps(spec))
        result = subprocess.run([sys.executable, 'kit/tools/build_store.py', '--check'], cwd=root, capture_output=True)
        assert result.returncode != 0
    print('PASS Store archives, SDK exclusion, metadata, dependencies, IDs, notices and version-drift checks')


if __name__ == '__main__':
    main()
