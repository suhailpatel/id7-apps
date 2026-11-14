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

App identity: `ixdrive`, version `0.2.0`, logging ID `OAXD`; separate settings,
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

## iX Pulse — 11 November 2026

- User requested an EV-focused version of upstream Redline, projected to both
  HUD and cluster. Created `apps/ixpulse` with `npm run new:app`; title iX Pulse,
  ID `ixpulse`, logging ID `OAXP`, version `0.1.1`. Store ID
  `suhailpatel_ixpulse`, dependency `cluster-render >= 0.5.4`; no iXDrive dependency.
  Existing app packages/runtime were unchanged and keep their versions.
- Pulse page shows signed battery kW and charge level with a labelled adaptive
  display scale, speed, pack temperature and voltage. Displays page previews
  the same 400 × 130 artwork sent to the renderer. Cyan/green, white and amber;
  mph default, km/h and Fahrenheit available. Independent placement controls.
- HUD and cluster default off. Image-only `hud` and `panel` overlays, no shaders,
  takeover, exclusivity or renderer configuration changes. Changed rows only at
  a 2 Hz refresh. Only ID7 backend and documented target dimensions accepted.
  Separate HUD/panel scene IDs are needed for simultaneous projection.
- X3 HUD overlays can hide the stock guidance card. HUD is released whenever
  BMW/phone navigation is active, calculating, missing, unknown or stale. All
  four guidance/provider/CarPlay/Android Auto fields must be fresh and inactive.
  Read-only declarations and enums match the supplied head-unit catalogue; their
  live availability remains untested. Missing phone providers can block HUD use.
- Independent read-only battery collector derives from Observatory: five-second
  cycles, one request at a time, candidate fallback/backoff and existing parked
  limits. Only voltage, current, SOC and temperatures are polled. No saved
  telemetry, capacity assumptions or learning. Battery DIDs remain unvalidated
  G08 candidates, labelled UNVERIFIED on both projections. Power expires after
  12 s with a 5 s voltage/current pairing limit; speed 5 s, SOC/temperature 30 s.
- Demo stays on the centre screen and cannot project or train/persist anything.
  Alignment patterns require fresh stationary speed; HUD navigation gate still
  applies. Disconnect drops cached layers before reconnect; inactivity, demo,
  Off and exit release output. Renderer guards/pop-up yielding stay intact.
- Uses the unchanged upstream MPL-2.0 cluster_render_client.js, with packaged
  licence/notice. Other code follows the repository MIT licence. Redline's
  cooperative HUD claim protocol is not implemented; overlapping custom apps
  must be disabled. Renderer status cannot prove physical visibility on the iX3.
- Tests cover freshness, regen classification, navigation gates, collector
  activity/demo boundaries, projection targets, reconnect/refusal/guard behaviour,
  real client wire frames, and both pages. Demo, missing-data, alignment, amber,
  km/h and Fahrenheit previews reviewed. Vehicle projection/telemetry validation
  remains outstanding; no installation or publication performed. Full `npm test`,
  `npm run store:check` and `npm run build:store` passed, including all six Store
  package smoke checks and projection licence/dependency verification.

### iX Pulse driving readouts — 11 November 2026

- User pointed out that the original projections lacked speed and speed limits.
  Version `0.1.2` now gives speed the largest digits on both projections, adds a
  reported-limit badge, and retains battery percentage, signed kW and recovery bar.
  The centre-screen Drive essentials panel also shows the limit. Speed alone can
  keep an overlay available when battery candidates do not answer.
- Added subscribe-only `TrafficSignDisplayControl` display notifications using
  the supplied catalogue's structure and unit/style enums. No added getter or
  diagnostic polling. Only explicitly valid, certain and unconditional numeric
  limits are shown; unavailable/uncertain/conditional limits clear immediately,
  notifications expire after 15 s, and the posted unit is retained independently
  of the user's speed unit. Numeric scaling and live cadence remain unvalidated.
- Projection invalidation includes speed, limit and units; rapid notifications
  cannot redraw/upload more than twice per second. Navigation/expiry eligibility
  checks still run immediately. Demo, missing values and unit changes are tested.
  Full `npm test`, Store checks and all six Store builds passed for `0.1.2`.
  Revised mph, km/h and unavailable-data previews were visually reviewed.

### iX Pulse range, directions and average — 11 November 2026

