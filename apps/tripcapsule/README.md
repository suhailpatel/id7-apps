# Trip Capsule

A separate iDrive 7 app for saved journey cards from iXDrive.

Each card shows distance, recorded duration, net battery energy, regeneration,
efficiency and average outside temperature. Browse with Newer/Older or the
controller, mark favourites, and cycle labels: Commute, Weekend, Road trip,
School run, Errands and Day out. Labels are presets; there is no free-text editor.

## How it gets trips

Run the updated iXDrive alongside Trip Capsule. iXDrive publishes up to 200
journeys and its current trip to `/tmp/mgu-ixdrive-trips.json` every five seconds.
Trip Capsule reads this local summary; it makes no vehicle requests of its own.
Both apps must run for new summaries to arrive. There is no cloud or GPS tracking.

Trip Capsule keeps its latest 200 cards and annotations in its own
`capsules.json`, so saved cards remain available when iXDrive closes or the car
restarts. Favourites are a filter, not an archive beyond the 200-card limit.
Completed records replace live snapshots without losing labels. If recording
stops before completion, the card stays marked as a last live snapshot. Missing
intervals remain partial; distance is observed distance, not an odometer reading.
The current shared summary is readable by other local apps; annotations stay in
Trip Capsule's private storage.

The shared format is versioned, demo-marked and expires after 15 seconds. Demo
cards are separate and never imported into saved history. No new battery, power
or model settings are needed. Vehicle data still depends on iXDrive's unvalidated
G08 telemetry.

## Preview

```sh
npm run build:preview -- tripcapsule
npm run preview -- dist/tripcapsule /tmp/tripcapsule-preview
npm run emulator -- tripcapsule
```

Demo defaults off in the car. Display units support km/miles and Celsius/Fahrenheit.
