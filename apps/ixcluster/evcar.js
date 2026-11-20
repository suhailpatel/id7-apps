'use strict';
/**
 * evcar.js - iX Cluster's vehicle data, in place of the kit's engine-car model that Cluster Themes reads.
 *
 * Read-only. Every value keeps its own time and expires (see TTL); an unknown or stale value is null, never zero
 * or a remembered reading. Sources:
 *   speed            Vehicle2.statusCarSpeed2 (1/64 km/h)
 *   g                CDS2 longitudinal / lateral acceleration (0.002 m/s2, -65 offset), as the kit's car.js
 *   stage            VehicleInformation selector: P R N D, B from MDrive's gearbox display while in D (iX Pulse rules)
 *   soc              Efficiencytainment2.statusChargeOfBatteryHybrid, 0.5 % per bit as BMW's own oap-cdc decodes it;
 *                    else the battery unit's diagnostic charge candidate (E5CE / DDBC)
 *   kw               pack voltage x current from the battery unit's diagnostic candidates (iX Pulse's collector),
 *                    paired within 5 s; + = out of the battery. Not validated on the G08: labelled on the page
 *   battT            the cells' average temperature candidate (DDC0)
 *   rangeKm          KombiIF.displayRangeElectricVehicle in the car's own distance unit (UnitBN2020)
 * Demo ("demo" setting On only): a synthetic drive, flagged demo: true; it never mixes with or trains real data.
 * Diagnostic reads and getters run only while the car moves (3 min after) or the page was used (10 min after).
 *
 *   const car = new EvCar(ctx, extra)   extra = { iface: { field: fn } } more watches (the engine's: mode, ambient...)
 *   car.data() -> { speed, gLat, gLong, stage, gear, condition, kw, soc, battT, rangeKm, demo }
 *   car.onSample(fn, reset)   car.touch()   car.active()   car.setRedline() (no-op)   car.stop()
 * Plain Node 8 (the car's 8.16.2).
 */
const { Diag } = require('./kit/diag');
const { number } = require('./decode');
const { createCollector } = require('./telemetry');

const TTL = { speed: 5000, accel: 2000, stage: 5000, program: 5000, condition: 600000, soc: 60000, socDiag: 30000,
    hvV: 12000, hvI: 12000, cellT: 30000, range: 30000, unit: 60000 };
const PAIR_MS = 5000;              // voltage and current read this close together make a power reading
const DEMO_MS = 50;                // demo samples (g, speed) at 20 Hz

const STAGES = { P: 'P', R: 'R', N: 'N', D: 'D', 1: 'P', 2: 'R', 3: 'N', 4: 'D' };

