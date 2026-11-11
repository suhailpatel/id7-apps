# Project handoff — iXDrive / id7-apps

Updated: 11 November 2026 (Europe/London).
New home: `/Users/Suhail/Development/id7-apps`.
Previous repo: `/Users/Suhail/Development/idrive7-apps`.
Source revision: `8048eb091a20c5e2bfe36cda96e938472d2dfdc5`.

## User decisions

- Suhail owns a BMW G08 iX3. Initially investigated eDrive, then explicitly chose
  a separate EV-focused fork called **iXDrive**, in `apps/ixdrive`.
- eDrive and the other original apps stay in the old repository.
- Broader iX1/iX support was discussed, then scope was narrowed explicitly to
  **iDrive 7**. Do not claim support for iDrive 8/9 cars.
- Capacity and power should be automatic, without manual model/battery/power
  settings. Read verified values when available; otherwise learn clearly labelled
  estimates. Unknown data stays blank.
- Prefer a polished dashboard, concise labels and brief explanations. The user
  asked for more telemetry and a visually useful layout rather than long prose.
- Miles are the default distance unit in iXDrive and Trip Capsule; kilometres
  remain selectable. Existing saved unit preferences are retained.
- English is sufficient. The new workspace intentionally omits translation
  catalogs and translation maintenance; preserve original copyright notices.
- Move the app and working context here, prepare the repo for future apps, and
  make logically separate commits. No remote push or vehicle deployment requested.

## Implemented state

App identity: `ixdrive`, version `0.1.3`, logging ID `OAXD`; separate settings,
history and home-screen widget. The icon is a white SUV with a cyan lightning bolt
on black, 140 × 140 PNG, with generation prompt in `apps/ixdrive/icon-prompt.txt`.

Pages:

1. Range dashboard: estimated range to reserve, SOC, energy, pack temperature and
   voltage, live power, recent/trip efficiency, recorded trip distance/time, net
   energy, regeneration, peak draw, 12 V voltage.
2. Energy: power flow and consumption details.
3. Battery: capacity, health when available, cells and temperatures.
4. Journeys: persisted observed trips, outside temperature, weekly comparisons,
   estimated costs, browsing older records.
5. Trends: learned/reported usable-capacity observations and daily cell spread /
   temperature history, with separate series after diagnostic calibration changes.
6. Optional Diagnostics: raw readings, battery unit, scan and signals.

Charging, Charge Log and Charge Lab moved to standalone iXCharge on 11 November.

No engine-RPM dependency, hybrid reserve or automatic fallback to a 12 V vehicle
mode. Defaults: demo off, arrival reserve 0%. iXCharge has its own 80% estimate target;
that target does not control the car.

## Important implementation details

- `main.js`: app integration, SOC learning, driving canvas pages and persistence
  in `battery.json`. Shared telemetry is `/tmp/mgu-ixdrive.json` on the head unit.
- `live.js`: live pack power/cells, matched energy and distance, widget, telemetry
  callbacks and `live.json` state. Fresh speed distinguishes regen from charging.
- `range.js`: observed SOC-per-distance range, with richer climate/speed learning
  once usable capacity is known. No nominal battery-size/range fallback.
- `ev.js`: SOC normalization, awake gating, dynamic power scale,
  usable-capacity learner. Two independent drops of at least five SOC percentage
  points must agree within 15%; accepted capacity estimates expire after 30 days.
- `insights.js`: bounded persisted history, restart/gap handling and demo fixtures.
  Retains 200 journeys, 365 capacity points and 365 daily battery observations.
  No GPS route collection.
- Driving history represents observed telemetry, not odometer distance. Gaps and
  restarts are marked partial. Charging curves never fill sleeping periods.
- Demo fixtures never train or persist real histories. Unknown values are not zero.
- Background reads stop once movement is absent for 3 minutes AND interaction
  for 10 minutes. New history features do not add diagnostic polling.

## Verified and unverified

Software has 23 iXDrive integration/render checks, 8 history checks and 9 new-app checks, plus shared
runtime/DID tests. Earlier previews were checked for English layouts, missing
readings, kilometres/miles and Celsius/Fahrenheit. New repo checks are recorded
in the migration commit(s); run `npm test` and rebuild after changing source.

**Not yet validated on the actual iX3.** SOC, current, voltage, current limits,
cells, temperature and climate candidates were inherited from eDrive; their
plausibility does not establish correct G08 decoding. Capacity and SOH candidate
lists are deliberately empty. Direct factory capacity detection is not verified;
current usable capacity is learned if valid SOC/power data are available.

