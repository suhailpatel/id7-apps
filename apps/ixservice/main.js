'use strict';

const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const { Service, demo } = require('./model');
const { draw, TABS, PAGE_SIZE } = require('./view');

const REFRESH_MS = 30000;
const INTERACTION_MS = 600000;
const MIN_REFRESH_MS = 5000;
const FIELDS = {
    'de.bmw.infotainment.KombiInterface_2': ['cbsDataServiceList', 'cbsDataSBA', 'ccList'],
    'de.bmw.infotainment.checkcontrol.CheckControlMaster': ['basicList'],
};

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const file = path.join(ctx.dataDir, 'service.json');
        let saved;
        try {
            if (fs.statSync(file).size <= 256000) saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (_) {}
        const real = new Service(saved);
        const isDemo = () => settings.get('demo') === 'on';
        let example = isDemo() ? demo(Date.now()) : null;
        let savedRevision = 0;
        let visible = !!(ui.isVisible && ui.isVisible('MAIN'));
        let interactionAt = visible ? Date.now() : null;
        let lastRead = null;
        let generation = 0;
        let reading = false;
        let tab = 0;
        let offset = 0;
        const sources = Object.entries(FIELDS).map(([iface, fields]) => ({
            iface, fields, available: false, sub: null, changes: {},
        }));

        function save() {
            if (isDemo() || real.revision === savedRevision) return;
            try {
                fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 1, events: real.events }));
                fs.renameSync(file + '.tmp', file);
                savedRevision = real.revision;
            } catch (error) {
                log.warn('iX Service history: ' + error.message);
            }
        }

        function availability(source) {
            const available = !!(source.sub && source.sub.available);
            if (source.available && !available) real.invalidate(source.fields);
            source.available = available;
            return available;
        }

        function receive(source, field, value) {
            if (isDemo()) return;
            real.receive(field, value, Date.now());
            save();
        }

        const subscriptions = sources.map(source => {
            const handlers = {};
            for (const field of source.fields) {
                source.changes[field] = 0;
                handlers[field] = value => {
                    source.changes[field]++;
                    if (!source.sub || availability(source)) receive(source, field, value);
                };
            }
            // Schedule our own bounded getters so a late reply cannot overwrite a newer notification.
            return ctx.signals.watch(source.iface, '1', handlers, log, { shouldRead: () => false })
                .then(sub => { source.sub = sub; availability(source); });
        });

        function canRead() {
            const age = Date.now() - interactionAt;
            return visible && !isDemo() && interactionAt !== null && age >= 0 && age < INTERACTION_MS;
        }

        async function refresh() {
            sources.forEach(availability);
            if (reading || !canRead()) return;
            const now = Date.now();
            if (lastRead !== null && now >= lastRead && now - lastRead < MIN_REFRESH_MS) return;
            if (!sources.some(source => source.available && source.sub.proxy)) return;
            lastRead = now;
            reading = true;
            const started = generation;
            try {
                for (const source of sources) {
                    for (const field of source.fields) {
                        if (started !== generation || !canRead()) return;
                        if (!availability(source) || !source.sub.proxy) break;
                        const revision = source.changes[field];
                        let value;
                        try { value = await source.sub.proxy.getValue(field, 2000); }
                        catch (_) { continue; }
                        if (started === generation && canRead() && availability(source) && source.changes[field] === revision) {
                            receive(source, field, value);
                        }
                    }
                }
            } finally {
                reading = false;
                save();
                if (started !== generation) refresh();
            }
        }

        function render() {
            sources.forEach(availability);
            const now = Date.now();
            const view = draw(ctx, example || real, now, tab, offset, !!example);
            offset = view.offset;
            return ui.image('MAIN_GFX', view.canvas);
        }

        function interact() {
            interactionAt = Date.now();
            refresh();
        }

        function select(index) {
            if (!TABS[index]) return;
            tab = index;
            offset = 0;
            interact();
            return render();
        }

        function browse(step) {
            offset = Math.max(0, offset + step * PAGE_SIZE);
            interact();
            return render();
        }

        function refreshButton() {
            interact();
            return render();
        }

        ctx.onTab(select);
        ctx.onScroll(dy => {
            if (!dy) return false;
            const previous = offset;
            browse(Math.sign(dy));
            return offset !== previous;
        });
        ui.onClick('BTN_PAGE', () => select((tab + 1) % TABS.length));
        ui.onClick('BTN_PREV', () => browse(-1));
        ui.onClick('BTN_NEXT', () => browse(1));
        ui.onClick('BTN_REFRESH', refreshButton);
        ui.onVisible((name, shown) => {
            if (name !== 'MAIN' || shown === visible) return;
            visible = shown;
            generation++;
            if (shown) interact();
        });
        settings.onChange(key => {
            if (key === 'demo') {
                generation++;
                sources.forEach(source => real.invalidate(source.fields));
                example = isDemo() ? demo(Date.now()) : null;
                lastRead = null;
                offset = 0;
                interact();
            }
            render();
        });

        const timer = setInterval(refresh, REFRESH_MS);
        if (timer.unref) timer.unref();
        process.on('exit', save);
        ctx.loop('MAIN', 2, render);
        await render();
        Promise.all(subscriptions).then(refresh).catch(error => log.warn('iX Service signals: ' + error.message));
    },
});
