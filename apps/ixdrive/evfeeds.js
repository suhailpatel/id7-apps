'use strict';
/**
 * evfeeds.js - the car's own EV data feeds (SOME/IP), kept raw for validation on the G08.
 *
 * BMW's stock apps on the iX3 (preheating, trigger_service, oap-cdc) read charge level, range and
 * battery energy from these fields rather than diagnostics. "Hybrid" in a name is BMW's shared
 * PHEV/BEV naming, not a hybrid-only signal. Only the charge level is decoded (BMW's own scale);
 * the rest stay raw until compared with the car's displays - e.g. the max-energy field is 12 bit
 * (default 4095), so its kWh scale is unknown. Values expire after STALE_MS; demo clears them.
 */
const STALE_MS = 60000;
const SOC_KEY = 'displayChargingConditionHighVoltageStorage';

/** first number under `key`, however the struct arrives (plain or wrapped in the field's name) */
function numberAt(v, key) {
    if (!v || typeof v !== 'object') return undefined;
    if (key in v) return v[key];
    for (const k of Object.keys(v)) { const n = numberAt(v[k], key); if (n !== undefined) return n; }
    return undefined;
}

/**
 * Displayed charge level (%) from Efficiencytainment2.statusChargeOfBatteryHybrid. Scale 0.5 % per bit, as
 * BMW's own oap-cdc decodes it (hv_soc = 0.5 x raw); 255 is the catalogue's no-value default. null when invalid.
 */
function decodeSoc(v) {
    const raw = numberAt(v, SOC_KEY);
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 200 ? raw * 0.5 : null;
}
const LOG_DISTINCT = 12;          // distinct raw values logged per field (bounded log)

const FEEDS = [
    { iface: 'de.bmw.infotainment.drivingexcitement.Efficiencytainment2', field: 'statusChargeOfBatteryHybrid', label: 'Charge level', compare: 'car SOC %', decode: (v) => { const p = decodeSoc(v); return p === null ? null : p.toFixed(1) + ' %'; } },
    { iface: 'de.bmw.infotainment.KombiIF', field: 'displayRangeElectricVehicle', label: 'Range', compare: 'cluster range' },
    { iface: 'de.bmw.infotainment.vehicle.Vehicle2', field: 'statusMaxCapacityHVBattery', label: 'Max energy', compare: 'usable kWh' },
    { iface: 'de.bmw.infotainment.vehicle.Vehicle2', field: 'highVoltageStorageInfoToExternal', label: 'Energy now / max', compare: 'kWh x SOC' },
    { iface: 'de.bmw.infotainment.vehicle.Vehicle', field: 'statusTripInformationElectricHybrid', label: 'Net energy', compare: 'kWh left' },
    { iface: 'de.bmw.infotainment.lsc.LSCDataSink', field: 'dataHighVoltageStorage', label: 'HV storage data', compare: 'kWh / charge time' },
    { iface: 'de.bmw.infotainment.lsc.LSCDataSink', field: 'displayDataHighVoltageStorage', label: 'HV display data', compare: 'kWh' },
    { iface: 'de.bmw.infotainment.lsc.LSCDataSink', field: 'statusHighVoltageStorage', label: 'Pack voltage', compare: '~300-460 V' },
    { iface: 'de.bmw.infotainment.KombiIF', field: 'statusBordcomputerElectricData', label: 'Trip consumption', compare: 'trip computer' },
    { iface: 'de.bmw.infotainment.drivingexcitement.Efficiencytainment2', field: 'statusPowerRelativHybrid', label: 'Drive / regen share', compare: 'power meter' },
    { iface: 'de.bmw.infotainment.drivingexcitement.Efficiencytainment2', field: 'displayPowerDrive', label: 'Regen quota', compare: 'power meter' },
];

class EvFeeds {
    constructor(log, clock) {
        this.log = log; this.clock = clock || Date.now;
        this.seen = {};
        this.clear();
    }

    clear() { this.raw = {}; }

    /** One notification or getter reply. */
    record(field, v) {
        const now = this.clock();
        let txt;
        try { txt = JSON.stringify(v); } catch (e) { txt = String(v); }
        if (txt === undefined) txt = String(v);
        const prev = this.raw[field];
        this.raw[field] = { txt, v, t: now, n: prev ? prev.n + 1 : 1 };
        const seen = this.seen[field] || (this.seen[field] = []);
        if (seen.length < LOG_DISTINCT && seen.indexOf(txt) < 0) {
            seen.push(txt);
            if (this.log) this.log.info('ev feed ' + field + ': ' + txt);
        }
    }

    /** Fresh raw value or null. */
    get(field) {
        const r = this.raw[field];
        return r && this.clock() - r.t <= STALE_MS ? r : null;
    }

    /** Rows for the Diagnostics page: { label, field, compare, txt, ageS, stale }. */
    rows() {
        const now = this.clock();
        return FEEDS.map((f) => {
            const r = this.raw[f.field];
            return { label: f.label, field: f.field, compare: f.compare,
                txt: r ? r.txt : null, decoded: r && f.decode ? f.decode(r.v) : null, ageS: r ? Math.round((now - r.t) / 1000) : null, stale: !r || now - r.t > STALE_MS };
        });
    }

    /** handlers for signals.watch() per interface: { iface: { field: fn } } */
    handlers() {
        const out = {};
        FEEDS.forEach((f) => { (out[f.iface] = out[f.iface] || {})[f.field] = (v) => this.record(f.field, v); });
        return out;
    }
}

module.exports = { EvFeeds, FEEDS, STALE_MS, LOG_DISTINCT, decodeSoc };
