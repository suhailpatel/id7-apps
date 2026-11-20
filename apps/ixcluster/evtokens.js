'use strict';
/**
 * evtokens.js - what iX Cluster's themes show in place of the engine readouts of Cluster Themes.
 *
 * hud.js asks raw(hud, name) first in _raw() and token(hud, tok) first in _token(); undefined means "not an EV
 * name, the engine's own rule applies". Nothing here is made up: an unknown value is null / '--'.
 *
 * Raw names (the layouts' and shaders' signals):
 *   fuel     the charge level as 0..1 (the fuel gauges become charge gauges)
 *   soc      the charge level, %          batt / oil   the battery cells' average temperature, C
 *   pwr      power out of the battery as 0..1 of the display scale        regen   power into it, the same way
 *   kw       battery power, kW (+ out)    range        electric range, km   ambient  outside temperature, C (30 min)
 *   rpm, boost, coolant, intake, torque, torquePct, powerPct, hvSoc: none on an EV (null)
 * The display scale: 0..n x 10 x k kW, with k the smallest whole number that fits 100 kW and the most |kW| seen
 * since the app started (live and demo apart, never saved). A labelled drawing scale, not the car's rated power.
 *
 * Tokens: {{evgear}} (P R N D, B while the B position is on; also for {{gear}} {{gearnum}} {{stage}})
 *   {{kw}} (signed) {{kwAbs}} {{flow}} (POWER, REGEN with the car moving, else '') {{kwText}} (POWER 42 kW) {{soc}} {{batt}} (display unit)
 *   {{regenKw}} (kW into the battery, 0 otherwise) {{pwrPct}} (% of the display scale) {{kwPeak}} (most kW out since the
 *   last 0-60 run started)
 *   {{pwr:i/n}} (scale label i of n, kW) {{u:power}} (kW) {{fuelPct}} = {{soc}}; {{oil}} = {{batt}}
 * Plain Node 8 (the car's 8.16.2).
 */
const AMBIENT_MS = 30 * 60000;     // outside temperature is notified on change: kept this long, then unknown
const MIN_SCALE_KW = 100;
const MOVING_KMH = 1;

const isNum = (v) => typeof v === 'number' && isFinite(v);

/** The most |kW| seen since the start, live and demo kept apart (in memory only). */
function peak(h, d) {
    const k = d.demo ? 'pwrPeakDemo' : 'pwrPeak';
    if (isNum(d.kw)) h[k] = Math.max(h[k] || 0, Math.abs(d.kw));
    return h[k] || 0;
}

/** The display scale's top (kW) for a scale of n numbered steps. */
function scaleKw(h, n) {
    const step = Math.max(1, n || 8) * 10, top = Math.max(MIN_SCALE_KW, peak(h, h.car.data()));
    return Math.ceil(top / step) * step;
}

function frac(h, kw, n) {
    return isNum(kw) ? Math.max(0, Math.min(1, kw / scaleKw(h, n))) : null;
}

function raw(h, name) {
    const d = h.car.data();
    switch (name) {
        case 'fuel': return isNum(d.soc) ? d.soc / 100 : null;
        case 'soc': return isNum(d.soc) ? d.soc : null;
        case 'batt': case 'oil': return isNum(d.battT) ? d.battT : null;
        case 'kw': return isNum(d.kw) ? d.kw : null;
        case 'pwr': return isNum(d.kw) ? frac(h, Math.max(0, d.kw), 8) : null;
        case 'regen': return isNum(d.kw) ? frac(h, Math.max(0, -d.kw), 8) : null;
        case 'range': return isNum(d.rangeKm) ? d.rangeKm : null;
        case 'regenKw': return isNum(d.kw) ? Math.max(0, -d.kw) : null;
        case 'kwPeak': { const v = d.demo ? h.kwPeakDemo : h.kwPeakRun; return isNum(v) ? v : null; }
        case 'avgSpeed': return h._avgSpeed ? h._avgSpeed() : null;
        case 'ambient': return d.demo ? 12 : isNum(h.ambient) && Date.now() - (h.ambientAt || 0) < AMBIENT_MS ? h.ambient : null;
        case 'rpm': case 'boost': case 'coolant': case 'intake': case 'torque': case 'torquePct': case 'powerPct': case 'hvSoc':
            return null;
        default:
            if (name.indexOf('seg3:') === 0) {      // a 3-step level (the M theme's step bars): 1..3, 0 unknown or none
                const k = name.slice(5), kw = d.kw;
                const f = k === 'pwr' ? (isNum(kw) && kw > 0 ? frac(h, kw, 8) : null) : k === 'regen' ? (isNum(kw) && kw < 0 ? frac(h, -kw, 8) : null)
                    : k === 'soc' ? (isNum(d.soc) ? d.soc / 100 : null) : k === 'batt' ? (isNum(d.battT) ? (d.battT + 10) / 60 : null) : null;
                return isNum(f) && f > 0 ? Math.max(1, Math.min(3, Math.ceil(f * 3))) : 0;
            }
            return undefined;
    }
}

function gear(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N') return d.stage;
    if (d.stage === 'D') return d.program === 'B' ? 'B' : 'D';
    return '-';
}

function flow(d) {
    if (!isNum(d.kw)) return '';
    if (d.kw > 0.5) return 'POWER';
    // energy into the battery while standing could be a charger: not claimed as regen
    if (d.kw < -0.5 && isNum(d.speed) && d.speed > MOVING_KMH) return 'REGEN';
    return '';
}

function token(h, tok) {
    const us = h.setting('units') === 'us', d = h.car.data();
    const temp = (c) => (isNum(c) ? String(Math.round(us ? c * 9 / 5 + 32 : c)) : '--');
    switch (tok) {
        case 'evgear': case 'gear': case 'gearnum': case 'stage': return gear(d);
        case 'gearInD': return '';
        case 'kw': return isNum(d.kw) ? String(Math.round(d.kw)) : '--';
        case 'kwAbs': return isNum(d.kw) ? String(Math.round(Math.abs(d.kw))) : '--';
        case 'flow': return flow(d);
        case 'kwText': {           // "POWER 42 kW", "REGEN 18 kW", "0 kW", or "-- kW"
            const f = flow(d), n = isNum(d.kw) ? String(Math.round(Math.abs(d.kw))) : '--';
            return (f ? f + ' ' : '') + n + ' kW';
        }
        case 'soc': case 'fuelPct': return isNum(d.soc) ? String(Math.round(d.soc)) : '--';
        case 'batt': case 'oil': return temp(d.battT);
        case 'regenKw': return isNum(d.kw) ? String(Math.round(Math.max(0, -d.kw))) : '--';
        case 'pwrPct': return isNum(d.kw) ? String(Math.round(frac(h, Math.abs(d.kw), 8) * 100)) : '--';
        case 'kwPeak': { const v = d.demo ? h.kwPeakDemo : h.kwPeakRun; return isNum(v) ? String(Math.round(v)) : '--'; }
        case 'u:power': return 'kW';
        case 'u:powerUc': return 'KW';
        case 'mode': return undefined;
        default:
            if (tok.indexOf('pwr:') === 0) {
                const m = /^pwr:(\d+)\/(\d+)$/.exec(tok);
                if (!m) return '';
                const n = Number(m[2]);
                return String(Math.round(Number(m[1]) * scaleKw(h, n) / n));
            }
            return undefined;
    }
}

module.exports = { raw, token, scaleKw, frac, gear, flow, AMBIENT_MS, MIN_SCALE_KW };