A local extracted BMW `oap-sdk` version 24.10.2 is now present and ignored by Git.
Preview builds work without it; private builds use that local SDK; Store builds now produce SDK-free
`.tgz` packages for donor injection by MGU Store. No deployment has
been performed. No supported signal profile for newer iDrive platforms is promised.

## Next useful work

1. Validate raw G08 battery replies against dashboard readings at multiple charge
   levels, including pack voltage/current sign and scale, temperatures and limits.
2. Verify widget layout and runtime behaviour on the actual iDrive 7 head unit.
3. Verify a direct usable-capacity/SOH decoder before enabling those candidate lists.
4. Test learned capacity, trip/session boundaries, parked sleep and history over
   real journeys and charging sessions. Revisit thresholds using captured evidence.
5. Obtain the matching head-unit SOME/IP catalogue and G08 diagnostic evidence.
   Treat any build installation as a separate requested action.

## Ideas discussed, not requested for implementation

Smooth Drive, Road Trip/navigation, Cabin Energy, configurable
Dashboard, Energy Weather, What If scenarios, Drive Fingerprint, Charge Garden,
Valet Snapshot, Journey Postcards, Cabin Scenes, Personal Bests and Car Time Capsule.
Journey Journal and Battery Trends remain in iXDrive; Charging Lab is now in
iXCharge. Do not interpret brainstorming as authorization to implement all of these ideas.

## Continuing work

Open this repository as the working folder for the next task. Read `AGENTS.md`,
this handoff and `apps/ixdrive/README.md`. The original chat stays in Codex; this
file carries the substantive decisions and technical context into the repo.
For another app, run `npm run new:app -- app_id "App Title"` and follow
`docs/DEVELOPMENT.md`. No dependency on the old working tree is intended.

## TyreWatch — 10 November 2026

- `apps/tyrewatch`: four-wheel TPMS display, vehicle targets, independent display
  units, bounded cool-reading history and conservative temperature-matched trends.
  Explicit vehicle units are required; stale readings clear after 30 seconds.
  Read-only TPMS getters pause after 3 minutes without movement and 10 minutes
  without interaction. Cold-start candidates need observed movement history,
  three hours of rest and fresh temperature/speed; they cannot prove parking while
  the app was stopped. Field mapping comes from upstream car_vitals, not G08 testing.
- Source artwork: `kit/tools/make_tyrewatch_icon.js`.
  Tests: `kit/tools/test_tyrewatch.js` (five checks).
- Demo and empty-history previews were checked. No G08 vehicle validation or
  installation has been performed.

## Trip Capsule — 10 November 2026

The user explicitly chose a separate app, not another iXDrive page.

- `apps/tripcapsule`: independent journey cards, preset labels, favourites and
  offline saved browsing. No free-text notes yet. Retains the latest 200 cards,
  including favourites. No GPS or cloud. Data and annotations are in capsules.json.
- iXDrive publishes a versioned real journey summary every 5 seconds to
  `/tmp/mgu-ixdrive-trips.json`, with an explicit demo marker instead of synthetic
  records in demo mode. Trip Capsule imports fresh summaries and preserves its
  own annotations. Both apps must run for fresh data; saved cards survive restarts.
- Source artwork: `kit/tools/make_tripcapsule_icon.js`.
  Tests: `kit/tools/test_tripcapsule.js` (four checks), plus the journey transport
  and demo boundary in `test_ixdrive.js`.
- Full `npm test` passed. All three apps built in preview mode; cards, favourites
  and imperial units were rendered and checked. No G08 vehicle validation,
  SDK build, installation or remote push has been performed.

## iX Observatory — 10 November 2026

The user requested a separate iX Observatory app after discussing a component
view with battery, motor and coolant temperatures and changes over time.

- `apps/ixobservatory`: Overview, Temperatures and Cells pages, own app identity
  and icon. Direct read-only collection; does not depend on iXDrive being open.
- Existing iXDrive battery candidate layouts are copied into the app config.
  Motor candidates are empty, and the UI leaves motor temperature unavailable.
  No new verified G08 decoding is claimed. Battery current/power are signed
  positive out of the pack. The schematic depicts components, not coolant routing.
- One request at a time, 5-second cycle timer, backoff after repeated failures,
  and the established 3-minute movement / 10-minute interaction activity limits.
  The app adds its own polling if run alongside iXDrive; no vehicle writes.