- User requested remaining range, navigation directions and average kWh on both
  HUD and cluster. Version `0.1.3` adds a range/consumption row and next-turn strip
  to the shared 400 × 200 projection image. Speed, limit, SOC and power remain.
  Default HUD Y is now 100 and cluster Y 330; saved positions remain untouched,
  so existing users should repeat alignment for the taller image.
- Range is the reported electric range from `KombiIF.displayRangeElectricVehicle`,
  paired with explicit `EnvironmentalInformation.UnitBN2020` mileage units.
  It converts to the app's mph/mi or km/h/km preference. Values expire after 30 s,
  units after 60 s, reserved/unknown values remain unavailable, and unit changes
  invalidate old range. G08 numeric scaling still requires live validation.
  The unrelated infrastructure `Range.mileageKilometre` is not used as EV range.
- AVG OBS means net kWh per 100 mi/km from matched battery power and speed this
  app observes, appearing after 1 km. Includes observed regen and stationary
  draw; excludes possible stationary charging. Missing/invalid inputs and gaps
  over 10 s break continuity, with no gap interpolation. No persistent history
  or capacity learning. Resets on app restart, demo transitions or Reset average.
  This is not the car's trip-computer average; candidate battery decoding applies.
- BMW directions use `Guidance.conclusiveDart` reads while guiding; phone routes
  use read-only `GuidanceEventList.queryContent`, one outstanding 900 ms request
  at a time, once per second with failure backoff. Next turn, distance and road
  only, no destination writes, location logs or route storage. Redline's MIT
  manoeuvre decoder is adapted with attribution; own lifecycle/collection code.
- Native/phone provider matching, 3 s turn expiry, activeRouteChanged, cancellation,
  provider and demo generations prevent old arrows. Unsupported/unreliable next
  manoeuvres cannot be replaced with a later known turn. On route start the HUD
  allows 3 s for the first turn; absent/stale directions then hand it back to BMW
  for the rest of that route. Cluster directions can resume independently.
  Unknown/calculating/stale route state also releases HUD. No guard overrides.
- New declarations (nine signal fields plus methods/events/instances) match the
  supplied head-unit catalogue. Tests cover units/sentinels, observed consumption,
  gaps/reset, native/phone turns, reroutes, stale/unsupported directions and bounded
  queries with late-response rejection. Vehicle validation is still outstanding.
  Full `npm test`, `store:check` and all six Store builds passed for `0.1.3`.
  Demo, unavailable-data and km/h/amber projection layouts were visually reviewed.
  No installation, commit, push or remote publication was performed.

### iX Pulse current gear — 11 November 2026

- User requested current gear in both HUD and cluster. Version `0.1.4` adds a
  GEAR readout beside speed without enlarging or moving the projection layer.
- Subscribe-only `VehicleInformation.statusGearboxDrive` and `DataPowerTrain2`
  decode explicit P/R/N/D selector positions; forward gear enums show D for the EV.
  Fresh MDrive `dataDisplayGearbox.B_PROGRAMM` shows B only with a fresh D selector.
  P/R/N override programme information. No speed/RPM inference or gear learning.
- Latest selector reports replace older ones, including ambiguous N/P and invalid
  values. Five-second expiry and demo reset prevent stale gear. Gear-only data can
  keep an output available; changes/expiry invalidate both cached projection images.
- All three field declarations and enums match the supplied head-unit catalogue;
  actual G08 notification cadence, availability and B mode remain unvalidated.
  No diagnostic polling or vehicle writes added. Tests cover enum variants,
  ambiguity, expiry, B precedence, output refresh and demo isolation.
  Full `npm test`, Store checks and all six Store builds passed for `0.1.4`.
  Demo and unavailable-gear projections were rendered and visually reviewed.
  Nothing was installed on the car or published.

### iX Pulse cluster layouts — 11 November 2026

- User requested alternative cluster layouts, particularly the Porsche Taycan.
  Version `0.1.5` adds selectable Taycan-inspired three-instrument and Horizon
  wide digital layouts, plus a Layouts page for side-by-side comparison.
  Porsche's classic curved cluster and Audi's e-tron GT cockpit were reviewed;
  artwork is original canvas drawing, with no imported manufacturer assets.
- Both new layouts retain speed, current gear, reported speed limit and its unit,
  charge level, remaining range, observed average consumption, signed battery kW,
  and next-turn navigation. The Taycan centre dial uses a labelled adaptive kW
  scale, not unverified rated power. No simulated maps or new vehicle signals.
