# id7-apps

Custom apps for BMW iDrive 7, focused on the G08 iX3.

Built on [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps/).
Credit to cauliflowermossgrape and the project's contributors for the app toolkit,
shared runtime and build tools. iX Cluster is adapted from bimmer-lab's
[Cluster Themes](https://github.com/bimmer-lab/apps) (MIT).

## iX Cluster

Thirteen full-screen instrument cluster themes, drawn through Cluster renderer,
with battery power and regen, charge level, battery temperature, electric range,
tyres and a 0-60 timer in place of engine readouts. Themes follow the drive mode
buttons; demo data is off unless switched on. G08 readings and placement still
need validation on the car. [App guide](apps/ixcluster/README.md).

## TyreWatch

Four-wheel pressure and temperature, car pressure targets, cool-reading history
and pressure trends. [App guide](apps/tyrewatch/README.md).

## Development

Requires Node.js 22+ and Python 3.10+. Builds are English-only.
No extra packages are needed for tests or offline previews.

```sh
npm test
npm run build:preview -- tyrewatch
npm run preview -- dist/tyrewatch /tmp/tyrewatch-preview
```

The preview writes PNGs using demo data. Pass `--set demo=off` to disable it.
iX Cluster draws on the instrument cluster, so preview it on the WebGL bench
(`node kit/bench/server.js ixcluster`, then open http://localhost:8078). For the
browser emulator:

```sh
npm run emulator -- tyrewatch
```

See the [emulator guide](docs/emulator.md) for controls and options.

### Create an app

```sh
npm run new:app -- my_app "My App"
npm run build:preview -- my_app
npm run preview -- dist/my_app /tmp/my-app-preview
```

The generator creates `apps/my_app/` with its own IDs, settings and a canvas
screen. See the [development guide](docs/DEVELOPMENT.md) for adding vehicle signals.

### Build for MGU Store

```sh
npm run store:prepare
npm test
npm run build:store
```

The two Store editions use `suhailpatel_` IDs and declare iDrive 7 support.
SDK-free packages, icons and a catalog are written to `dist/store/`. MGU Store
supplies the SDK from the owner's head unit. iX Cluster requires Cluster renderer.
See the [publishing guide](docs/PUBLISHING.md) for branch,
release and USB publishing, and the remaining car checks.

### Private build for the car

Extract your own BMW SDK into `oap-sdk/`, then run:

```sh
npm run build -- ixcluster
```

These packages in `dist/` contain your SDK and must remain private. Preview
builds cannot be installed on a car. Deployment helpers are in `deploy/`.

The [`.gitignore`](.gitignore) excludes the SDK, packages, credentials, vehicle
captures and other local files.

### Copy head-unit reference files

With existing SSH access, collect signal definitions, UI resources and version
files into a new private, Git-ignored folder under `reference/`:

```sh
python3 kit/tools/copy_headunit_reference.py root@HEAD_UNIT_IP -i /path/to/identity_key
```

The script only reads files on the head unit. Add `--dry-run` to inspect its
commands without connecting, `-p PORT` for a custom SSH port, or
`--include-packages` to also copy the original preinstalled BMW app packages.
Use `--output /path/to/folder` to save dated captures outside `reference/`.
See [reference collection details](docs/TELEMETRY_AUDIT.md#automated-read-only-collection).

## Repository

- `apps/` — apps and their documentation.
- `kit/` — runtime, renderer, build tools and tests.
- `templates/basic/` — starter app.
- [Project context](docs/CONTEXT.md) — decisions and outstanding work.
- [Provenance](docs/PROVENANCE.md) — toolkit origin and licensing details.

Original licences and notices are retained: [MIT licence](LICENSE),
[translation notice](NOTICE.zh-CN.md), and separate renderer and font licences
under `kit/`.
