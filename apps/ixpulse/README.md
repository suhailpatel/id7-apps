# iX Pulse

A standalone EV-focused companion to Redline's idea, for BMW iDrive 7 and the
G08 iX3: speed, reported speed limit and remaining electric range, observed
average consumption, navigation turns, battery power and recovery, charge level,
temperature and voltage.
Independent app ID and settings; no iXDrive dependency, saved telemetry or learning.

## Screens and projection

- **Pulse:** signed battery kW, charge percentage and an adaptive power bar, plus
  speed, battery temperature and voltage. Miles per hour default; km/h selectable.
- **Displays:** previews of the exact selected projection artwork and individual
  renderer status. Large speed digits, current gear and a reported-limit badge sit alongside
  charge level and battery power, with recovery/power, range and average consumption
  beneath. A bottom strip shows the next turn, distance and road name. Cyan is
  power out; green is power in. White and amber options. Recheck alignment after
  updating from the original shorter overlay; saved placement is preserved.
- **Layouts:** side-by-side previews of two alternative cluster designs. Select
  **Cluster layout** in Settings: **Compact** (the original 400 × 200 artwork,
  still the default), **Taycan** (three round instruments: energy, central speed
  and power, navigation), or **Horizon** (wide digital readouts with a power strip).
  The two wide designs are 720 × 300. All retain speed, gear, the posted limit,
  battery percentage, range, observed consumption and next-turn guidance.
  The HUD always uses its independent compact artwork. The Taycan dial uses
  a labelled adaptive signed kW scale, not a percentage of unverified rated power.
- **Speed typeface:** Barlow (clean, default), Michroma (squared) or the original
  condensed digits, across the centre-screen speed, HUD and cluster. Speed fits
  its reserved space even at three digits; units, gear and road signs stay separate.
  Both wide layouts also show a thin segmented strip for the reported battery level.
- **HUD / Cluster (experimental):** independent Off, On and parked alignment
  pattern settings, plus size and horizontal/vertical placement for each output.
  Both default off. The cluster uses a transparent `panel` overlay, not a
  replacement speedometer. Actual visibility and placement require car testing.

Wide layouts grow around the compact artwork's centre at the same scale and
placement; saved placement settings are retained. Recheck alignment while parked
when changing layout. These are overlays, not a full replacement for BMW's cluster.

Projection requires **Cluster renderer (`cluster-render`)** from Robert
Nisipeanu's idrive-apps source in MGU Store. The centre screen works without it.
The client accepts only the iDrive 7 backend with the documented 800 × 480 HUD
and 1920 × 720 panel targets. Both can run together if the renderer supports their
separate scene IDs; a panel fallback can prevent simultaneous use.

Once separately installed, configure while parked: enable one alignment pattern,
adjust its position and size clear of BMW's gauges and warnings, then select On.
A pattern requires fresh speed at or below 1 km/h. Alignment is intentionally
blocked when speed is unknown. Building this app does not install it on the car.

## Navigation and display ownership

The next turn comes from BMW's `conclusiveDart` or the read-only
`GuidanceEventList.queryContent` for supported CarPlay/Android Auto routes.
Only the currently active provider is used. BMW turns are read once a second
while active; phone queries allow one outstanding request, with failure backoff.
There are no route changes, destination writes or saved roads/locations. Turns
expire after three seconds. Cancel, reroute, provider change and demo mode clear
them and invalidate in-flight responses. Unsupported or unreliable manoeuvres
are withheld rather than substituted with a later turn.

X3 HUD overlays can hide the stock navigation card. iX Pulse allows three seconds
for the first turn to arrive. Once directions go unavailable, it releases its HUD
for BMW's guidance for the rest of that route; the cluster can still show fresh
directions. Calculating routes, missing/unknown or over-15-second-old route state
also release the HUD. All four BMW/provider/CarPlay/Android Auto fields must be
fresh and consistent, so missing providers can prevent HUD use. The interface
declarations/enums match the supplied catalogue; live behaviour remains untested.

The renderer retains its default pop-up yielding and mapping guard. This app
never resets guards, requests exclusive layers, retries slot takeover or changes
renderer configuration. It does not implement Redline's cooperative HUD claim
files: disable other custom HUD/cluster apps if they overlap. Renderer-reported
“Shown” is not proof of visibility through this car's glass.

## Readings and limits

Battery data uses the existing iXDrive/eDrive diagnostic candidates, **not yet
validated on the G08 iX3**. Projection carries an UNVERIFIED label. Positive power
is out of the battery. Negative power says REGEN only with fresh observed movement;
otherwise it says INTO BATTERY, without claiming a charger connection.

