# id7-apps

Custom apps for BMW iDrive 7, focused on the G08 iX3.

Built on [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps/).
Credit to cauliflowermossgrape and the project's contributors for the app toolkit,
shared runtime and build tools. iXDrive is adapted from their eDrive app.

## iXDrive

A read-only EV dashboard with:

- Range, charge level, live power and regeneration.
- Learned battery capacity, trip efficiency and energy use.
- Battery temperatures, cell readings and capacity history.
- Charging estimates, session history and comparisons.
- Journey logs, weekly consumption and estimated costs.
- A home-screen widget and diagnostic pages.

Vehicle readings still need validation on the G08 iX3. Missing readings are
shown as unavailable. See [iXDrive's README](apps/ixdrive/README.md) for details.

## TyreWatch

Four-wheel pressure and temperature, car pressure targets, cool-reading history
and pressure trends. [App guide](apps/tyrewatch/README.md).

## Trip Capsule

Saved journey cards from iXDrive, with distance, energy, duration, outside
temperature, labels and favourites. Runs as its own app.
[App guide](apps/tripcapsule/README.md).

## iX Observatory

A battery and thermal overview, temperature charts and cell voltages. Runs
independently of iXDrive; G08 readings require validation.
[App guide](apps/ixobservatory/README.md).

## Development

Requires Node.js 22+ and Python 3.10+. Builds are English-only.
No extra packages are needed for tests or offline previews.

```sh
npm test
npm run build:preview -- ixdrive
npm run preview -- dist/ixdrive /tmp/ixdrive-preview
```

The preview writes PNGs using demo data. Pass `--set demo=off` to disable it.
For the browser emulator:

```sh
npm run emulator -- ixdrive
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

### Build for the car

Extract your own BMW SDK into `oap-sdk/`, then run:

```sh
npm run build -- ixdrive
```

Packages are written to `dist/`. The SDK is not included, and preview builds
cannot be installed on a car. Deployment helpers are in `deploy/`.

The [`.gitignore`](.gitignore) excludes the SDK, packages, credentials, vehicle
captures and other local files. Packages contain BMW's SDK; do not publish them.

## Repository

- `apps/` — apps and their documentation.
- `kit/` — runtime, renderer, build tools and tests.
- `templates/basic/` — starter app.
- [Project context](docs/CONTEXT.md) — decisions and outstanding work.
- [Provenance](docs/PROVENANCE.md) — toolkit origin and licensing details.

Original licences and notices are retained: [MIT licence](LICENSE),
[translation notice](NOTICE.zh-CN.md), and separate renderer and font licences
under `kit/`.
