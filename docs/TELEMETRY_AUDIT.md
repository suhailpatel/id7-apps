# Vehicle data audit against the local SDK

11 November 2026. Covers iXDrive 0.1.2, iXCharge 0.1.0, iX Observatory 0.1.1,
TyreWatch 0.1.1 and Trip Capsule 0.1.2, including the uncommitted charging split.

**The connection mechanism is consistent with the extracted SDK, but the battery
and tyre measurements are not yet verified for the G08 iX3.** The initial local
`oap-sdk` identifies itself as 24.10.2 and contains 126 extracted source modules.
It loads vehicle service schemas from separate files; those schemas and G08
battery diagnostic definitions are not included in this extraction. A subsequent
headunit capture supplies the catalogue (see the capture findings below). An absent
field name in these SDK modules does not mean the car lacks that field.

## What the SDK confirms

- The runtime uses the same native proxy initialization, `getValue(field, timeout)`
  and `subscribe({name, onReceive})` calling conventions as
  `oap-sdk/source/src/someip/someipBuilders.js`. An offline comparison exercised
  both implementations with the same fake service.
- SDK defaults use instance `1` for Vehicle, Vehicle2 and EnvironmentalInformation,
  matching the apps. This does not prove service availability on the actual car.
- `CurrentVehicleUnits.js` uses Vehicle's `statusNewCurrentUnitsStatusExt`, the
  same units field used by TyreWatch.
- TyreWatch agrees with `CurrentVehicleUnitsTypesConverters.js` for named pressure
  units `BAR`, `KPA`, `PSI`, temperature units `C`, `F`, and unavailable states
  `DEFAULT`, `SIGNAL_UNGUELTIG`. All 20 combinations matched in the offline audit.
  TyreWatch's numeric enum aliases and raw measurement scaling remain unverified.
- All five app manifests request read/subscribe telemetry, not field setters.
  Battery collectors use read-data requests. The SDK extraction does not validate
  the TASU request/response envelope or the configured ECU addresses and DIDs.

## Status by app

| App | Data used | Verdict |
| --- | --- | --- |
| iXDrive | SOC, pack voltage/current, cells, temperatures, current limits, 12 V, speed, climate and outside temperature | Transport conventions match. Diagnostic meanings/scales and most signal fields remain unverified. Freshness and parked-polling problems below have been fixed and regression-tested. |
| iXCharge | Independent SOC, voltage/current, battery temperature; speed to separate charging from regeneration | Same unverified battery candidates. Separate timestamp expiry, synchronized voltage/current and parked gating are present. Charging is inferred, with no verified plug or AC/DC signal. |
| iX Observatory | Same pack readings plus coolant and cell voltages; speed/outside temperature | Same candidate limitations. Motor temperature remains unavailable. No verified coolant routing or motor mapping. |
| TyreWatch | TPMS pressure, temperature, target values, units, speed and outside temperature | Named units match the SDK. Wheel suffixes, field availability, raw scale/offset and numeric enum aliases require the catalogue and car comparisons. |
| Trip Capsule | iXDrive's observed journey summaries | No direct car collection. Identity, freshness and demo checks are implemented. Distance, energy and average temperature inherit iXDrive's input quality; they are not odometer or charger-meter measurements. |

## Mappings still requiring evidence

All diagnostic values below are candidates, not SDK-confirmed G08 definitions.

| Candidate | Current interpretation | Apps |
| --- | --- | --- |
| SME `0x07`, `DDBC` | Two-byte unsigned SOC × 0.1%, assumed displayed SOC | iXDrive, iXCharge, Observatory |
| `DDB4`, `DD68`, `DD66`; fallback `DDEF` | Two-byte pack voltage × 0.01 V; fallback × 1 V | All three battery apps |
| `DD69` | Four-byte signed current × 0.01 A; sign inverted so discharge is positive | All three battery apps |
| `DDC0` | Signed minimum/maximum/average temperature at offsets 0/2/4, × 0.01 °C | All three battery apps |
| `DFA5`; fallback `DDBF` | Two-byte cell array × 0.001 V; fallback minimum/maximum | iXDrive, Observatory |
| `DD6C` | Coolant temperature × 0.01 °C | iXDrive, Observatory |
| `DD7D` | Charge/discharge current limits at offsets 0/2, × 0.1 A | iXDrive |
| `F442` at SME | 12 V supply × 0.001 V | iXDrive |
| IHKA `0x78`, `D8D2`, `D8D3` | Compressor/heater power, two bytes at offset 1, × 0.001 kW | iXDrive |
| Vehicle2 speed | `speedVehicleCentreOfGravity` × 0.015625 km/h; 65535 unavailable | Four direct collectors |
| Outside temperature | `temperatureExterior` × 0.5 − 40 °C; 255 unavailable | iXDrive, Observatory, TyreWatch |
| TPMS | `actualValuePressureTyre*H`, `actualValueTemperatureTyre*H`, `targetPressureTyre*H`; FL/FR/RL/RR | TyreWatch |

