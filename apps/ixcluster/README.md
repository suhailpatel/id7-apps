# iX Cluster

Full-screen instrument cluster themes for BMW iDrive 7 and the **G08 iX3**, drawn on
the whole 1920 × 720 cluster through cluster-render. Adapted from bimmer-lab's
Cluster Themes (MIT), with every engine readout replaced by an EV one.
App ID `ixcluster`, version **0.1.1**, logging ID `OAXL`.
Independent settings; no iXDrive dependency, saved telemetry or learning.

## Themes

| Theme | What it shows |
|---|---|
| **M view** | Speed scale on the left and battery power on the right. Charge and battery-temperature dials sit in the corners. POWER/REGEN in kW shows under the selector. |
| **Sport** | Live Cockpit brackets showing speed and power, with charge and battery-temperature bars. A road runs with the speed, and a bottom strip shows kW and battery temperature. |
| **Minimal** | A huge speed with the selector. A thin power line runs above it. Below it are a charge line with its %, the battery temperature and the kW. |
| **Cruise** | Speed and selector, then charge, battery temperature, power and average speed. |
| **Ribbon** | A ribbon of light that fills with power. It shows power, battery temperature and charge on the left, and mode, electric range and average speed on the right. It has holiday editions. |

Power is drawn on a **labelled display scale**, not the car's rated power. The scale
is at least 100 kW, in whole steps, and grows with the highest kW seen since the app
started. Live and demo data each keep their own scale, and nothing is saved. Power
into the battery is drawn in eDrive blue. REGEN appears only while the car is moving;
energy flowing in while standing still is not claimed as regen, so a charger is never
assumed. The selector shows P, R, N or D from the car, and B while the B position is
on in D. It is never inferred from speed. All themes also show the clock, electric
range and outside temperature along the bottom, leaving BMW's own gear letter
uncovered.

Every theme follows the drive mode buttons. The defaults are Comfort → M view,
Sport → Sport and Eco Pro → Cruise. Pick **Off** for BMW's own cluster. The Waze map
can open inside M view and Sport. Calibration-grid and map-calibration layouts are
kept for alignment photos.

## Data

| Value | Source |
|---|---|
| Speed, g | `Vehicle2.statusCarSpeed2`, `CDS2` acceleration |
| Selector | `VehicleInformation` (P R N D), `MDrive.dataDisplayGearbox` (B) |
| Charge level | `Efficiencytainment2.statusChargeOfBatteryHybrid`, 0.5 % per bit as BMW's own app decodes it; diagnostic `E5CE`/`DDBC` as fallback |
| Battery power | Pack voltage × current from iX Pulse's read-only UDS candidates (`E54D`/`E561` first), paired within 5 s |
| Battery temperature | Cells' average temperature candidate (`DDC0`) |
| Electric range | `KombiIF.displayRangeElectricVehicle` in the car's own distance unit |
| Outside temperature, drive mode | `EnvironmentalInformation`, `FES` HMI mode |

Every value expires on its own (speed 5 s, power 12 s, charge 60 s, outside
temperature 30 min). Unknown or stale values read `--` or stay unlit. Diagnostic
reads and getters run only while the car moves (and for 3 minutes after) or for 10
minutes after the page is used. Nothing is written to the car.

**Not validated on the G08.** The diagnostic battery layouts are candidates. Live
delivery of the feeds, the 0.5 % charge scale and how the themes sit on the iX3's
cluster all still need checking on the car.

**Demo data** is off by default and must be switched on. When on, it plays a
synthetic 60-second drive with a DEMO tag; it never reads the car, mixes with real
values or saves anything.

## Requirements

[cluster-render](https://github.com/robertnisipeanu/idrive-apps), as for iX Pulse.
Running iX Pulse's cluster projection at the same time is not supported; use one or
the other.

## Development

- Bench: `node kit/bench/server.js ixcluster`, then open http://localhost:8078. It
  needs no SDK and runs the real shaders in WebGL.
- Theme pictures: run the bench with `BENCH_SHOT=1`, then run
  `kit/tools/ixcluster_previews.py` (see its header).
- Fonts: `kit/tools/bake_ixcluster_fonts.py` re-bakes the atlases that gained `B`,
  `-` and `/`.
- Icon: `kit/tools/make_ixcluster_icon.js`.
- Tests: `node kit/tools/test_ixcluster.js`.

Third-party notices are in `NOTICE`.
