# Publishing to MGU Store

Prepared against [MGU Store's publishing guide](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md),
revision `fc79a75f07f364c69165dec830f2fa4553ff20e4`, on 11 November 2026.

## App identities

| App | Store ID | Local development ID |
| --- | --- | --- |
| iXDrive | `suhailpatel_ixdrive` | `ixdrive` |
| iXCharge | `suhailpatel_ixcharge` | `ixcharge` |
| TyreWatch | `suhailpatel_tyrewatch` | `tyrewatch` |
| Trip Capsule | `suhailpatel_tripcapsule` | `tripcapsule` |
| iX Observatory | `suhailpatel_ixobservatory` | `ixobservatory` |
| iX Pulse | `suhailpatel_ixpulse` | `ixpulse` |

The display names and icons stay the same. Store editions have separate settings,
history, RHMI identities and logging IDs. Existing development installs retain
their data; installing a Store edition does not migrate that data.

All six declare **ID7 only**, demo off and no internet requirement. iXDrive and
Trip Capsule default to miles. Trip Capsule requires the Store edition of iXDrive
and reads its fresh journey summaries while both apps run. It does not import
journeys from a development install. Shared files use the installed iXDrive ID:
`/tmp/mgu-<id>.json` and `/tmp/mgu-<id>-trips.json`.

iX Pulse requires `cluster-render >= 0.5.4` for its experimental HUD/cluster
outputs, both off by default. Its centre-screen dashboard is independent of
iXDrive. The projection client carries its MPL-2.0 licence and notice inside
`javascript/`; the rest of the package retains the existing licences.

## Prepare and check

```sh
npm run store:prepare
npm test
npm run build:store
```

`store:prepare` refreshes the manifests and icons in `store/apps/` and the root
`mgu-repo.json`. Run it after changing an app version, title or icon. The app list,
Store descriptions and dependency versions are in `kit/tools/build_store.py`.
New scaffolded apps are not offered until added there. `npm run store:check`
checks for stale generated files without changing them.

`build:store` writes six complete OAP `.tgz` packages, six icons, `catalog.json`
and `mgu-store.json` to `dist/store/`. It never reads or copies `oap-sdk/`, even
when one is present locally. Packages include ID7 UI resources, the iXDrive
widget, original licence notices and font notices. MGU Store supplies the SDK
from the owner's head unit during installation.

Ordinary `npm run build` packages in `dist/` contain the owner's SDK and must
remain private. Publish only the output of `build:store`. Preview builds are
not installable. All build outputs remain ignored by Git.

## Publish from a repository branch

After reviewing and committing the changes, push them to
`suhailpatel/id7-apps`. In MGU Store, add that GitHub repository and choose its
branch channel. The root `mgu-repo.json` lists the six apps and instructs the
Store to build each from source, without network access or SDK extraction.

The Store installs its Python tool for source builds. Each app requires
`mgu-render >= 0.6.19` and `mgu-deploy >= 0.6.9`, provided by the MGU Store source.
The repository no longer offers a duplicate renderer or controller preload.
The existing runtime supports the Store renderer's protocol. Full dial capture
also depends on a separately installed HMI controller gate; verify touch, dial,
BACK and settings on the target car before calling the apps vehicle-tested.

The builder accepts the Store's installed ID and folder arguments, including a
collision rename. Trip Capsule targets the canonical `suhailpatel_ixdrive`
companion; pairing with a collision-renamed iXDrive is not automatic.

## Publish built packages with a catalog

For a public GitHub release named `catalog`:

```sh
npm test
npm run build:store -- --release-tag catalog
```

Review the output, then create or update the `catalog` release and attach the
contents of `dist/store/`. Select **Releases** when adding the repository in MGU
Store. The catalog contains absolute download URLs, package sizes and SHA-256
hashes. If using a different asset release tag, pass that tag instead and still
place `catalog.json` on the `catalog` release.

For USB or an HTTPS folder, use `npm run build:store` without a release tag and
keep the generated catalog, packages and icons together. Its relative URLs work
in those layouts. GitHub catalog URLs need a public repository; a private one
needs asset API URLs assigned after uploading, as described in the upstream guide.

Use the catalog or branch layout, rather than uploading loose packages alone:
the Store version checked here does not import app `requires` from loose package
metadata. The catalog preserves renderer and Trip Capsule dependencies. Do not
replace a published version's package; bump the app version and rebuild.

## Validation and remaining car checks

`npm test` builds in a temporary checkout with a dummy SDK present, inspects
archives, checks hashes, identities, dependencies, notices, icons and UI
resources, and runs every packaged app's pages with stubbed vehicle transport.
It also checks demo isolation, companion pairing and collision-renamed iXDrive.

To run those checks with the head unit's JavaScript version:

```sh
ID7_RUNTIME_NODE=/path/to/node-v8.16.2/bin/node python3 kit/tools/test_store.py
```

CI runs the package checks on Node 8.16.2 and uploads SDK-free build artifacts.
The local packages and repository listing were also accepted by MGU Store's
actual catalog/package parser and collision-renaming code at the revision above.

No installation has been performed. G08 diagnostic candidates, TPMS mapping,
SDK donor injection, renderer/controller behaviour, parked polling and saved
history across real journeys still need testing on the car. Listings describe
unvalidated telemetry accordingly; software checks do not establish vehicle
compatibility. iDrive 8/9 support is not claimed.