The diagnostic voltage/cell notes refer to the X5 45e, not this iX3. Plausibility
ranges cannot prove the field meaning. Capacity and SOH candidate lists are
correctly empty; usable capacity is learned from candidate power/SOC inputs.
Seat, steering-wheel and blower power are estimates, not independent measurements.

## Originally reproduced software issues (now fixed)

These are code findings, separate from whether the car's raw mappings are correct.
The initial audit made no shipped changes. The subsequent user-requested fixes
are described below; the reproduction notes here record the original behavior.

1. **iXDrive's periodic SOME/IP reads bypass parked limits.**
   `main.js` supplies `pollMs` for climate, heating, power distribution and battery
   temperature. `kit/runtime/signals.js` runs those timers whenever the provider is
   available, without the app's activity or demo gate. The diagnostic reader's
   parked check does not stop these getters. A fake transport confirmed another
   getter call each time the unguarded timer fired. The real effect on vehicle
   sleep has not been measured.
2. **iXDrive can record fresh power using old voltage.**
   `live.js` accepts up to 60-second-old pack/fallback voltage with new current.
   The audit supplied 400 V once, then failed voltage reads for 30 seconds while
   current remained −50 A. iXDrive still published a new 20 kW sample and integrated
   0.02222 kWh over the next four seconds. iXCharge and Observatory instead require
   voltage/current timestamps within five seconds. Tighten this before trusting
   energy, capacity learning and downstream Trip Capsule figures during dropouts.
3. **Some iXDrive auxiliary values never expire.**
   Ambient temperature, climate inputs and the broadcast battery-temperature
   fallback lack timestamps/expiry. After one simulated hour without updates,
   the live data still exposed ambient 10 °C and battery fallback 25 °C. The
   fallback reaches the Battery page/widget; the main dashboard separately rejects
   stale diagnostic temperatures. Slow diagnostic values can also remain visible,
   dimmed, for ten minutes. This conflicts with the requirement that stale live
   values become unavailable.

## Getting the missing catalogue

The repository's installer expects the head unit file:
`/etc/oap/someip/someip-interfaces.json`. Copy it from **your own head unit and
firmware**. This needs existing, authenticated SSH access; extracting the SDK
does not enable SSH. The deployment tools assume that access already exists.

From this repository on the Mac, replacing `HEAD_UNIT_IP` with the working address:

```sh
mkdir -p reference
ssh -T root@HEAD_UNIT_IP 'LC_ALL=C cat /etc/oap/someip/someip-interfaces.json' > reference/someip-interfaces.download.json
python3 -m json.tool reference/someip-interfaces.download.json > /dev/null && mv reference/someip-interfaces.download.json reference/someip-interfaces.json
python3 kit/tools/check_signals.py reference/someip-interfaces.json
```

Use your SSH host alias instead of `root@HEAD_UNIT_IP` if configured. Add
`-i /absolute/path/to/your/key` and `-p PORT` to `ssh` if your connection needs them.
Only continue to validation after SSH succeeds. This issues a file read, not an
installation or vehicle command. `reference/` and `oap-sdk/` are already excluded
from Git. `ssh ... cat` avoids relying on an SFTP server that some head-unit builds
lack. Do not run a deployment script merely to copy this file.

The catalogue will let us check interface/field names, getter/notifier support,
instances and data structures. Numeric engineering scales may still need other
BMW definitions. It will not, by itself, establish the meaning of SME DIDs.