- Independent timestamp expiry, synchronized voltage/current, explicit missing
  values and segmented 10/30/60-minute charts. History is in memory only, bounded
  to 720 points. Demo is explicit and isolated, including in-flight replies.
- Up to 512 cells supported, with 96 per page. No physical G08 cell count assumed.
  Celsius default; Fahrenheit configurable. Icon source: make_ixobservatory_icon.js.
- Full `npm test` passed, including seven Observatory checks. Preview build
  passed; all three pages, missing data and Fahrenheit layouts were reviewed.
  Tests: kit/tools/test_ixobservatory.js. Vehicle validation and an SDK build
  remain outstanding; no installation has been requested or performed.


## MGU Store preparation — 11 November 2026

At Store preparation, all four apps and their Store editions were `0.1.1`, with
Trip Capsule requiring iXDrive `0.1.1`. Current versions are recorded below.

- User requested publishing preparation against robertnisipeanu/mgu-store and
  explicitly chose the `suhailpatel_` prefix. All four apps have generated Store
  manifests/icons in `store/apps/`, offered by `mgu-repo.json`. Local app IDs and
  storage remain unchanged. Store editions start with separate data.
- `npm run store:prepare`, `store:check` and `build:store` manage listings and
  complete SDK-free packages in `dist/store/`. No SDK is read or copied, even
  if present locally. Original licences and font notices accompany packages.
- Dependencies: Store renderer/deploy tools; Trip Capsule additionally requires
  `suhailpatel_ixdrive`. Shared telemetry paths derive from the installed ID;
  Trip Capsule checks the source identity. Full dial capture still requires a
  separately installed controller gate. Collision-renamed iXDrive builds work,
  but Trip Capsule pairs with the canonical Store iXDrive ID.
- Removed Node APIs unavailable on the head unit from Observatory. Production
  target is Node 8.16.2; development tests remain on Node 22. Package smoke checks
  exercise all pages and companion transport; CI includes the older runtime.
- See docs/PUBLISHING.md for source-branch/catalog publishing and verification.
  Prefer those layouts: this Store revision ignores dependencies in loose app
  package metadata. The public catalog has hashes, sizes, IDs, ID7 compatibility,
  dependencies and icons. No release, push or vehicle installation was performed.
- All vehicle-validation limitations above still apply. Range Lab was cancelled
  before implementation and remains outside scope.


## iXCharge separation — 11 November 2026

- User requested extracting charging from iXDrive and explicitly chose independent
  operation. Generated `apps/ixcharge` using `npm run new:app`; ID `ixcharge`,
  logging ID `OAXC`, version `0.1.0`. Store ID `suhailpatel_ixcharge`, no iXDrive
  dependency. iXDrive and Trip Capsule are now `0.1.2`; TyreWatch and Observatory
  remain `0.1.1`. Trip Capsule's Store minimum iXDrive version is `0.1.2`.
- Charging, Charge Log and Charge Lab moved to iXCharge, along with the local
  estimate target. iXDrive retains Range, Energy, Battery, Journeys, Trends and
  optional diagnostics; its last-charge card and new charge recording are removed.
- Independent read-only battery diagnostics, own capacity learner and atomic
  `charging.json` persistence. Candidate provenance, unknown values, no nominal
  capacity, parked limits and explicit isolated demo are retained. No plug-state
  or AC/DC detection is claimed. Additional polling occurs if both apps run.
- Legacy iXDrive records remain stored there. Updated iXDrive publishes a bounded
  migration-only snapshot to `/tmp/mgu-<installed-id>-legacy-charges.json`.
  iXCharge imports matching fresh non-demo history once into its own bounded
  storage, preserving source and separate calibration eras. Both apps need to run
  together only for this import. Store and local installations remain separate.
- Power curves use observed intervals only; sleep SOC rises can appear in the log
  without curves. Unknown energy remains unavailable; costs assume 10% overhead.
  iXCharge learns its own capacity while it runs during driving.
- Tests cover independent collection, sleep/restart records, demo cancellation,
  parked backoff, gaps/regen, capacity learning, history migration and all pages.
  Full `npm test`, `store:check` and `build:store` passed. Demo, missing readings,
  Fahrenheit and reduced iXDrive navigation previews were reviewed. Store packages
  contain all five apps with matching versions and dependencies. Vehicle decoding remains unvalidated;
  no installation or remote publication is requested.


## SDK telemetry audit — 11 November 2026

