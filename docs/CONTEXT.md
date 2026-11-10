# Project handoff — iXDrive / id7-apps

Updated: 10 November 2026 (Europe/London).
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

App identity: `ixdrive`, version `0.1.0`, logging ID `OAXD`; separate settings,
history and home-screen widget. The icon is a white SUV with a cyan lightning bolt
on black, 140 × 140 PNG, with generation prompt in `apps/ixdrive/icon-prompt.txt`.

Pages:

1. Range dashboard: estimated range to reserve, SOC, energy, pack temperature and
   voltage, live power, recent/trip efficiency, recorded trip distance/time, net
   energy, regeneration, peak draw, 12 V voltage and last charge.
2. Energy: power flow and consumption details.
3. Battery: capacity, health when available, cells and temperatures.
4. Charging: read-only target/energy/time estimates at current battery power.
5. Charge Log: inferred sessions, including SOC changes across sleep.
6. Journeys: persisted observed trips, outside temperature, weekly comparisons,
   estimated costs, browsing older records.
7. Charge Lab: observed power-versus-SOC curves, session comparison, pack
   temperature, energy, peak power and recorded duration.
8. Trends: learned/reported usable-capacity observations and daily cell spread /
   temperature history, with separate series after diagnostic calibration changes.
9. Optional Diagnostics: raw readings, battery unit, scan and signals.

No engine-RPM dependency, hybrid reserve or automatic fallback to a 12 V vehicle
mode. Defaults: demo off, arrival reserve 0%, local charge-estimate target 80%.
The target calculates an estimate; it does not control the car's charging limit.

## Important implementation details

- `main.js`: app integration, SOC learning, charge log, canvas pages and persistence
  in `battery.json`. Shared telemetry is `/tmp/mgu-ixdrive.json` on the head unit.
- `live.js`: live pack power/cells, matched energy and distance, widget, telemetry
  callbacks and `live.json` state. Fresh speed distinguishes regen from charging.
- `range.js`: observed SOC-per-distance range, with richer climate/speed learning
  once usable capacity is known. No nominal battery-size/range fallback.
- `ev.js`: SOC normalization, awake gating, charging estimate, dynamic power scale,
  usable-capacity learner. Two independent drops of at least five SOC percentage
  points must agree within 15%; accepted capacity estimates expire after 30 days.
- `insights.js`: bounded persisted history, restart/gap handling and demo fixtures.
  Retains 200 journeys, 20 charging sessions with up to 240 curve points each,
  365 capacity points and 365 daily battery observations. No GPS route collection.
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

The BMW `oap-sdk` is absent. Preview builds work without it; installable `.mgu`
and `.tgz` packages require the owner's locally extracted SDK. No deployment has
been performed. No supported signal profile for newer iDrive platforms is promised.

## Next useful work

1. Validate raw G08 battery replies against dashboard readings at multiple charge
   levels, including pack voltage/current sign and scale, temperatures and limits.
2. Verify widget layout and runtime behaviour on the actual iDrive 7 head unit.
3. Verify a direct usable-capacity/SOH decoder before enabling those candidate lists.
4. Test learned capacity, trip/session boundaries, parked sleep and history over
   real journeys and charging sessions. Revisit thresholds using captured evidence.
5. Add the SDK locally when available, build an installable package, and treat
   installation as a separate requested action.

## Ideas discussed, not requested for implementation

Smooth Drive, Road Trip/navigation, Cabin Energy, configurable
Dashboard, Energy Weather, What If scenarios, Drive Fingerprint, Charge Garden,
Valet Snapshot, Journey Postcards, Cabin Scenes, Personal Bests and Car Time Capsule.
Journey Journal, Charging Lab and Battery Trends were integrated into iXDrive. Do not
interpret brainstorming as authorization to implement all of these ideas.

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
