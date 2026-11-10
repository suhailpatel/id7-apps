'use strict';
// TPMS field names/scaling from cauliflowermossgrape/idrive7-apps (car_vitals).
// Require explicit car units; never guess Fahrenheit from pressure units.
const WHEELS = ['FL', 'FR', 'RL', 'RR'];
const NAMES = ['Front left', 'Front right', 'Rear left', 'Rear right'];
const DAY = 86400000, TTL = 30000;
const number = v => typeof v === 'number' && Number.isFinite(v);
const unit = (v, map) => map[v] || (Object.values(map).includes(v) ? v : null);
const pressure = (v, u) => {
    if (!number(v) || v < 0 || v >= 65532 || !['BAR','KPA','PSI'].includes(u)) return null;
    const p = v * 0.1 * ({BAR:1, KPA:.01, PSI:1/14.5037738}[u]);
    return p >= .5 && p <= 6 ? p : null;
};
const temperature = (v, u) => {
    if (!number(v) || v < 0 || v >= 65535 || !['C','F'].includes(u)) return null;
    const t = u === 'F' ? (v - 40 - 32) * 5 / 9 : v - 40;
    return t >= -40 && t <= 150 ? t : null;
};
class Tyres {
    constructor(state = {}) {
        this.state = state;
        state.history = Array.isArray(state.history) ? state.history.filter(p => p && WHEELS.includes(p.wheel) && number(p.t) && number(p.p) && number(p.temp)).slice(-360) : [];
        this.reset();
    }
    reset() { this.units = {}; this.values = {}; this.speed = null; this.speedT = 0; this.ambient = null; this.ambientT = 0; }
    setUnits(v = {}) {
        const next = {p:unit(v.unitOfMeasurementAirPressure,{1:'BAR',2:'KPA',3:'PSI'}), t:unit(v.unitOfMeasurementTemperature,{1:'C',2:'F'})};
        if (next.p !== this.units.p || next.t !== this.units.t) this.values = {};
        this.units = next;
    }
    receive(kind, v, now) {
        const prefix = {p:'actualValuePressureTyre', temp:'actualValueTemperatureTyre', target:'targetPressureTyre'}[kind];
        WHEELS.forEach(w => {
            const raw = v && v[prefix + w + 'H'];
            const value = kind === 'temp' ? temperature(raw,this.units.t) : pressure(raw,this.units.p);
            (this.values[w] || (this.values[w] = {}))[kind] = {value, t:now};
        });
    }
    motion(speed, now) {
        this.speed = number(speed) && speed >= 0 && speed < 300 ? speed : null; this.speedT = now;
        if (this.speed > 1) this.state.lastMove = now;
    }
    outside(raw, now) { this.ambient = number(raw) && raw >= 0 && raw < 255 ? raw * .5 - 40 : null; this.ambientT = now; }
    wheel(w, now) {
        const out = {};
        for (const k of ['p','temp','target']) {
            const s = (this.values[w] || {})[k];
            out[k] = s && now >= s.t && now - s.t <= TTL ? s.value : null;
        }
        out.delta = number(out.p) && number(out.target) ? out.p - out.target : null;
        return out;
    }
    capture(now) {
        // A cool-start candidate, not proof the car remained stationary while this app was off.
        if (!number(this.state.lastMove) || now - this.state.lastMove < 3*3600000 ||
            !number(this.speed) || this.speed > 1 || now-this.speedT > 5000 ||
            !number(this.ambient) || now-this.ambientT > TTL) return false;
        let changed = false;
        WHEELS.forEach(w => {
            const v = this.wheel(w,now), rows = this.state.history.filter(p=>p.wheel===w), last = rows[rows.length-1];
            if (!number(v.p) || !number(v.temp) || Math.abs(v.temp-this.ambient)>5 ||
                (last && Math.floor(last.t/DAY) >= Math.floor(now/DAY))) return;
            this.state.history.push({wheel:w,t:now,p:v.p,temp:v.temp,target:v.target}); changed = true;
        });
        this.state.history.sort((a,b)=>a.t-b.t);
        this.state.history = this.state.history.filter(p=>now-p.t<=90*DAY).slice(-360);
        return changed;
    }
    trend(w) {
        const all = this.state.history.filter(p=>p.wheel===w), last = all[all.length-1];
        if (!last) return null;
        const rows = all.filter(p=>Math.abs(p.temp-last.temp)<=3 && last.t-p.t<=30*DAY);
        if (rows.length<3 || last.t-rows[0].t<7*DAY) return null;
        const delta = last.p-rows[0].p;
        const falling = delta <= -.2 && rows.slice(1).every((p,i)=>p.p<=rows[i].p+.05);
        return {delta,falling,days:Math.round((last.t-rows[0].t)/DAY),count:rows.length};
    }
}
function demo(now) {
    const m = new Tyres(); m.setUnits({unitOfMeasurementAirPressure:1,unitOfMeasurementTemperature:1});
    WHEELS.forEach((w,i)=>{
        m.values[w] = {p:{value:[2.5,2.2,2.7,2.7][i],t:now},target:{value:i<2?2.5:2.7,t:now},temp:{value:[23,22,24,24][i],t:now}};
        for(let d=0;d<10;d++) m.state.history.push({wheel:w,t:now-(9-d)*DAY,p:(i<2?2.5:2.7)-(i===1?d*.03:0),temp:12+d%3,target:i<2?2.5:2.7});
    });
    return m;
}
module.exports = {Tyres, WHEELS, NAMES, pressure, temperature, demo};
