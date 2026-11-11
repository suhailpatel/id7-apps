'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Service } = require('../../apps/ixservice/model');
const { boot, env, run } = require('./app_test_harness');

const KOMBI = 'de.bmw.infotainment.KombiInterface_2';
const CONTROL = 'de.bmw.infotainment.checkcontrol.CheckControlMaster';
const T = Date.UTC(2026, 10, 11);
const tick = () => new Promise(resolve => setImmediate(resolve));
const active = id => ({ ccmId: id, activeState: 'AKTIV', reason: 'CCM_REQUESTED_BY_ECU' });
const names = [{ cCListElement: { cCIdentifer: 12, cCShortName: 'Washer fluid low', cCColor: 'YELLOW' } }];
const history = app => JSON.parse(fs.readFileSync(path.join(app.dir, 'service.json'), 'utf8'));

run([
    ['iX Service decodes BMW unions, names and colours without inventing units', () => {
        const model = new Service();
        model.receive('cbsDataServiceList', { value: { cbsDataServiceList: [{
            cBSDataServiceWithSymbolID: { cBSDataService: {
                cBSIdentifier: 3, cBSColor: 4, cBSServcieName: ' Brake  fluid\x00 ',
                cBSServiceWay: '2,500 mi', cBSServiceDate: '12/2026',
            } },
        }] } }, T);
        assert.deepStrictEqual(model.read('cbsDataServiceList', T).get(3), {
            id: 3, title: 'Brake fluid', distance: '2,500 mi', date: '12/2026', color: 4,
        });
        model.receive('cbsDataSBA', { cbsDataSBA: { cBSDataSBAText: 'Brake fluid', cBSDataSBAColor: 'GREEN' } }, T);
        assert.deepStrictEqual(model.read('cbsDataSBA', T), { title: 'Brake fluid', distance: '', date: '', color: 3 });
        model.receive('basicList', { basicList: [
            { ccmId: 12, activeState: 0, reason: 2 }, { ccmId: 12, activeState: 1, reason: 3 },
            { ccmId: 42, activeState: 0, reason: 0 },
        ] }, T);
        assert.deepStrictEqual(model.warnings(T), [{ id: 12, title: '', color: 0 }]);
        model.receive('ccList', { ccList: names }, T + 1);
        assert.deepStrictEqual(model.warnings(T + 1), [{ id: 12, title: 'Washer fluid low', color: 2 }]);
        assert.strictEqual(model.events[0].title, 'Washer fluid low');
    }],
    ['iX Service distinguishes unavailable and empty lists, and avoids false resolutions', () => {
        const model = new Service();
        assert.strictEqual(model.warnings(T), null);
        model.receive('basicList', [active(12)], T);
        model.receive('basicList', [active(12), { ccmId: 13, activeState: 255 }], T + 1);
        assert.strictEqual(model.warnings(T + 1), null);
        model.receive('basicList', [], T + 2);
        assert.deepStrictEqual(model.warnings(T + 2), []);
        assert.deepStrictEqual(model.events.map(e => e.kind), ['observed']);
        model.receive('basicList', [active(12)], T + 3);
        model.receive('basicList', [{ ccmId: 12, activeState: 'INAKTIV', reason: 3 }], T + 4);
        assert.deepStrictEqual(model.events.map(e => e.kind), ['inactive', 'appeared', 'observed']);
        model.receive('basicList', [active(12)], T + 5);
        assert.strictEqual(model.warnings(T + 120005), null);
        model.receive('basicList', [], T + 120005);
        assert.strictEqual(model.events[0].kind, 'appeared');
    }],
    ['iX Service retains a bounded timeline and avoids duplicates across restarts', () => {
        const model = new Service();
        for (let i = 0; i < 180; i++) model.receive('basicList', i % 2 ? [active(12)] : [], T + i);
        assert.strictEqual(model.events.length, 150);
        const restarted = new Service({ version: 1, events: model.events });
        restarted.receive('basicList', [active(12)], T + 500);
        assert.strictEqual(restarted.revision, 0);
        assert.deepStrictEqual(restarted.events, model.events);
    }],
    ['iX Service pages render, save real observations, and keep demo isolated', async () => {
        env.now = T;
        const app = await boot('ixservice');
        const { watchers } = app;
        assert((await app.draw()).includes('Service data unavailable'));
        watchers.cbsDataServiceList([{ cBSIdentifier: 17, cBSServcieName: 'Vehicle check', cBSColor: 3 }]);
        assert((await app.draw()).includes('Vehicle check'));
        watchers.ccList(names);
        watchers.basicList([active(12)]);
        await app.ctx.tab(1);
        assert((await app.draw()).includes('Washer fluid low'));
        await app.ctx.tab(2);
        assert((await app.draw()).includes('Seen active'));
        const saved = history(app);
        assert.strictEqual(saved.events.length, 1);
        app.set('demo', 'on');
        watchers.basicList([active(30)]);
        await app.ctx.tab(0);
        const preview = await app.draw();
        assert(preview.includes('DEMO') && preview.includes('Brake fluid'));
        app.exit();
        assert.deepStrictEqual(history(app), saved);
        app.set('demo', 'off');
        assert((await app.draw()).includes('Service data unavailable'));
        watchers.basicList([]);
        assert.deepStrictEqual(history(app), saved);
        const restarted = await boot('ixservice', {}, app.dir);
        await restarted.ctx.tab(2);
        assert((await restarted.draw()).includes('Washer fluid low'));
        restarted.subscriptions[CONTROL].sub.available = false;
        restarted.watchers.basicList([active(45)]);
        assert.deepStrictEqual(history(restarted), saved);
    }],
    ['iX Service getters run serially while in use and ignore superseded replies', async () => {
        env.now = T;
        const app = await boot('ixservice');
        const kombi = app.subscriptions[KOMBI];
        const control = app.subscriptions[CONTROL];
        assert.strictEqual(kombi.opts.shouldRead(), false);
        assert.strictEqual(control.opts.shouldRead(), false);
        const refresh = app.timers.find(timer => timer.ms === 30000).fn;
        let resolveRead;
        control.sub.proxy.getValue = field => {
            app.requests.push(field);
            return new Promise(resolve => { resolveRead = resolve; });
        };
        await refresh();
        assert.deepStrictEqual(app.requests, []);
        app.ctx.visible('MAIN', true);
        await tick();
        assert.deepStrictEqual(app.requests, ['cbsDataServiceList', 'cbsDataSBA', 'ccList', 'basicList']);
        await refresh();
        app.watchers.basicList([active(12)]);
        resolveRead([]);
        await tick();
        assert.deepStrictEqual(history(app).events.map(e => e.id), [12]);

        env.now += 30000;
        const pending = refresh();
        await tick();
        app.ctx.visible('MAIN', false);
        resolveRead([active(45)]);
        await pending;
        assert.deepStrictEqual(history(app).events.map(e => e.id), [12]);
        env.now = T + 60000;
        app.ctx.visible('MAIN', true);
        await tick();
        resolveRead([active(12)]);
        await tick();
        env.now += 600000;
        await refresh();
        assert.strictEqual(app.requests.length, 12);
        await app.ctx.tab(1);
        await tick();
        assert.strictEqual(app.requests.length, 16);
        app.set('demo', 'on');
        resolveRead([active(45)]);
        await tick();
        assert.deepStrictEqual(history(app).events.map(e => e.id), [12]);
    }],
]);
