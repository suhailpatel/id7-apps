# Building future iDrive 7 apps

## New app workflow

1. Run `npm run new:app -- my_app "My App"` from the repository root.
2. Edit `apps/my_app/main.js` and `apps/my_app/app.json`.
3. Run `npm run build:preview -- my_app`.
4. Render with `npm run preview -- dist/my_app /tmp/my-app-preview`, or run
   `npm run emulator -- my_app` for an interactive preview.
5. Add meaningful tests as `kit/tools/test_<name>.js`; `npm test` discovers them.
6. Commit source and artwork. Keep `dist/`, the SDK, credentials and car data local.

The starter requests no vehicle signals and defaults demo off. Preserve a distinct
`id` and four-character `loggingId` for each app. A 140 × 140 `icon.png` overrides
the icon generated from `iconGlyph`. The local builder discovers
`apps/*/app.json`. Store publishing is opt-in: add a reviewed app to
`kit/tools/build_store.py` and run `npm run store:prepare`.

## Runtime basics

The build stages `kit/runtime` beside each app's JavaScript as `./kit/`.
Start an app using `require('./kit/mgu').run({ async start(ctx) { ... } })`.
Use `ctx.canvas(1600, 520)`, `ctx.theme()` and `./kit/gauges` for drawing, then
`ctx.ui.image('MAIN_GFX', canvas)` to present. `ctx.loop('MAIN', 2, render)` supplies
software refreshes and integrates with the GPU renderer. Settings are declared
in `app.json`, read with `ctx.settings.get()` and stored separately per app.
`ctx.dataDir` is the app's persistent storage folder.

App-owned font atlases can be loaded from a data pack and registered once with
`require('./kit/fonts').register('myapp-family', definition)`. Use a unique name
and a content-derived `cacheKey`; the shared renderer uses it to avoid stale glyphs
after an asset update. Definitions use the same `sizes` format as toolkit fonts.
Registration cannot replace existing families. Keep font licences in the app's
`NOTICE`. iX Pulse's `typography.js` is an example; its fonts do not change other
apps' typography.

Declare only the SOME/IP interfaces an app actually needs in `signals`; use
`ctx.signals.watch()` to subscribe. Consult `kit/runtime/signals.js`, existing
apps and `docs/rhmi-widgets.md` for signatures. Diagnostic access uses
`kit/runtime/diag.js` and `dids.js`. Vehicle-specific IDs, units and sign conventions
need validation; a plausible response is not proof of a correct decoder.
Represent unsupported or stale readings as unavailable. Don't silently substitute
demo data or invent nominal capacities. Keep background reads bounded so parked
cars can sleep. The iXDrive activity handling is an example.

## Verification and builds

`npm test` runs only tests included in this workspace. Node 22+ and Python 3.10+
are sufficient for standard previews. The root `.nvmrc` and CI use Node 22;
CI uses Python 3.12. Tests use local Unix sockets for the renderer stand-in and
need permission to bind them. Font regeneration, native renderer builds and
specialized import tools have their own requirements documented beside the tools.

`npm run build:preview` stages every app without the BMW SDK. It produces no
installable package. `npm run build -- <id>` requires your locally extracted
`oap-sdk/`. `kit/tools/extract_sdk.js` is the inherited extraction helper; the SDK
must come from your own head unit. Native renderer source and deployment helpers
are available, but deployment is a separate action.

`npm run build:store` builds complete SDK-free packages under prefixed Store IDs.
See [PUBLISHING.md](PUBLISHING.md). Production JavaScript must run on Node 8.16.2;
Node 22 is only the development/test runner. CI checks packaged pages on Node 8.

## Repository maintenance

Keep toolkit changes separate from app changes when practical. CI runs tests,
stages previews, and smoke-tests the starter generator. Add new app tests to
`kit/tools/` and they will run automatically. Preserve upstream and third-party
licence notices when distributing code. See `docs/PROVENANCE.md` for the imported
revision. Other apps from the original repository were intentionally not copied.