- User requested checking every app against the SDK. The local extraction has
  126 source modules, identifies itself as 24.10.2, and remains excluded from Git.
  Its native read/subscribe calling conventions match our runtime. TyreWatch's
  named pressure/temperature units match all 20 tested SDK combinations.
- This extraction does not include most vehicle signal schemas or SME diagnostic
  definitions. The local SOME/IP catalogue is absent; the user confirmed they do
  not have it and asked how to obtain it. No G08 telemetry mapping was promoted
  from candidate to validated, and no car connection or installation was made.
- The initial audit reproduced these iXDrive issues (fixed below): periodic SOME/IP getters bypass parked
  and demo gates; fresh current can be combined with up to 60-second-old voltage;
  ambient/climate and the broadcast battery-temperature fallback lack expiry.
  Downstream journey/capacity figures can inherit those data-quality problems.
- Full per-app/mapping findings and read-only catalogue-copy instructions are in
  [the telemetry audit](TELEMETRY_AUDIT.md). `node kit/tools/audit_sdk.js` repeats
  the isolated SDK and application checks without contacting the car.
- This audit adds tooling/documentation only; app versions are unchanged.

## Head-unit reference collection — 11 November 2026

- Added `kit/tools/copy_headunit_reference.py` at the user's request, accepting an
  SSH identity key, host/alias and optional port. It reads signal catalogues and
  definitions, OAP UI resources/manifests/configuration and firmware identifiers
  into unique Git-ignored `reference/headunit-*` snapshots with checksums.
- `--output` selects another parent folder. The user requested
  `/Users/Suhail/Development/Workspaces/2026-11-11-bmw-oap-sdk`; captures there use
  dated subfolders and are outside this repository's Git-ignore coverage.
- Stock packages, individual app logs and additional schema directories are
  explicit options. Remote operations only list/read/stream files; no deployment,
  vehicle diagnostics or remote temporary files. Existing SSH access is required.
- The user requested no test additions. No actual head-unit collection or new
  vehicle validation has been performed. No shipped app changes or version bumps.
- The first user-run collection reported optional missing directories and failed
  with `/bin/sh: Argument list too long`. The collector now streams the filename
  list to `tar -T -` over SSH stdin instead of putting it in the remote command;
  optional-path notices no longer obscure transfer errors. Awaiting a successful
  head-unit retry; no tests run for this fix at the user's request.


## iXDrive freshness fixes and headunit capture — 11 November 2026

- Fixed parked/demo gating for initial, reconnect and periodic SOME/IP getters;
  notifications can still resume collection on movement. Queued getters and late
  replies recheck activity and demo generation, and overlapping getters are bounded.
- Power now requires voltage/current within five seconds. Missing input breaks
  energy, capacity-learning and journey continuity, including subsecond failures.
- Auxiliary signals expire independently after 60 seconds; climate is computed
  from fresh zone inputs. Slow diagnostic values expire at the existing stale
  deadline (`max(30 seconds, 4 × slowPoll)`) instead of remaining dimmed ten minutes.
- Shared runtime packaging requires all app versions to advance: iXDrive and Trip
  Capsule 0.1.3, iXCharge 0.1.1, TyreWatch and iX Observatory 0.1.2. Trip Capsule's
  generated Store minimum follows iXDrive 0.1.3. App IDs/storage are unchanged.
- User supplied capture `headunit-20261111T121453Z-i85jrqjx` outside the repository.
  Its catalogue contains 689 interfaces. All five apps' declared fields, methods,
  read/subscribe permissions match. Telemetry instance 1 and diagnostic instance
  SystemFunctionsInternalTasuInst1 (128) are present. Wrapper members,
  sentinel defaults and TyreWatch's numeric unit enums also match the catalogue.
- Captured preinstalled x_call 4.25.3 contains SDK 24.10.2 and BMW converters that
  agree with our speed and ambient scaling. Installed x_call 4.84.32 metadata names
  SDK ^27.40.4, but its JavaScript bundle was not captured; the older preinstalled
  bundle cannot establish behavior of the updated installed version.
- Catalogue membership is not proof of live availability or physical scaling.
  No G08 diagnostic dictionary or measurement logs were found. Battery DIDs remain
  candidates. See TELEMETRY_AUDIT.md for evidence and the remaining useful captures.
- Verification passed: full `npm test`, refreshed Store listing checks, all five
  package smoke tests and `build:store`. Demo and unavailable Battery screens were
  rendered and visually reviewed. The capture-aware SDK audit checks 25 signal
  declarations and reproduces no parked reads or stale-voltage integration.
  Nothing was installed on the car or published.
