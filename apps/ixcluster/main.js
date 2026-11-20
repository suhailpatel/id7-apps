'use strict';
/**
 * iX Cluster: full-screen instrument cluster themes for the BMW iX3 (G08, iDrive 7), drawn on the 1920x720 "panel"
 * target through cluster-render. Adapted from bimmer-lab's Cluster Themes (MIT): its engine (hud.js), five of its
 * themes, and its centre-screen page (page.js). The engine readouts are replaced by EV ones (evcar.js, evtokens.js):
 * battery power and regen, charge level, battery temperature, electric range and the P R N D / B selector.
 *
 * The centre screen is the app's own page: the themes with pictures, which drive mode shows which, and the settings.
 * The engine keeps running after the page is closed (OAP apps stay up in the background). Reads of the car stop
 * 3 minutes after it stops moving and 10 minutes after the page was last used.
 */
const mgu = require('./kit/mgu');
const HudApp = require('./hud');
const Page = require('./page');

mgu.run({
    start(ctx) {
        let hud;
        try {
            hud = new HudApp(ctx);
        } catch (e) {
            // nothing drawn, but stay up: an exit here would count as a crash on the car
            ctx.log.error('Cluster failed to start: ' + (e && e.stack || e));
            return;
        }
        hud.start();
        new Page(ctx, hud, {
            title: ctx.spec.title, what: 'cluster',
            look: { name: 'Themes', style: 'hero', tags: { mview: 'power + speed', sport: 'Live Cockpit', minimal: 'just the speed', cruise: 'calm · trip', ribbon: 'calm · holidays',
                gt3: 'race dash', m: 'M8 style', vector: 'music panel', track: 'tyres + temps', drag: '0-60 timer', rally: 'power arc · G-meter',
                retro80s: '80s digital', dyno: 'readout tiles' } },
            tabs: ['look', 'readouts', 'map', 'badge', 'gmeter', 'settings'],
            settings: ['units', 'clock', 'timeZone', 'nightDim', 'cameraNotch', 'holiday', 'demo'],
            modeCheck: ['HMI'],
            onUse: () => hud.car.touch(),
        }).start();
        hud.car.touch();
        ctx.ui.onVisible((name, visible) => { if (name === 'MAIN' && visible) hud.car.touch(); });
        process.on('exit', () => { try { hud.stop(); } catch (e) { /* exiting anyway */ } });
    },
});
