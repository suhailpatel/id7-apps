# iXCharge

Independent, read-only charging dashboard for **BMW iDrive 7**, focused on the
**G08 iX3**. App ID `ixcharge`, version **0.1.1**, logging ID `OAXC`.
It runs without iXDrive. Diagnostic candidates are inherited from iXDrive/eDrive
and have **not been validated on the G08**. Newer iDrive platforms are out of scope.

## Pages

- **Charging:** battery-side power, SOC, local estimate target, energy needed and
  time at current power. The target does not control the car. Estimates exclude
  taper and charger losses; plug state and AC/DC type are not detected.
- **Charge log:** SOC-rise sessions, including increases across head-unit sleep,
  saved totals, known energy per day and estimated costs. Browse with Newer/Older,
  controller scroll or the standard HMI's Older charges action. Energy remains
  unavailable when capacity was unknown. Cost uses the chosen tariff and an
  explicitly assumed 10% energy overhead; it is not a charger-meter reading.
- **Charge lab:** observed power versus SOC, comparison with the preceding
  compatible session, observed energy, peak power, duration and pack temperature.
  Gaps and restarts split curves; sleeping intervals are never reconstructed.

Fresh stationary speed and negative battery power are required to identify
charging. Regeneration while driving is excluded. Independent SOC and power
collection supports usable-capacity learning while this app runs during driving:
two matching windows of at least five SOC percentage points, with estimates
expiring after 30 days. Learned values are labelled; there is no nominal battery
size or manual model setting. The verified capacity candidate list remains empty.

## Storage and existing history

Own settings and `charging.json` storage retain at most 200 SOC log entries,
20 power recordings and 240 points per recording. State is saved atomically.
Demo defaults off, uses separate synthetic fixtures and never records them.

To bring over history from iXDrive 0.1.1 or earlier, run the updated iXDrive and
iXCharge once together with demo off. iXDrive exposes a migration-only copy of its
old charge records at `/tmp/mgu-ixdrive-legacy-charges.json`. iXCharge imports a
fresh, matching packet once and labels its source; iXDrive's originals remain in
its storage. Interrupted recordings are partial. No private app directory is read.
New charge records belong only to iXCharge; neither new readings nor continued
recording require iXDrive. Capacity learning starts independently.

Store editions use `suhailpatel_ixcharge` and import only the canonical
`suhailpatel_ixdrive` migration packet. Store and local data remain separate.
iXCharge has no Store dependency on iXDrive.

## Polling and development

Read-data requests only, one diagnostic request at a time, at most one cycle per
five seconds, with backoff after repeated failures. Polling pauses after both
three minutes without movement and ten minutes without interaction; it does not
keep a parked vehicle awake to finish a charging curve. Running both apps adds
independent polling. Stale or unsupported values stay unavailable. In-flight
replies are discarded after a demo switch.

```sh
node kit/tools/test_ixcharge.js
npm run build:preview -- ixcharge
npm run preview -- dist/ixcharge /tmp/ixcharge-preview BTN_PAGE BTN_PAGE
```

The charge views/recorder and capacity learner were moved or adapted from
iXDrive; the bounded collector and decoder were adapted from iX Observatory.
Original toolkit licensing is retained. Icon source is
`kit/tools/make_ixcharge_icon.js`. No vehicle installation has been performed.
