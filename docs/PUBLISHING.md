# Publishing to MGU Store

Prepared against [MGU Store's publishing guide](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md),
revision `fc79a75f07f364c69165dec830f2fa4553ff20e4`, on 11 November 2026.

## App identities

| App | Store ID | Local development ID |
| --- | --- | --- |
| TyreWatch | `suhailpatel_tyrewatch` | `tyrewatch` |
| iX Cluster | `suhailpatel_ixcluster` | `ixcluster` |

The display names and icons stay the same. Store editions have separate settings,
history, RHMI identities and logging IDs. Existing development installs retain
their data; installing a Store edition does not migrate that data.

Both declare **ID7 only**, demo off and no internet requirement.

iX Cluster requires `cluster-render >= 0.5.4`. It draws its themes on the cluster
once installed (pick **Off** for BMW's own cluster). Its NOTICE carries Cluster
Themes' MIT, the cluster-render client's MPL-2.0 and the fonts' OFL notices, and
the full MPL-2.0 text sits beside the client in `javascript/`; the rest of the
package retains the existing licences.

iXDrive, iXCharge, iX Observatory, iX Pulse, iX Service and Trip Capsule were
removed on 20 November 2026 and are no longer offered. Installed copies are not
uninstalled by this; remove them in MGU Store if wanted.

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

`build:store` writes two complete OAP `.tgz` packages, two icons, `catalog.json`
and `mgu-store.json` to `dist/store/`. It never reads or copies `oap-sdk/`, even
when one is present locally. Packages include ID7 UI resources, original licence
notices and font notices. MGU Store supplies the SDK
from the owner's head unit during installation.

Ordinary `npm run build` packages in `dist/` contain the owner's SDK and must
remain private. Publish only the output of `build:store`. Preview builds are
not installable. All build outputs remain ignored by Git.

## Publish from a repository branch

After reviewing and committing the changes, push them to
`suhailpatel/id7-apps`. In MGU Store, add that GitHub repository and choose its
branch channel. The root `mgu-repo.json` lists the two apps and instructs the
Store to build each from source, without network access or SDK extraction.

The Store installs its Python tool for source builds. Each app requires
`mgu-render >= 0.6.19` and `mgu-deploy >= 0.6.9`, provided by the MGU Store source.
The repository no longer offers a duplicate renderer or controller preload.
The existing runtime supports the Store renderer's protocol. Full dial capture
also depends on a separately installed HMI controller gate; verify touch, dial,
BACK and settings on the target car before calling the apps vehicle-tested.

The builder accepts the Store's installed ID and folder arguments, including a
collision rename.

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
metadata. The catalog preserves the renderer dependency. Do not
replace a published version's package; bump the app version and rebuild.

## Validation and remaining car checks

`npm test` builds in a temporary checkout with a dummy SDK present, inspects
archives, checks hashes, identities, dependencies, notices, icons and UI
resources, and runs every packaged app's pages with stubbed vehicle transport.
It also checks demo isolation and a collision-renamed iX Cluster build.

To run those checks with the head unit's JavaScript version:

```sh
ID7_RUNTIME_NODE=/path/to/node-v8.16.2/bin/node python3 kit/tools/test_store.py
```

CI runs the package checks on Node 8.16.2 and uploads SDK-free build artifacts.
The local packages and repository listing were also accepted by MGU Store's
actual catalog/package parser and collision-renaming code at the revision above.

iX Cluster's first car install was refused over a SOME/IP instance (fixed in
0.1.3; `check_signals.py` now checks instances). G08 diagnostic candidates, TPMS
mapping, SDK donor injection, renderer/controller behaviour, cluster placement and
parked polling still need testing on the car. Listings describe
unvalidated telemetry accordingly; software checks do not establish vehicle
compatibility. iDrive 8/9 support is not claimed.