For battery validation, use G08/ECU-software-specific diagnostic descriptions
where available and compare our raw read-only replies with reference measurements.
BMW's official ISTA diagnostic system is a suitable route to obtaining vehicle
reference readings; it is not a promised export of a complete DID dictionary.
An independent BMW specialist can help obtain readouts. BMW documents ISTA and
its connection requirements in its [technical information guide](https://bmwtechinfo.bmwgroup.com/tisUI/assets/site_information.pdf).
Record SOC, pack voltage, current/sign during charging and discharge, battery and
coolant temperatures, and the ECU software identity. Keep captures local and
separate from source control.

## Automated read-only collection

From the repository root, with existing authenticated SSH access:

```sh
python3 kit/tools/copy_headunit_reference.py root@HEAD_UNIT_IP -i /path/to/identity_key
```

An SSH host alias also works. The identity key is optional when your SSH agent or
configuration supplies it. `-p PORT` overrides the configured port. Host-key
verification stays enabled. No SFTP server is required.

Each run creates `reference/headunit-<UTC time>-<unique suffix>/` and preserves the
remote directory layout inside it. It collects:

- `/etc/oap/someip/`, including the required catalogue.
- MainApp's `someipInterfaces/`, `rhmiData/`, `rhmiDataStartWidget/`,
  `config/base.json` and `package.json` under `/usr/lib/oap-mainapp/`.
- Installed OAP apps' signal definitions, UI/widget resources and source
  `package.json`, `manifest.json`, `permissions.json`, `config/base.json`.
- `/etc/os-release`, `/etc/os-release-id-dlt` and `/run/etc/variant.env`.

Optional arguments:

```sh
# Save under the requested external workspace instead of reference/.
python3 kit/tools/copy_headunit_reference.py root@HEAD_UNIT_IP -i /path/to/identity_key --output /Users/Suhail/Development/Workspaces/2026-11-11-bmw-oap-sdk

# Print the discovery commands without connecting or creating files.
python3 kit/tools/copy_headunit_reference.py car --dry-run

# Include stock preinstalled packages; these can be large.
python3 kit/tools/copy_headunit_reference.py car --include-packages

# Add a known schema directory found in the copied configuration.
python3 kit/tools/copy_headunit_reference.py car --schema-dir /actual/schema/directory

# Copy an individual app log when investigating a runtime issue.
python3 kit/tools/copy_headunit_reference.py car --log /var/opt/public/oap/oap_12345/data/ixdrive.log
```

Known directories are checked, not assumed present. Directory symlinks are skipped;
use `--schema-dir` with their real target if needed. Regular file symlinks, such as
`os-release`, are read through. Custom schema-directory values are not automatically
followed from configuration. No account data directories, credentials, screenshots
or diagnostic readings are collected automatically. Optional logs and original
packages should remain private alongside the other reference files.
`--output` selects a local parent directory; dated subfolders still prevent
overwriting earlier captures. Outside this repository, its Git-ignore rules do
not apply.

The remote commands only list/read files and stream a tar archive to the Mac.
The filename list is streamed over SSH standard input using `tar -T -`, so large
collections do not exceed the head unit's shell command-length limit. Optional
missing paths are summarized on screen and recorded in the manifest separately
from transfer errors.
They do not upload files, create remote temporary archives, install apps or issue
vehicle diagnostics. Normal SSH access may itself generate system audit logs.
Local extraction accepts only the requested regular files, never archive links
or traversal paths. Interrupted/failed transfers discard the partial local copy
and preserve previous snapshots.

`capture-manifest.json` records source paths, sizes, SHA-256 hashes, collection
time, host and missing-file warnings, without the identity key. Exit status `0`
means collection succeeded with a JSON-valid catalogue; optional paths may still
be absent. Status `2` preserves a partial collection whose catalogue is missing
or invalid; status `1` indicates a failed collection. JSON validity does not
validate any vehicle signal or decoder. Run `check_signals.py` against the copied
`etc/oap/someip/someip-interfaces.json` for the mapping checks.

## Repeating the offline audit

```sh
node kit/tools/audit_sdk.js
# With a captured headunit folder, also validate its catalogue and unit enums:
node kit/tools/audit_sdk.js /absolute/path/to/headunit-capture
```

This requires the local SDK and uses fake files, transport and clocks. It checks
SDK agreement and reports the reproduced freshness/polling behaviour; it does
not connect to the vehicle, validate the hardware, or certify firmware support.
The existing focused tests for all five apps remain useful software checks,
not evidence of correct G08 signal decoding.


## Fix verification

The three iXDrive findings are corrected in 0.1.3. All getter entry points now use
activity/demo gates; queued requests and late replies recheck them. Notifications
remain available to detect movement. Voltage/current must be less than five
seconds apart, and failed pairs break energy integration and journey continuity.
Auxiliary readings expire after 60 seconds; diagnostic temperatures expire at
`max(30 seconds, 4 × slowPoll)`. Demo transitions invalidate pending telemetry.

The repeated offline audit now reports zero parked getters, unavailable power
with 30-second-old voltage, zero integrated energy from it, and unavailable
ambient/battery fallback temperatures after one hour. Regression tests cover
reconnects, overlapping reads, late replies, expiry boundaries and recovery.

## Supplied headunit capture

Capture: `headunit-20261111T121453Z-i85jrqjx`, supplied 11 November 2026, retained
outside Git. Inspected as reference data; no captured scripts were run on the car.

- The master catalogue contains **689 interfaces**. `check_signals.py` reports
  **0 problems** across all five app manifests, including diagnostic method and
  event declarations. Telemetry services have the requested instance `1`; diagnostics use
  `SystemFunctionsInternalTasuInst1`, which the catalogue maps to 128.
- The consumed wrapper names, wheel suffixes FLH/FRH/RLH/RRH, integer widths and
  default sentinels match. For example, speed is UInt16/default 65535; ambient
  and broadcast battery temperatures are UInt8/default 255. These defaults
  support our unavailable handling; they do not supply engineering units.
- Numeric unit enums match TyreWatch: pressure BAR=1, KPA=2, PSI=3; temperature
  C=1, F=2. DEFAULT=0 and invalid enums are unavailable. This resolves the prior
  uncertainty about numeric aliases and field spelling, not live scaling.
- The preinstalled `x_call@4.25.3.tgz` includes BMW's common vehicle-data converter:
  speed × 0.015625 and ambient × 0.5 − 40 agree with our apps. Its pressure converter
  applies × 0.1 and carries the vehicle's pressure-unit enum separately, consistent
  with TyreWatch's approach. Tyre temperature conversion and actual on-car samples
  still need confirmation. Do not copy its apparent rear-pressure copy/paste error:
  its actual-pressure converter repeats the front-left field for both rear wheels.
- Installed x_call lives at **oap_12207 on this unit**, not the example oap_12204.
  Installed metadata is x_call 4.84.32 / SDK ^27.40.4; the captured preinstalled
  archive is x_call 4.25.3 / SDK 24.10.2. The installed JavaScript source is absent,
  so the two versions must not be conflated. The original local SDK remains intact.
- No G08 SME diagnostic descriptions, ECU measurement logs, or live app logs were
  found. The catalogue establishes schema support, not ECU DID definitions or
  whether a provider supplies valid values on this car.

Useful remaining files/readouts, in priority order:

| Item | Purpose |
| --- | --- |
| `/var/opt/public/oap/oap_12207/source/javascript/app.js` (if present; otherwise a listing of that source folder) | Compare against the **installed** newer SDK and BMW conversion code. Keep its captured `source/package.json` alongside it. |
| `/var/opt/public/oap/oap_12228/data/ixdrive.log` (if present) | This capture identifies oap_12228 as iXDrive. A short session log can show provider availability, diagnostic failures and read timing. |
| iXDrive `data/scan_07.json`, `scan_07_live.json`, `probes.json`, if already present | Existing raw read-only observations can help identify battery and climate values; filenames derive from the app's scan/probe code. Do not start a broad scan just to obtain these files. |
| G08 SME ECU identity plus reference SOC, voltage, current and battery temperatures | Needed to validate the diagnostic candidates against actual measurements; not guaranteed to exist as files on the headunit. |

The catalogue, generated `someipInterfaces/`, app manifests/package metadata,
firmware identity and preinstalled app archives are already in this capture;
there is no need to collect them again. Keep raw captures local and out of Git.