- Compact remains the default; HUD stays 400 × 200. Wide cluster images are
  720 × 300, expanded around the compact image's centre and clamped to the panel.
  Size changes recreate only the cluster image; same-size style changes redraw
  it. Updated row uploads use each image's dimensions and retain the 2 Hz cap.
  Both outputs still default off; all existing telemetry/demo/guard rules apply.
- All 17 iX Pulse checks, the full `npm test`, `store:check` and all six Store
  package builds passed. Store metadata matches `0.1.5`. Demo, missing-data,
  km/h/amber, alignment and side-by-side screens were rendered and inspected.
  G08 telemetry, renderer visibility and physical alignment remain unvalidated;
  recheck parked alignment when changing to a wider layout. No car installation,
  commit, push or publication was performed.

### iX Pulse typography from bimmer-lab — 11 November 2026

- Reviewed `bimmer-lab/apps` at revision
  `e212b4cb8dc09eec9d2ad5e806e949ec0a0a12da`: Cluster Themes, HUD Widgets,
  font sources, pre-rendered atlases and licences. iX Pulse `0.1.6` adds Barlow
  Semi Condensed speed digits (default), squared Michroma digits and the original
  condensed option. Selection applies to centre-screen speed, HUD and cluster.
  Wider cluster views also gain a reported-SOC strip inspired by their readouts.
- Only two font atlases are imported, retaining original glyph artwork/advances;
  their SHA-256 hashes and source revision are pinned in
  `kit/tools/import_ixpulse_fonts.js`. Assets ship in `typefaces.pack`, about 15 KB,
  and retain SIL OFL 1.1 with both copyright notices in the app's `NOTICE`. No
  combustion gauges, control writes, maps or full-cluster takeover were imported.
- Shared font support now registers app-owned atlases with content-keyed renderer
  caching and refuses replacement of existing font families. Other apps keep
  their existing fonts. Because the shared runtime ships in all packages, versions
  are iXDrive/Trip Capsule `0.1.4`, iXCharge `0.1.2`, TyreWatch/iX Observatory
  `0.1.3`, iX Pulse `0.1.6`. Store metadata was regenerated; Trip Capsule's minimum
  iXDrive version follows `0.1.4`. App IDs/storage remain unchanged.
- Full `npm test`, `store:check`, and all six Store builds passed. Checks cover
  protected built-in fonts, atlas revisions, equal digit spacing, three-digit
  fitting, recorded/software glyph agreement, projection font changes and packaged
  font licences/assets. Both typefaces, missing data and three-digit cluster/HUD
  views were rendered and inspected. Live G08 validation remains outstanding.
  No car installation, commit, push or publication was performed.

### iX Pulse additional cluster readouts — 11 November 2026

- Revisited bimmer-lab's configurable readout slots, Cruise/Sport layouts and
  visibility notes; latest upstream revision remains
  `e212b4cb8dc09eec9d2ad5e806e949ec0a0a12da`. Version `0.1.7` adds **Wide cluster
  detail**: Battery (cell-average temperature / pack voltage), Observed trip
  (distance / signed net battery energy), or Off. Battery is the default.
- Taycan and Horizon gain a compact detail row and outlined gear, retaining
  their existing dimensions and positions. All prior essentials remain visible.
  Compact/HUD keep their existing readouts. Upstream's measured X3 M40i
  visibility masks were not assumed to be validated for the G08.
- Reuses existing readings and integration: no extra vehicle signals, requests
  or persistence. Temperature/voltage retain their existing freshness rules;
  observed totals require at least one valid paired interval, include stationary
  draw and moving regen, and exclude charging, invalid data and long gaps.
  Observed net energy can be negative. Reset observed trip clears totals and
  average together; demo transitions also clear them. `AVG OBS*`, `DIST OBS*`
  and `NET OBS*` flag excluded gaps, including gaps after stationary draw.
- All 20 iX Pulse checks, full `npm test`, Store checks and all six package builds
  passed. Battery, observed totals, missing-data, km/h/Fahrenheit/amber and font
  variants were visually reviewed. Only iX Pulse and its generated Store version
  changed to `0.1.7`; other app versions are unchanged. Live iX3 validation is
  still outstanding. This change has not been committed, pushed or installed.

### iX Pulse Map Companion — 11 November 2026

- User requested a slim Map Companion cluster layout showing battery percentage,
  remaining miles and a tiny power/regen bar, with G08 placement and map
  coexistence explicitly pending testing. iX Pulse `0.1.8` adds the selectable
  `companion` style and a dedicated preview tab. The transparent artwork is
  400 × 72, with a signed kW readout and labelled adaptive scale. Range always
  uses miles in this layout, independently of the speed-unit preference.
