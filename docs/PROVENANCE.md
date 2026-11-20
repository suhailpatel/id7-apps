# Toolkit provenance

Imported on 10 November 2026 from the local repository
`/Users/Suhail/Development/idrive7-apps`, revision `8048eb091a20c5e2bfe36cda96e938472d2dfdc5`.
Only tracked toolkit, deployment, reference documentation and licence files were
copied. Other vehicle apps, local vehicle data, SDK files and build outputs were
not imported. Translation catalogs, supplemental localization bundles and
translation maintenance tools are omitted at the owner's request. The English
build adapter and original licence notices are retained. iXDrive was moved separately with its tests and project context
(removed on 20 November 2026 with the other EV apps; see the Git history).

The toolkit is derived from the MGU App Kit. Preserve the original attribution
in the root `LICENSE` (MIT) and translation notices. The renderer has separate
licences: `kit/renderd/LICENSE` (GPL-3.0-or-later) and
`kit/renderd/LICENSE.mgu-renderd` (MIT); retain its accompanying notices.
Bundled font notices stay beside their resources. These files keep their original
licensing; the new repository does not relicense them.

The source Git history remains in the original repository. The new repository
starts with focused import commits; it does not rewrite or import unrelated app
history. Upstream helper comments may mention other apps as examples; those apps
are not included. The active test runner contains only tests supported here.

Workspace-specific changes: English-only catalog selection; a starter generator,
test runner and CI workflow; preview output without translation instructions;
and a runtime-test startup error handler so a blocked Unix socket fails visibly
instead of silently skipping its checks. App code is moved without changes.

## Fully electric battery identifiers

The `E54D`, `E561`, `E5CE`, `E554` and `E553` candidate layouts, and the
observation that iX3 battery units refuse `DD68`/`DD69` and answer `DDBC` with
zeros, were ported on 20 November 2026 from upstream eDrive 2.10.0
(`idrive7-apps` commit `c3ec187`, itself ported from elDrive 1.1.0,
github.com/beele/eldrive). Upstream credits captures of 2021-2023 iX3s and the
iX from the OBDb project (`OBDb/BMW-iX3`), licensed CC BY-SA 4.0. The cell
layouts were reported as confirmed on the iX1. Attribution is retained in the
candidate notes in each app's `app.json`. None is validated on this G08.

## iX Cluster

`apps/ixcluster` was adapted on 20 November 2026 from bimmer-lab's Cluster Themes 0.19.0
(github.com/bimmer-lab/apps, commit `ab81cee`), MIT:
the shared engine, the M view, Sport, Minimal, Cruise and Ribbon layouts, shaders,
page, theme fonts and its bench (`kit/bench`, with `kit/tools/shader_budget.js`).
Font atlases that gained characters were re-baked with a copy of its `bake()`
(`kit/tools/bake_ixcluster_fonts.py`). Its own third-party notices (MGU App Kit,
cluster-render client MPL-2.0, Barlow / Michroma / Orbitron / DSEG7 / Outfit OFL,
EVAHUD and the M view port) are kept in `apps/ixcluster/NOTICE`.
