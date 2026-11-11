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


## App versions before committing and pushing

- Whenever a change affects an app's shipped code, UI, assets, configuration,
  dependencies or packaging, bump its `version` in `apps/<id>/app.json` as part
  of the same change. Default to a patch bump (for example, `0.1.1` to `0.1.2`)
  unless the user requests a different version. Do not reuse a published version.
- Bump once per logical change being delivered, not once per edit or test run.
  Include the bump in the change's commit and verify it before pushing. If a
  change was already committed without a bump, add a follow-up commit before
  pushing; do not rewrite history just to add the version.
- Shared runtime or build changes require bumps for every app whose shipped
  package is affected. Bump a dependent app too when its shipped dependency
  metadata changes. In particular, the Store generator tracks iXDrive's current
  version in Trip Capsule's minimum requirement.
- Run `npm run store:prepare` after updating source versions. Commit the generated
  `store/apps/` manifests/icons and `mgu-repo.json` changes alongside the source.
  Do not edit generated versions by hand. Keep project context current where it
  records app versions.
- Before pushing, run `npm run store:check`, the relevant tests, and
  `npm run build:store`. Confirm package names, catalog versions and dependency
  requirements agree. Keep generated packages and the SDK out of Git.
- Documentation-only, test-only and agent-instruction changes do not require an
  app version bump unless they alter the shipped package or Store metadata.
  This rule does not itself authorize pushing or publishing.
