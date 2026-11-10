# iX Observatory

A read-only battery and thermal dashboard for BMW iDrive 7, focused on the G08 iX3.
It reads vehicle telemetry directly; iXDrive does not need to be open.

## Views

- **Overview:** component diagram, battery temperature range, charge level,
  cell-voltage spread, coolant temperature, outside temperature, voltage,
  current and battery power. Positive current/power means out of the battery;
  negative means into it. The diagram is a component map, not a coolant schematic.
- **Temperatures:** battery, coolant and outside temperature over the last
  10, 30 or 60 minutes. The chart leaves gaps where readings are missing.
- **Cells:** reported cell voltages with the lowest and highest highlighted,
  voltage spread and temperature spread. Supports up to 512 reported cells,
  paged in groups of 96; no fixed G08 cell count is assumed. A min/max-only
  response supplies the summary without inventing individual readings.

Use Next/Previous page or the tabs. The detail button changes the temperature
window or advances the cell page. Celsius is the default; Fahrenheit is available
in Settings. Temperature history holds up to 720 samples in memory and clears
when the app restarts or demo mode changes.

## Data status

**G08 diagnostic readings still require vehicle validation.** Battery field
layouts are inherited from iXDrive/eDrive. A plausible reading is not proof of
correct decoding. Live data is labelled “Candidate data”. Motor temperature has
no verified mapping and remains unavailable, including in demo mode. There are
no guessed nominal capacities, manual vehicle settings or claimed cooling states.

The reader uses only UDS ReadDataByIdentifier (0x22), plus speed and outside
temperature subscriptions. A polling cycle starts at most every five seconds,
with one diagnostic request at a time and no overlapping cycles. A group that
fails three cycles pauses for a minute. Reads stop after three minutes without
observed movement and ten minutes without interaction. Opening the app resumes
reads. This app does not change diagnostic sessions or write vehicle settings.

Voltage/current expire after 15 seconds; other readings expire after 30 seconds.
Power requires voltage/current timestamps within five seconds. Failed requests
clear the corresponding readings. No lines bridge history gaps over 15 seconds,
and cached readings do not create new history points. Demo is explicit, isolated
and never persisted. The app adds its own polling when run alongside iXDrive.

## Development

```sh
npm run build:preview -- ixobservatory
npm run preview -- dist/ixobservatory /tmp/ixobservatory-preview BTN_NEXT BTN_NEXT
npm run emulator -- ixobservatory
node kit/tools/test_ixobservatory.js
```

The icon source is `kit/tools/make_ixobservatory_icon.js`. Preview fixtures use
96 illustrative cells; they do not describe the G08's physical pack layout.

Toolkit and inherited diagnostic mappings originate from
[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps/).
No SDK build, vehicle installation or actual G08 validation has been performed.
