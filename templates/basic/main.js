'use strict';
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');

mgu.run({
    async start(ctx) {
        const render = () => {
            const t = ctx.theme(), cv = ctx.canvas(1600, 520).clear(t.bg);
            const demo = ctx.settings.get('demo') === 'on';
            G.frame(cv, t, ['Home'], 0, demo ? [{ text: 'DEMO' }] : []);
            G.panel(cv, t, 24, 44, 1552, 468, ctx.spec.title);
            cv.text('Your next iDrive 7 app', 800, 250, 56, t.text, { font: 'bold', align: 'center' });
            cv.text(demo ? 'Demo preview' : 'Ready to build', 800, 320, 28, t.dim, { align: 'center' });
            return ctx.ui.image('MAIN_GFX', cv);
        };
        ctx.loop('MAIN', 2, render);
        await render();
    },
});