class EvModel {
    constructor() { this.r = {}; }
    clear() { this.r = {}; }
    put(key, data, t, source) { this.r[key] = { data, t, source }; }
    record() { /* the collector's hook: nothing kept */ }
    get(key, now, ttl) {
        const x = this.r[key];
        return x && x.data !== null && x.data !== undefined && now >= x.t && now - x.t <= (ttl || TTL[key]) ? x.data : null;
    }
    source(key) { return this.r[key] ? this.r[key].source : null; }
    speed(raw, now) { this.put('speed', number(raw) && raw >= 0 && raw < 65535 && raw / 64 <= 300 ? raw / 64 : null, now, 'Vehicle2'); }
    accel(key, raw, now) {
        const g = number(raw) && raw !== 65535 ? (raw * 0.002 - 65) / 9.80665 : null;
        this.put(key, number(g) && Math.abs(g) <= 3 ? g : null, now, 'CDS2');
    }
    /** The selector position (iX Pulse's rules): never inferred from speed; a newer unknown report clears it. */
    gear(raw, which, now) {
        const r = raw || {}, stage = which === 'stage', v = stage ? r.statusActualStageDrive : r.statusGearSelectionDrive;
        let value = null;
        if (typeof v === 'string') {
            if (['P', 'R', 'N'].indexOf(v) >= 0 || (stage && v === 'D')) value = v;
            else if (!stage && /^_[1-9]$/.test(v)) value = 'D';
        } else if (Number.isInteger(v)) {
            if (stage) value = STAGES[v] || null;
            else value = ({ 1: 'N', 2: 'R', 3: 'P' })[v] || (v >= 5 && v <= 13 ? 'D' : null);
        }
        this.put('stage', value, now, 'VehicleInformation');
    }
    program(raw, now) {
        const v = raw && raw.displayProgramGearbox;
        this.put('program', v === 5 || v === 'B_PROGRAMM' ? 'B' : 'none', now, 'MDrive');
    }
    /** The car's displayed charge level: 0.5 % per bit, 255 = no value. */
    soc(raw, now) {
        const v = raw && typeof raw === 'object' ? raw.displayChargingConditionHighVoltageStorage : raw;
        this.put('soc', Number.isInteger(v) && v >= 0 && v <= 200 ? v * 0.5 : null, now, 'Efficiencytainment2');
    }
    distanceUnit(raw, now) {
        const v = raw && raw.unitOfMeasurementMileage, unit = v === 1 || v === 'KILOMETER' ? 'km' : v === 2 || v === 'MEILEN' ? 'mi' : null;
        const old = this.get('unit', now);
        if (!unit || (old && old !== unit)) delete this.r.range;
        this.put('unit', unit, now, 'UnitBN2020');
    }
    range(raw, now) {
        const v = raw && raw.displayRangeElectricVehicle;
        this.put('range', Number.isInteger(v) && v >= 0 && v < 4093 ? v : null, now, 'KombiIF');
    }
    condition(n, now) { this.put('condition', number(n) ? n : null, now, 'VehicleCondition'); }
    snapshot(now) {
        const v = this.get('hvV', now), a = this.get('hvI', now), t = this.get('cellT', now);
        const paired = v && a && number(v.v) && number(a.a) && Math.abs(this.r.hvV.t - this.r.hvI.t) <= PAIR_MS;
        const socDiag = this.get('soc_diag', now, TTL.socDiag), socFeed = this.get('soc', now);
        const stage = this.get('stage', now), program = this.get('program', now);
        const range = this.get('range', now), unit = this.get('unit', now);
        return {
            speed: this.get('speed', now), gLat: this.get('gLat', now, TTL.accel), gLong: this.get('gLong', now, TTL.accel),
            stage: stage || undefined, program: stage === 'D' && program === 'B' ? 'B' : null,
            condition: this.get('condition', now),
            kw: paired ? v.v * a.a / 1000 : null,
            soc: number(socFeed) ? socFeed : socDiag && number(socDiag.pct) ? socDiag.pct : null,
            battT: t && number(t.avg) ? t.avg : null,
            rangeKm: number(range) && unit ? range * (unit === 'mi' ? 1.609344 : 1) : null,
            demo: false,
        };
    }
}

/** A synthetic drive for the explicit demo: a 60 s loop of pulling away, cruising, regen and a stop. */
function demoAt(now) {
    const s = (now % 60000) / 1000;
    let speed, kw, gLong;
    if (s < 10) { speed = s * 9; kw = 150 - s * 6; gLong = 0.25; }
    else if (s < 34) { speed = 90 + 6 * Math.sin(s / 3); kw = 22 + 14 * Math.sin(s / 2); gLong = 0.02; }
    else if (s < 46) { speed = 90 - (s - 34) * 7.5; kw = -(10 + 32 * Math.sin((s - 34) / 12 * Math.PI)); gLong = -0.2; }
    else { speed = Math.max(0, 0); kw = 1.2; gLong = 0; }
    return { speed, gLat: 0.18 * Math.sin(s / 4), gLong, stage: 'D', program: s >= 34 && s < 46 ? 'B' : null,
        condition: 10, kw, soc: 64, battT: 27, rangeKm: 268, demo: true };
}

