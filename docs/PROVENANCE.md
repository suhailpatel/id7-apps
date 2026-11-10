# Toolkit provenance

Imported on 10 November 2026 from the local repository
`/Users/Suhail/Development/idrive7-apps`, revision `8048eb091a20c5e2bfe36cda96e938472d2dfdc5`.
Only tracked toolkit, deployment, reference documentation and licence files were
copied. Other vehicle apps, local vehicle data, SDK files and build outputs were
not imported. Translation catalogs, supplemental localization bundles and
translation maintenance tools are omitted at the owner's request. The English
build adapter and original licence notices are retained. iXDrive is moved separately with its tests and project context.

The toolkit is derived from the MGU App Kit. Preserve the original attribution
in the root `LICENSE` (MIT) and translation notices. The renderer has separate
licences: `kit/renderd/LICENSE` (GPL-3.0-or-later) and
`kit/renderd/LICENSE.mgu-renderd` (MIT); retain its accompanying notices.
Bundled font notices stay beside their resources. These files keep their original
licensing; the new repository does not relicense them.

The source Git history remains in the original repository. The new repository
starts with focused import commits; it does not rewrite or import unrelated app
history. Upstream helper comments may mention other apps as examples; those apps
are not included. The active test runner contains only tests supported here.

Workspace-specific changes: English-only catalog selection; a starter generator,
test runner and CI workflow; preview output without translation instructions;
and a runtime-test startup error handler so a blocked Unix socket fails visibly
instead of silently skipping its checks. App code is moved without changes.
