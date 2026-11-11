#!/usr/bin/env python3
"""Prepare MGU Store listings and SDK-free OAP packages. No network or publishing."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

import build

ROOT = Path(build.ROOT)
PREFIX = 'suhailpatel_'
# Only these reviewed apps are offered. New scaffolded apps remain private by default.
APPS = {
    'ixdrive': ('SIDX', 'EV range, energy, battery and journey dashboard. G08 telemetry awaits vehicle validation.'),
    'ixcharge': ('SIXC', 'Independent charging estimates, session history and power curves. G08 telemetry awaits vehicle validation.'),
    'tyrewatch': ('STYW', 'Tyre pressure, temperature and cool-reading history. G08 field mapping awaits vehicle validation.'),
    'tripcapsule': ('STCP', 'Saved journey cards, labels and favourites. Requires iXDrive running for new journeys.'),
    'ixobservatory': ('SIXO', 'Battery and thermal overview, temperature charts and cell voltages. G08 telemetry awaits vehicle validation.'),
    'ixpulse': ('SIXP', 'EV driving HUD and cluster: speed, range, observed consumption and navigation turns. Requires Cluster renderer; G08 validation pending.'),
}
SHARED = ['kit/runtime', 'kit/platform', 'kit/tools/build.py', 'kit/tools/pack_data.py',
          'kit/tools/localize.py', 'kit/tools/locale-revisions.json', 'LICENSE', 'NOTICE.zh-CN.md', 'docs/PROVENANCE.md']


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def encoded(doc):
    return (json.dumps(doc, indent=2, ensure_ascii=False) + '\n').encode('utf-8')


def listings():
    """Generated publication manifests let local IDs and saved data stay unchanged."""
    files, components = {}, []
    for source, (logging_id, description) in APPS.items():
        spec = read(ROOT / 'apps' / source / 'app.json')
        app_id = PREFIX + source
        directory = 'store/apps/' + app_id
        requires = {'mgu-render': '0.6.19', 'mgu-deploy': '0.6.9'}
        config = {}
        if source == 'ixpulse':
            requires['cluster-render'] = '0.5.4'
        if source == 'ixcharge':
            config['legacySource'] = PREFIX + 'ixdrive'
        if source == 'tripcapsule':
            requires[PREFIX + 'ixdrive'] = read(ROOT / 'apps/ixdrive/app.json')['version']
            config['journeySource'] = PREFIX + 'ixdrive'
        manifest = {'id': app_id, 'sourceApp': source, 'version': spec['version'],
                    'title': spec['title'], 'description': description, 'vendor': 'suhailpatel',
                    'author': 'suhailpatel', 'loggingId': logging_id, 'mguHmi': ['ID7'],
                    'requires': requires, 'config': config}
        files[directory + '/app.json'] = encoded(manifest)
        files[directory + '/icon.png'] = (ROOT / 'apps' / source / 'icon.png').read_bytes()
        components.append({'id': app_id, 'kind': 'app', 'path': directory, 'manifest': 'app.json',
                           'icon': 'icon.png', 'build': {'python': 'kit/tools/build_store.py',
                           'args': ['--component', '{dir}', '--id', '{id}'],
                           'output': 'dist/store/{id}@{version}.tgz', 'network': [],
                           'shared': SHARED + ['apps/' + source]}})
    files['mgu-repo.json'] = encoded({'schema': 1, 'components': components})
    return files


def prepare(check=False):
    different = []
    for name, data in listings().items():
        dest = ROOT / name
        if not dest.is_file() or dest.read_bytes() != data:
            if check:
                different.append(name)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
    if different:
        raise SystemExit('Store listings are out of date; run npm run store:prepare:\n' + '\n'.join(different))
    print('Store listings checked' if check else 'Store listings prepared')


def build_component(directory, app_id):
    if not re.fullmatch(r'[a-z][a-z0-9_]*', app_id):
        raise SystemExit('Invalid installed app ID')
    directory = (ROOT / directory).resolve()
    if ROOT not in directory.parents:
        raise SystemExit('Component must be inside this repository')
    publication = read(directory / 'app.json')
    source = publication.get('sourceApp')
    if source not in APPS or publication.get('id') != app_id:
        raise SystemExit('Component source or installed ID does not match its manifest')
    spec = read(ROOT / 'apps' / source / 'app.json')
    if publication.get('version') != spec['version']:
        raise SystemExit('App version changed; run npm run store:prepare')
    if publication.get('mguHmi') != ['ID7']:
        raise SystemExit('Only ID7 is supported')
    # Do not share logging IDs with a collision-renamed installation.
    if app_id != PREFIX + source:
        publication['loggingId'] = 'S' + hashlib.sha256(app_id.encode()).hexdigest()[:3].upper()
    return Path(build.build(source, publication=publication))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_all(release_tag=None):
    prepare(check=True)
    if release_tag and not re.fullmatch(r'[A-Za-z0-9._-]+', release_tag):
        raise SystemExit('Release tag must contain only letters, numbers, dots, underscores or hyphens')
    out = ROOT / 'dist/store'
    components, titles = [], {}
    for source in APPS:
        app_id = PREFIX + source
        directory = 'store/apps/' + app_id
        meta = read(ROOT / directory / 'app.json')
        artifact = build_component(directory, app_id)
        icon = out / (app_id + '.png')
        shutil.copy(ROOT / directory / 'icon.png', icon)
        url = artifact.name
        if release_tag:
            url = 'https://github.com/suhailpatel/id7-apps/releases/download/' + release_tag + '/' + artifact.name
        entry = {key: meta[key] for key in ('id', 'version', 'title', 'description', 'author', 'mguHmi', 'requires')}
        entry.update({'kind': 'app', 'uninstallable': True, 'icon': icon.name, 'iconSha256': sha(icon),
                      'artifact': {'name': artifact.name, 'size': artifact.stat().st_size,
                                   'sha256': sha(artifact), 'url': url}})
        components.append(entry)
        titles[app_id] = {key: entry[key] for key in ('title', 'description', 'author', 'icon', 'iconSha256')}
    (out / 'catalog.json').write_bytes(encoded({'schema': 2, 'components': components}))
    (out / 'mgu-store.json').write_bytes(encoded({'apps': titles}))
    print('Prepared %d SDK-free packages, icons, catalog.json and mgu-store.json in dist/store/' % len(APPS))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--prepare', action='store_true', help='refresh committed store listings/icons')
    action.add_argument('--check', action='store_true', help='fail if store listings/icons need refreshing')
    action.add_argument('--component', help='build this publication folder, used by MGU Store')
    parser.add_argument('--id', help='installed ID passed by MGU Store, including collision renames')
    parser.add_argument('--release-tag', help='use public GitHub release URLs in the output catalog')
    args = parser.parse_args()
    if args.prepare or args.check:
        prepare(check=args.check)
    elif args.component:
        if not args.id:
            parser.error('--component requires --id')
        build_component(args.component, args.id)
    else:
        if args.id:
            parser.error('--id requires --component')
        build_all(args.release_tag)


if __name__ == '__main__':
    main()