Power needs voltage/current no more than five seconds apart, both at most twelve
seconds old. Charge/temperature expire after thirty seconds; speed after five.
Missing data shows `--`. The bar's labelled symmetric scale follows the displayed
power; it is neither motor rating nor available power. There are no assumed
battery capacities, rated power limits or motor temperatures.

**Range** uses `KombiIF.displayRangeElectricVehicle`, with the actual vehicle
distance unit from `EnvironmentalInformation.UnitBN2020`. It never assumes the
app's unit matches the car. Range expires after 30 seconds, units after 60;
unit changes clear old range values. Unknown units and reserved values remain
unavailable. This mirrors the reported electric range rather than estimating
range from a nominal battery size; its G08 scaling still requires validation.

**AVG OBS** is net kWh per 100 miles (mph setting) or 100 km (km/h setting), calculated
from the battery power and distance this app observes. It appears after at least
1 km of matched samples. It includes observed regeneration and stationary draw;
negative power while stationary is excluded as possible charging. Invalid inputs,
stale speed/power and gaps over 10 seconds break integration, without filling the
gap. It is not BMW's trip-computer average or necessarily an entire journey.
It resets on app restart, demo transitions or **Reset average**. Nothing is saved
or learned. Battery decoding limitations also apply to this calculated figure.

Speed uses the existing Vehicle2 signal and may differ from BMW's indicated
speed. The limit comes from `TrafficSignDisplayControl` notifications, with its
explicit reported unit retained even when the speed preference changes. There is
no limit getter or extra polling. Values expire after 15 seconds. Invalid flags,
uncertain sign styles, supplemental conditions, unknown units and cancellation /
unavailable values show `--`; no national-limit or unrestricted value is guessed.
The field layout and enum names match the captured catalogue, but the numeric
display value and notification cadence still need live G08 validation. This is
not a validated replacement for BMW's traffic-sign recognition display.

**Gear** is the reported selector position, P / R / N / D, beside speed on both
projections. Subscribe-only `VehicleInformation.statusGearboxDrive` and
`DataPowerTrain2` provide the position. Explicit forward gear enums show D for
this EV; RPM and vehicle speed never infer a gear. A fresh MDrive `B_PROGRAMM`
shows B only alongside a fresh forward selector position. P/R/N take precedence.
The newest selector report replaces the previous one, including invalid or
ambiguous N/P reports; values expire after five seconds and show `--`.
The catalogue confirms the enum mapping, but availability/cadence and B reporting
still need validation on the iX3. These subscriptions add no diagnostic polling.

Read-only diagnostics run one at a time in five-second cycles with failure backoff.
Getters and diagnostics stop after three minutes without movement AND ten minutes
without interaction. Notifications may resume activity. Running other battery
apps alongside it adds polling. Demo is explicit, isolated and **centre-screen
only**; it never projects, writes history or trains estimates.

Projection sends changed image rows at most twice a second, never custom shaders.
Disconnection drops cached layers so old frames are not replayed at reconnect.
Off, demo, inactivity and shutdown release layers. The app makes no vehicle-control
writes; projection itself only talks to the local renderer service.

## Development

```sh
npm run build:preview -- ixpulse
npm run preview -- dist/ixpulse /tmp/ixpulse-preview BTN_PAGE
node kit/tools/test_ixpulse.js
```

Inspired by [Redline](https://github.com/cauliflowermossgrape/idrive7-apps/tree/main/apps/redline).
Layout references reviewed: [Porsche Taycan's classic and reduced displays](https://newsroom.porsche.com/en_US/products/taycan/interior-design-18552.html)
and [Audi e-tron GT's configurable cockpit](https://www.audi-technology-portal.de/en/electrics-electronics/controls/audi-rs-e-tron-gt-infotainment-and-operating-concept).
The Taycan-inspired layout is original canvas artwork, with no Porsche assets,
branding, simulated maps or unsupported vehicle indicators.
Speed fonts and the calm readout/level-strip ideas come from
[bimmer-lab/apps](https://github.com/bimmer-lab/apps), pinned to revision
`e212b4cb8dc09eec9d2ad5e806e949ec0a0a12da`. Its pre-rendered Barlow and Michroma
glyphs are converted by `kit/tools/import_ixpulse_fonts.js`; source hashes and
provenance are preserved. Font assets retain SIL OFL 1.1, reproduced in `NOTICE`.
The unchanged projection client is MPL-2.0, with its licence and attribution in
`LICENSE` and `NOTICE`; other app code follows the repository MIT licence.
See the [renderer protocol](https://github.com/robertnisipeanu/idrive-apps/blob/main/native/cluster-render/PROTOCOL.md).