class EvCar {
    constructor(ctx, extra) {
        this.ctx = ctx; this.log = ctx.log;
        this.model = new EvModel();
        this.listeners = [];
        this.subs = [];
        this.epoch = 0;
        this.demoOn = this._wantDemo();
        this.diag = new Diag(ctx.signals, ctx.log);
        this.diag.quiet = true;
        const cfg = ctx.spec.config || {};
        this.collector = cfg.groups ? createCollector({ diag: this.diag, config: cfg, model: {
            put: (key, data, t, source) => this.model.put(key === 'soc' ? 'soc_diag' : key, data, t, source),
            clear: () => { ['hvV', 'hvI', 'soc_diag', 'cellT'].forEach((k) => { delete this.model.r[k]; }); },
            record() {},
        }, enabled: () => !this.demoOn }) : null;
        const m = this.model, now = () => Date.now();
        const sample = () => { if (!this.demoOn) this._emit(this.data(), now()); };
        const watches = {
            'de.bmw.infotainment.vehicle.Vehicle2': { statusCarSpeed2: (v) => {
                const raw = v && v.speedVehicleCentreOfGravity;
                m.speed(raw, now()); if (this.collector) this.collector.motion(raw); sample();
            } },
            'de.bmw.infotainment.vehicle.CDS2': {
                statusLongitudinalAccelerationMassCenter: (v) => { m.accel('gLong', v && v.longitudinalAccelerationCentreOfGravity, now()); sample(); },
                statusLateralAccelerationMassCenter: (v) => m.accel('gLat', v && v.lateralAccelerationCentreOfGravity, now()),
            },
            'de.bmw.infrastructure.VehicleInformation': {
                statusGearboxDrive: (v) => m.gear(v, 'stage', now()),
                DataPowerTrain2: (v) => m.gear(v, 'selection', now()),
            },
            'de.bmw.infotainment.misc.MDrive': { dataDisplayGearbox: (v) => m.program(v, now()) },
            'de.bmw.infotainment.drivingexcitement.Efficiencytainment2': { statusChargeOfBatteryHybrid: (v) => m.soc(v, now()) },
            'de.bmw.infotainment.KombiIF': { displayRangeElectricVehicle: (v) => m.range(v, now()) },
            'de.bmw.infrastructure.EnvironmentalInformation': { UnitBN2020: (v) => m.distanceUnit(v, now()) },
        };
        // the engine's own fields (drive mode, outside temperature, vehicle state ...) on the same proxies
        Object.keys(extra || {}).forEach((iface) => Object.keys(extra[iface]).forEach((f) => {
            if (f.charAt(0) === '$') return;
            const mine = watches[iface] && watches[iface][f];
            const theirs = extra[iface][f];
            (watches[iface] = watches[iface] || {})[f] = mine ? (v) => { mine(v); theirs(v); } : theirs;
        }));
        Object.keys(watches).forEach((iface) => {
            // the instance app.json declares (now playing is HMI_CID, the centre display), else "1"
            const sig = (ctx.spec.signals || {})[iface], instance = sig && typeof sig._instances === 'string' ? sig._instances : '1';
            Promise.resolve(ctx.signals.watch(iface, instance, watches[iface], this.log, {
                pollMs: iface.indexOf('Vehicle2') > 0 ? 2000 : iface.indexOf('KombiIF') > 0 ? 5000 : 15000,
                shouldRead: () => this.active(),
                shouldReceive: () => !this.demoOn,
                generation: () => this.epoch,
            })).then((s) => { this.subs.push(s); this.log.info('signal ' + iface.split('.').pop() + (s && s.error ? ' error: ' + s.error : ' subscribed')); })
                .catch((e) => this.log.warn('signal ' + iface + ': ' + (e && e.message || e)));
        });
        this.diag.on('available', (a) => { if (a && this.collector) this.collector.poll(); });
        try { this.diag.init(); } catch (e) { this.log.warn('diagnostic link: ' + (e && e.message || e)); }
        this.pollTimer = setInterval(() => { if (this.collector) this.collector.poll().catch(() => {}); }, 1000);
        this.demoTimer = setInterval(() => {
            const want = this._wantDemo();
            if (want !== this.demoOn) {
                this.demoOn = want; this.epoch++;
                if (this.collector) this.collector.reset();
                ['speed', 'gLat', 'gLong', 'stage', 'program', 'soc', 'range', 'unit'].forEach((k) => { delete this.model.r[k]; });
                this.log.info(want ? 'demo data on' : 'live car data');
                this.listeners.forEach((l) => { try { if (l.reset) l.reset(); } catch (e) { /* next */ } });
            }
            if (this.demoOn) this._emit(this.data(), Date.now());
        }, DEMO_MS);
        [this.pollTimer, this.demoTimer].forEach((t) => { if (t && t.unref) t.unref(); });
    }

    _wantDemo() { return this.ctx.settings.get('demo') === 'on'; }
    /** Reads are allowed: moving (and 3 min after) or the page used (10 min after); never in demo. */
    active() { return !this.demoOn && (!this.collector || this.collector.active()); }
    /** The page was opened or used: read now (fresh values while parked, for 10 min). */
    touch() {
        if (!this.collector) return;
        this.collector.touch();
        this.subs.forEach((s) => { if (s && s.refresh) s.refresh(); });
        this.collector.poll().catch(() => {});
    }
    data() { return this.demoOn ? demoAt(Date.now()) : this.model.snapshot(Date.now()); }
    /** fn(data, t) on each new speed / acceleration sample (20 Hz in demo); fn.reset when live and demo switch. */
    onSample(fn, reset) { this.listeners.push({ fn, reset }); }
    _emit(d, t) { this.listeners.forEach((l) => { try { l.fn(d, t); } catch (e) { this.log.warn('sample: ' + e); } }); }
    setRedline() { /* no engine */ }
    stop() { clearInterval(this.pollTimer); clearInterval(this.demoTimer); }
}

module.exports = { EvCar, EvModel, demoAt, TTL };