- No speed, gear, average, turn directions or optional detail row are drawn in
  Map Companion. Existing HUD artwork and other cluster styles remain available.
  Existing cluster size/position controls apply about the compact layer's centre;
  no physical position is claimed to be validated. Projection still defaults off.
- Uses only a non-exclusive `panel` overlay, without contention, guide holds,
  map layers, map ownership or guard overrides. Navigation changes do not repaint
  this strip or change its ownership. If its SOC, range and power all expire, the
  layer is released even if speed/gear remain fresh. Zero SOC is valid. Demo
  stays centre-screen only; no new vehicle signals or polling were added.
- **G08 placement and map coexistence remain untested.** The app and README say
  so. Parked checks still need the actual map open, position/size adjustment, map
  open/close and guidance transitions, warning visibility and removal when Off.
  Local previews demonstrate artwork only, not map coexistence on the vehicle.
- All 22 iX Pulse checks, full `npm test`, `store:check` and all six Store builds
  passed. Normal, unavailable and parked-alignment previews were visually checked.
  Tests cover miles, omitted fields, transparency, image bounds, style switching,
  map-independent layer requests, stale-data release and power-scale refresh.
  Only iX Pulse and its generated Store version move to `0.1.8`. No commit, push
  or car installation was performed for this change.

## iX Service — 11 November 2026

- Standalone app `ixservice` at `0.1.0`, Store ID `suhailpatel_ixservice`.
  Service shows BMW's service requirements and next-service summary. Check
  Control shows active BMW message IDs and titles when the cluster supplies them.
  History retains up to 150 observed changes in private `service.json`.
- Read-only instance 1 fields: `KombiInterface_2.cbsDataServiceList`,
  `cbsDataSBA` and `ccList`, plus `CheckControlMaster.basicList`. Verified
  declarations and data shapes against the captured G08 catalogue. Live
  delivery, list semantics, service text and colours still need on-car checks.
- Four getters at most, serially, every 30 seconds while the main screen is
  visible and within ten minutes of interaction. Passive notifications can
  arrive while the app runs hidden. Live data expires after two minutes or on
  detected provider loss. No inferred resolutions across gaps or malformed lists.
  Explicit demo fixtures never modify real history. No diagnostic scans or resets.
- Five focused tests, full `npm test` with packaged Node 8.16.2 checks, catalogue
  checks, `store:check` and all seven Store builds passed. Demo and unavailable
  states were visually reviewed on all three pages. No car installation or
  publication was performed.

## iXDrive car-feed SOC — 14 November 2026

- User reported the apps did not work at all on the G08 and allowed removing
  non-iX code. Analysis of capture `headunit-20261111T121453Z-i85jrqjx`: all battery
  apps took SOC/voltage/current only from X5 45e UDS candidates at SME `0x07`. The
  car had iXDrive 0.1.0 installed; no other repo apps were installed.
- BMW's stock iX3 apps (preheating, trigger_service, oap-cdc) instead use SOME/IP
  feeds. oap-cdc decodes `Efficiencytainment2.statusChargeOfBatteryHybrid.
  displayChargingConditionHighVoltageStorage` as 0.5 % per bit (255 = no value).
  "Hybrid" is BMW's shared naming; the field is used on this BEV's head unit.
- iXDrive `0.2.0` takes SOC from that feed (getters every 15 s while active, plus
  notifications). Diagnostic `DDBC` SOC, `socWindow` and the capacity hook were
  removed; learning basis changed, so old learning resets. Battery history no
  longer waits for the diagnostic link. Power/cells/12 V remain optional UDS
  candidates: the car exposes no kW/current feed.
- New Diagnostics section **Car EV feeds** (first) shows raw range, max energy,
  energy now/max, net energy, LSC HV data/voltage, trip consumption and power
  share with age and what to compare against; first 12 distinct values per field
  go to the app log. `statusMaxCapacityHVBattery` is 12-bit (default 4095), so its
  kWh scale is unknown and it is not used. All flags pass `check_signals.py`
  against the captured catalogue.
- Trip Capsule `0.1.5` follows iXDrive's minimum version. iXCharge, Observatory and
  iX Pulse still use the X5 45e SOC candidate; port after iXDrive's feed is
  confirmed on the car. Live G08 delivery remains unvalidated; nothing installed.
