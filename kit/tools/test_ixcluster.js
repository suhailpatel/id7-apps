'use strict';
// iX Cluster: the EV data source (evcar.js), the EV readouts (evtokens.js) and the five adapted layouts, without the
// SDK, cluster-render or a car:   node kit/tools/test_ixcluster.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..'), APP = path.join(ROOT, 'apps', 'ixcluster'), KIT = path.join(ROOT, 'kit', 'runtime');
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req.startsWith('./kit/') && parent && parent.filename.startsWith(APP)) return load.call(this, path.join(KIT, req.slice(6)), parent, isMain);
    return load.call(this, req, parent, isMain);
};
const { EvModel, EvCar, demoAt } = require(path.join(APP, 'evcar'));
const ev = require(path.join(APP, 'evtokens'));
const spec = require(path.join(APP, 'app.json'));
const checks = [], test = (name, fn) => checks.push([name, fn]);
const T = Date.UTC(2026, 10, 20, 12);
const near = (a, b, e) => assert(Math.abs(a - b) < (e || 1e-9), a + ' != ' + b);

/** a stand-in for hud.js where evtokens.js reads it */
function hud(d, settings) {
    const s = Object.assign({ units: 'metric' }, settings || {});
    return { car: { data: () => d }, setting: (k) => s[k] };
}

test('EV values decode with their units, sentinels and own expiry', () => {
    const m = new EvModel();
    m.speed(64 * 50, T); m.soc({ displayChargingConditionHighVoltageStorage: 129 }, T);
    m.range({ displayRangeElectricVehicle: 180 }, T); m.distanceUnit({ unitOfMeasurementMileage: 'MEILEN' }, T);
    m.accel('gLong', Math.round((0.2 * 9.80665 + 65) / 0.002), T);
    let d = m.snapshot(T);
    near(d.speed, 50); near(d.soc, 64.5); near(d.rangeKm, 180 * 1.609344, 1e-6); near(d.gLong, 0.2, 0.001);
    assert.strictEqual(d.kw, null, 'no battery reading, no power');
    m.soc({ displayChargingConditionHighVoltageStorage: 255 }, T + 1);
    assert.strictEqual(m.snapshot(T + 1).soc, null, '255 is no value');
    m.speed(65535, T + 2);
    assert.strictEqual(m.snapshot(T + 2).speed, null, 'invalid speed clears it');
    m.speed(64 * 30, T);
    assert.strictEqual(m.snapshot(T + 5001).speed, null, 'speed expires after 5 s');
    m.distanceUnit({ unitOfMeasurementMileage: 'KILOMETER' }, T + 10);
    assert.strictEqual(m.snapshot(T + 10).rangeKm, null, 'a unit change drops the range read in the old one');
});

test('battery power needs voltage and current read within 5 s; the diagnostic charge is only a fallback', () => {
    const m = new EvModel();
    m.put('hvV', { v: 400 }, T); m.put('hvI', { a: 50 }, T + 1000);
    near(m.snapshot(T + 1000).kw, 20);
    m.put('hvI', { a: -30 }, T + 6000);
    assert.strictEqual(m.snapshot(T + 6000).kw, null, 'voltage 6 s older than current');
    m.put('hvV', { v: 400 }, T + 6000);
    near(m.snapshot(T + 6000).kw, -12);
    assert.strictEqual(m.snapshot(T + 6000 + 12001).kw, null, 'power expires');
    m.put('soc_diag', { pct: 61.2 }, T);
    near(m.snapshot(T).soc, 61.2);
    m.soc(130, T);
    near(m.snapshot(T).soc, 65, 1e-9);
});

test('the selector reads P R N D from the car, B only with the B position in D, never from speed', () => {
    const m = new EvModel();
    m.gear({ statusActualStageDrive: 'D' }, 'stage', T); m.program({ displayProgramGearbox: 'B_PROGRAMM' }, T);
    assert.strictEqual(ev.gear(m.snapshot(T)), 'B');
    m.program({ displayProgramGearbox: 'D_PROGRAMM' }, T);
    assert.strictEqual(ev.gear(m.snapshot(T)), 'D');
    m.gear({ statusGearSelectionDrive: 3 }, 'selection', T);
    assert.strictEqual(ev.gear(m.snapshot(T)), 'P');
    m.gear({ statusGearSelectionDrive: 'UNKNOWN' }, 'selection', T);
    m.speed(64 * 40, T);
    assert.strictEqual(ev.gear(m.snapshot(T)), '-', 'an unknown report clears it; moving says nothing');
});

