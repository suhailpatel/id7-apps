# TyreWatch

Four-wheel pressure, temperature and pressure targets for BMW iDrive 7.

- **Tyres:** a car diagram with a card for each wheel, showing pressure,
  temperature and the difference from the car's target.
- **Cool history:** up to 90 days of daily snapshots, browsable by wheel.
  A trend appears after at least three readings spanning seven days at similar
  temperatures. A sustained drop of 0.2 bar or more is highlighted.
- Display units: bar, psi or kPa; Celsius or Fahrenheit.

TyreWatch reads the car's pressure and temperature units before decoding values.
It never guesses units or fills in missing pressure targets. Readings expire after
30 seconds. TPMS getters run every ten seconds while there has been movement in
the last three minutes or interaction in the last ten minutes. Reopening the app
resumes reads. There are no diagnostic requests or vehicle writes.

A cool snapshot needs fresh stationary speed, at least three hours since the last
observed movement, and tyre temperature within 5 °C of fresh outside temperature.
This is a cold-start candidate, not proof of a cold tyre: movement while the app
was stopped cannot be observed. The first installation needs to observe a drive
before saving cool snapshots. Trends compare readings within 3 °C and are not
leak diagnoses. Tyre changes or inflation can change the history.

## Preview

```sh
npm run build:preview -- tyrewatch
npm run preview -- dist/tyrewatch /tmp/tyrewatch-preview
npm run emulator -- tyrewatch
```

Demo defaults off in the car. Preview fixtures are separate from real readings
and never enter `tyres.json`. There are no manual vehicle/model settings.

TPMS field names and decoding are based on
[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps/),
particularly `car_vitals`. **The G08 signals and wheel positions still need
validation against the car's own display.** No installable package or vehicle
installation has been made.
