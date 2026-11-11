# iX Service

Read-only BMW service and Check Control for iDrive 7, focused on the G08 iX3.

- **Service** shows the vehicle’s Condition Based Service list and next-service
  summary. Dates and distances use the BMW display text and units. “Due now” and
  “Due soon” reflect BMW’s reported service colours.
- **Check Control** shows active messages and their BMW IDs. Titles come from
  the cluster when supplied. An empty, fresh list is shown separately from
  unavailable data.
- **History** saves the latest 150 observed changes. “Seen active” is the first
  sighting without a fresh baseline. “Appeared” and “No longer active” require
  two fresh, valid lists. The timeline uses observation times on the head unit.

Open the app to start monitoring. A running app can also receive passive
notifications while hidden. The app reads at most four fields per refresh, one at
a time, only on the visible screen and within ten minutes of interaction.
Periodic refresh is every 30 seconds. Live readings expire after two minutes or
on detected provider loss. The timeline does not infer a resolution across a
stale, malformed or interrupted feed.

History is stored in the app’s own `service.json`. Demo is off by default and
uses isolated fixtures. There are no service resets, diagnostic scans, internet
connections or dependencies on other apps.

The service list, next-service summary and message titles use
`KombiInterface_2`. Active state comes from `CheckControlMaster.basicList`.
Getter/notifier permissions and data shapes were checked against the captured G08
head-unit catalogue. Live delivery, active-list behaviour and BMW text still
require on-car validation.

## Preview

```sh
npm run build:preview -- ixservice
npm run preview -- dist/ixservice /tmp/ixservice-preview BTN_PAGE BTN_PAGE
```

Use **Next page** or the tabs. **Previous** and **Next** page through long lists.
The Store edition is `suhailpatel_ixservice`, with its own settings and history.
