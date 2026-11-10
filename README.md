# id7-apps

Suhail's BMW **iDrive 7** app workspace, with a reusable MGU toolkit and **iXDrive**
for the G08 iX3. Builds are English-only. This repository is self-contained and
does not depend on the original `idrive7-apps` working folder.

## iXDrive

A read-only electric-vehicle dashboard focused on the BMW G08 iX3 with iDrive 7:

- Range, charge level, live power and regeneration.
- Automatic usable-capacity learning and adaptive power gauges.
- Recent and trip efficiency, recorded distance and energy use.
- Battery temperatures, cell readings and capacity trends.
- Charging estimates, charge history and session comparison charts.
- Journey journal with weekly consumption and estimated-cost comparisons.
- Home-screen widget and optional diagnostic pages.

The app is currently at version **0.1.0**. Software checks and offline previews
pass; its inherited diagnostic readings still need validation on the actual iX3.
Unsupported readings remain unavailable. See [the app documentation](apps/ixdrive/README.md).

## Start here

Use Node.js 22+ and Python 3.10+ (`python3` on your PATH). No npm packages or Python
packages are needed for the standard app tests and software previews.

```sh
npm test
npm run build:preview -- ixdrive
npm run preview -- dist/ixdrive /tmp/ixdrive-preview
```

The preview command writes PNGs and enables demo data unless overridden with
`--set demo=off`. The build step itself does not enable demo in the app.

```sh
npm run emulator -- ixdrive
```

The emulator starts a local development server; see its printed address and
[emulator guide](docs/emulator.md).

## Create another app

```sh
npm run new:app -- my_app "My App"
npm run build:preview -- my_app
npm run preview -- dist/my_app /tmp/my-app-preview
```

The generator creates `apps/my_app/` with an independent ID, unique logging tag,
settings and a simple canvas screen. It refuses to overwrite an existing app.
Read [the development guide](docs/DEVELOPMENT.md) before adding vehicle signals.

## Installable builds

Place your own extracted BMW SDK at `oap-sdk/`, then:

```sh
npm run build -- ixdrive
```

Outputs are `dist/ixdrive@0.1.0.mgu` and `dist/ixdrive@0.1.0.tgz`.
**The SDK is not included.** Offline preview builds are not installable packages.
SDK files, vehicle captures, credentials and packaged outputs stay out of Git.
Deployment helpers are provided under `deploy/`; building does not install an
app or contact a vehicle.

## Files kept out of Git

The root [`.gitignore`](.gitignore) excludes the BMW SDK, build packages, local
SOME/IP references, credentials, dependency folders, generated renderer files,
vehicle captures, logs and backups. It also includes the supplied rules for
optional app datasets and downloaded assets used by future apps.

Keep application source, icons, tests and documentation in Git. Demo mode is for
previewing the interface; synthetic readings must not be saved as real history.

## Layout

- `apps/ixdrive/` — EV dashboard and its own documentation.
- `kit/runtime/`, `kit/platform/` — shared app runtime.
- `kit/tools/` — build, preview, emulator, scaffolding and tests.
- `kit/renderd/` — renderer/controller support, source, prebuilt artifacts and licences.
- `templates/basic/` — source template used by `npm run new:app`.
- `docs/CONTEXT.md` — project handoff, decisions and next steps.
- `docs/PROVENANCE.md` — original toolkit revision and licensing.

See [iXDrive's README](apps/ixdrive/README.md) for features and outstanding vehicle
validation. Shared toolkit code retains its original licences; see `LICENSE`,
`NOTICE.zh-CN.md`, and the separate renderer/font notices.
