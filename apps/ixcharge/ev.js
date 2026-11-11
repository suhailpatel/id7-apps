'use strict';

const number = (v) => typeof v === 'number' && isFinite(v);

// A physical SOC decoder may need a verified BMS window. Never infer it from model name.
function normalizeSoc(raw, window) {
    const low = window && window.empty != null ? window.empty : 0;
    const high = window && window.full != null ? window.full : 100;
    if (!number(raw) || !number(low) || !number(high) || high <= low || raw < low || raw > high) return null;
    return (raw - low) * 100 / (high - low);
}

// Battery-side estimate, not an AC/DC charger measurement or a charging command.
// Charging taper makes this a constant-power estimate, not a promised finish time.
function chargeEstimate(soc, target, kwhPerPct, kw, speed) {
    if (!number(soc) || soc < 0 || soc > 100 || !number(target) || target < 0 || target > 100
        || !number(kwhPerPct) || !(kwhPerPct > 0)) return null;
    const remaining = Math.max(0, target - soc) * kwhPerPct;
    const charging = number(kw) && kw < -0.3 && number(speed) && speed <= 1;
    return { remaining, reached: soc >= target, charging, power: charging ? -kw : null,
        minutes: charging && remaining > 0 ? remaining / -kw * 60 : null };
}

// Estimate CURRENT usable capacity from integrated battery energy / displayed SOC
// drop. Two independent >=5% windows must agree within 15%. Incomplete windows
// never cross process restarts, power gaps, charging, or invalid measurements.
class CapacityLearner {
    constructor(state) { this.state = state; this.anchor = null; this.candidate = null; }
    observe(soc, meter, now) {
        if (!number(soc) || soc < 0 || soc > 100 || !meter || !number(meter.kwh) || !meter.t || now - meter.t > 5000) {
            this.anchor = null; this.candidate = null; return;
        }
        const sample = { soc, kwh: meter.kwh, epoch: meter.epoch };
        const a = this.anchor;
        if (!a || a.epoch !== sample.epoch || soc > a.soc + 0.5) {
            if (a) this.candidate = null;
            this.anchor = sample; return;
        }
        const drop = a.soc - soc;
        if (drop < 5) return;
        const energy = meter.kwh - a.kwh, capacity = energy * 100 / drop;
        this.anchor = sample;
        if (energy < 1 || capacity < 15 || capacity > 200) { this.candidate = null; return; }
        const previous = this.candidate;
        this.candidate = { capacity, energy, drop };
        if (!previous || Math.abs(capacity - previous.capacity) / previous.capacity > 0.15) return;
        this.state.kwh = (energy + previous.energy) * 100 / (drop + previous.drop);
        this.state.t = now;
        this.state.windows = (this.state.windows || 0) + 2;
        this.candidate = null;
    }
    value(now) {
        return number(this.state.kwh) && this.state.kwh >= 15 && this.state.kwh <= 200
            && now >= this.state.t && now - this.state.t < 30 * 86400000 ? this.state.kwh : null;
    }
}

module.exports = { normalizeSoc, chargeEstimate, CapacityLearner };
