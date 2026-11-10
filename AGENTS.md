# Working in id7-apps

Read README.md and docs/CONTEXT.md before changing iXDrive. See docs/DEVELOPMENT.md
for the app template, build workflow and shared runtime. This repository is the
new home for iXDrive; do not edit the previous idrive7-apps copy as its source.

- English-only: do not add translation work or translation checks unless requested.
- Target BMW iDrive 7. The current car is the G08 iX3; newer iDrive platforms are
  outside the agreed scope.
- Keep vehicle telemetry read-only unless a task explicitly requests otherwise.
  Unknown/stale values remain unavailable. Demo must be explicitly enabled and
  must never train or persist real history.
- Don't add manual battery-size, rated-power or model settings. Prefer verified
  vehicle values and clearly labelled learned estimates. Diagnostic candidates
  inherited from eDrive have not been validated on this iX3.
- Preserve app IDs, independent storage, parked polling limits and data provenance.
- Follow the existing canvas/gauge style. The user prefers polished layouts,
  concise labels and short progress/final messages over lengthy explanations.
- Use npm run new:app for future apps. Run meaningful affected tests and preview
  changed screens. npm test covers the supported local test suites.
- Keep oap-sdk, dist, credentials and vehicle captures out of commits. Preserve
  original licences. Building does not imply permission to install on a car.
- Update docs/CONTEXT.md when scope, validated capabilities or blockers change.