test('power scale, flow words and readouts never invent values', () => {
    const h = hud({ kw: 42.4, speed: 50, soc: 63.6, battT: 26, demo: false });
    assert.strictEqual(ev.scaleKw(h, 8), 160, 'at least 100 kW, in whole steps');
    assert.strictEqual(ev.token(h, 'pwr:2/8'), '40');
    assert.strictEqual(ev.token(h, 'kwText'), 'POWER 42 kW');
    assert.strictEqual(ev.token(h, 'soc'), '64');
    near(ev.raw(h, 'fuel'), 0.636);
    const fast = hud({ kw: 205, speed: 90, demo: false });
    assert.strictEqual(ev.scaleKw(fast, 8), 240, 'the scale grows with the most seen');
    fast.car.data = () => ({ kw: 20, speed: 90, demo: false });
    assert.strictEqual(ev.scaleKw(fast, 8), 240, 'and stays for the drive');
    fast.car.data = () => ({ kw: 20, speed: 90, demo: true });
    assert.strictEqual(ev.scaleKw(fast, 8), 160, 'demo keeps its own');
    const regen = hud({ kw: -18, speed: 40 }), standing = hud({ kw: -18, speed: 0 });
    assert.strictEqual(ev.token(regen, 'flow'), 'REGEN');
    assert.strictEqual(ev.token(standing, 'flow'), '', 'into the battery while standing is not called regen');
    const none = hud({});
    ['kw', 'kwAbs', 'soc', 'batt'].forEach((k) => assert.strictEqual(ev.token(none, k), '--', k));
    assert.strictEqual(ev.token(none, 'kwText'), '-- kW');
    ['fuel', 'kw', 'pwr', 'range', 'batt', 'rpm', 'boost', 'coolant', 'ambient'].forEach((k) => assert.strictEqual(ev.raw(none, k), null, k));
    assert.strictEqual(ev.token(hud({ battT: 25 }, { units: 'us' }), 'batt'), '77');
    assert.strictEqual(ev.raw(none, 'mode'), undefined, 'other names go to the engine');
});

test('demo is explicit, flagged and never reads the car', async () => {
    const watches = [], reads = [];
    const opts = { demo: 'off' };
    const ctx = { spec, log: { info() {}, warn() {} }, settings: { get: (k) => opts[k] },
        signals: { watch: async (iface, inst, h, log, o) => { watches.push({ iface, inst, o }); return { available: true }; },
            proxy: async () => ({}), on: async () => {}, onAvailable: async () => {}, call: async () => { reads.push(1); return {}; } } };
    const car = new EvCar(ctx, { 'de.bmw.infotainment.drivingexcitement.FES': { statusFESVehicleDynamicSwitchHMI() {} },
        'de.bmw.infotainment.hmi.hmimediastate.HmiMediaState': { playerMetadata() {} } });
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(car.data().demo, false);
    assert(watches.every((w) => w.o.shouldRead && w.o.shouldReceive), 'every watch is gated');
    assert(watches.some((w) => w.iface.endsWith('FES')), 'the engine\'s fields join the same watches');
    // the unit has no instance "1" of now playing (it has HMI_CID, HMI_FoMo_Left, HMI_FoMo_Right): the installer refused it
    assert.strictEqual(watches.find((w) => w.iface.endsWith('HmiMediaState')).inst, 'HMI_CID');
    assert.strictEqual(watches.find((w) => w.iface.endsWith('Vehicle2')).inst, '1');
    opts.demo = 'on'; car.demoOn = car._wantDemo();
    assert.strictEqual(car.data().demo, true);
    assert.strictEqual(car.active(), false, 'no reads in demo');
    assert(watches.every((w) => !w.o.shouldReceive()), 'no car values in demo');
    const d = demoAt(T);
    assert(d.demo && typeof d.kw === 'number' && typeof d.soc === 'number');
    car.stop();
});

test('all thirteen themes resolve every token and their fonts hold every character', () => {
    const fonts = {};
    const font = (n) => fonts[n] || (fonts[n] = JSON.parse(fs.readFileSync(path.join(APP, 'hud', 'fonts', n + '.json'), 'utf8')).glyphs);
    // tokens hud.js answers itself (not EV values): what they can show
    const ENGINE = { speed: '188', speed2: '117', 'u:speedLc': 'km/h mph', 'u:speed2Lc': 'mph km/h', 'u:speed': 'KM/H MPH', 'u:temp': '°F°C',
        'u:dist': 'KMMI', 'u:distLc': 'kmmi', range: '412', ambient: '+-12', ambientN: '-12', time: '12:59', ampm: 'AMPM', ampmLc: 'ampm',
        mode: 'COMFORT SPORT ECO PRO', avgSpeed: '88', badge: '', holiday: '', 'spd:0': '0', 'u:boost': 'PSIBAR', 'u:boostLc': 'psibar',
        runLabel: '0-60 MPH0-100 KM/H', runState: 'READYGODONE', run: '4.32', runBest: '-.--4.32', gSide: '0.42 L R', gFwd: '0.31 ACC BRK',
        gBest: '0.88', gMax: '1.2', gLat: '0.42', mediaTitle: '', mediaArtist: '', mediaElapsed: '1:23', mediaLeft: '-2:10' };
    // readout slots: every EV sensor's value, name and unit (sensors.js)
    const sensors = require(path.join(APP, 'sensors'));
    const slot = (kind) => sensors.LIST.map((sn) => kind === 'slot' ? '0123456789:.' : kind === 'slotSuffix' ? (sn.suffix || '')
        : kind === 'slotUnit' ? (sn.unit ? sn.unit(true) + sn.unit(false) : 'AMPM') : (sn.short && kind === 'slotHeadS' ? sn.short : sn.head)).join('');
    const values = { kw: -188, speed: 60, soc: 64, battT: -9, stage: 'D', program: 'B', demo: false };
    const h = hud(values);
    ['mview', 'sport', 'minimal', 'cruise', 'ribbon', 'gt3', 'm', 'vector', 'track', 'drag', 'rally', 'retro80s', 'dyno'].forEach((name) => {
        const o = JSON.parse(fs.readFileSync(path.join(APP, 'hud', 'layouts', name + '.json'), 'utf8'));
        o.widgets.filter((w) => w.type === 'text').forEach((w) => {
            const out = String(w.text).replace(/\{\{([a-zA-Z0-9:\/-]+)\}\}/g, (_, t) => {
                const e = ev.token(h, t);
                if (e !== undefined) return e === '--' ? '-' : e;
                if (t.indexOf('spd:') === 0) return '0123456789';
                if (/^slot/.test(t)) return slot(t.split(':')[0]);
                if (/^tyre[PT]:/.test(t)) return '0123456789.';
                if (t.indexOf('temp:') === 0) return '-0123456789';
                assert(Object.prototype.hasOwnProperty.call(ENGINE, t), name + '.' + w.id + ': unknown token {{' + t + '}}');
                return ENGINE[t];
            });
            if (!w.font) return;
            const g = font(w.font);
            out.split('').forEach((c) => assert(c === ' ' || g[c], name + '.' + w.id + ' (' + w.font + '): no glyph for "' + c + '" in "' + out + '"'));
        });
        assert(!o.widgets.some((w) => w.type === 'stripe'), name + ': no M stripe on the iX3');
        assert(!/\{\{(oil|coolant|boost|rpm|fuelPct|gearnum|boostPeak|torque|powerPct|lastShift|verdict|setup:[a-z]+)\}\}/.test(JSON.stringify(o.widgets)), name + ': engine tokens left');
        (o.slots || []).forEach((sl) => assert(sensors.get(sl.default), name + ' slot ' + sl.id + ': ' + sl.default + ' is an EV sensor'));
        assert(!/"signal": "(rpm|boost|oil|coolant|torquePct|powerPct|intake)"/.test(JSON.stringify(o, null, 1)), name + ': engine signals left');
    });
});

test('app spec: read-only EV signals, explicit demo off, no engine settings', () => {
    assert.strictEqual(spec.id, 'ixcluster');
    assert(!spec.signals['de.bmw.infotainment.vehicle.CDS'], 'no engine speed or temperatures');
    assert(!JSON.stringify(spec.signals).includes('"w'), 'no field writes');
    assert.deepStrictEqual(spec.signals['com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu']._methods, ['sendTasuRequest']);
    const s = Object.fromEntries(spec.settings.map((x) => [x.key, x]));
    assert.strictEqual(s.demo.default, 'off');
    assert.deepStrictEqual(s.demo.options.map((o) => o[0]), ['off', 'on'], 'no automatic demo');
    ['redline', 'tankLitres', 'warnOil', 'shiftCue'].forEach((k) => assert(!s[k], k));
    assert.strictEqual(spec.config.target, 'panel');
    assert.strictEqual(spec.signals['de.bmw.infotainment.hmi.hmimediastate.HmiMediaState']._instances, 'HMI_CID');
    assert.strictEqual(spec.config.groups.hvV[0].did, 'E54D', 'fully electric candidates first');
    const themes = s.hudLayout.options.map((o) => o[0]);
    ['mview', 'sport', 'minimal', 'cruise', 'ribbon', 'gt3', 'm', 'vector', 'track', 'drag', 'rally', 'retro80s', 'dyno'].forEach((t) => assert(themes.indexOf(t) >= 0, t));
});

(async () => {
    let failed = 0;
    for (const [name, fn] of checks) {
        try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n' + (e && e.stack || e)); }
    }
    Module._load = load;
    process.exit(failed ? 1 : 0);
})();
