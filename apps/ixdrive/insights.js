'use strict';

// Observed intervals only: never fill gaps with the last speed or power.
const num = v => typeof v === 'number' && isFinite(v);
const GAP = 6000, PARK = 5 * 60000, DAY = 86400000;
const append = (list, value, max) => { list.push(value); if (list.length > max) list.splice(0, list.length - max); };
const mean = (sum, n) => n ? sum / n : null;

class Insights {
    constructor(state, basis) {
        this.st = state;
        for (const k of ['journeys', 'capacities', 'days']) if (!Array.isArray(state[k])) state[k] = [];
        this.prev = null;
        if (state.basis && state.basis !== basis) {
            this.closeJourney(true);
            state.era = (state.era || 0) + 1;
        }
        state.basis = basis;
        if (state.journey) state.journey.partial = true;
    }
    closeJourney(partial) {
        const j = this.st.journey;
        if (!j) return;
        j.partial = j.partial || !!partial;
        if (j.km >= 0.1) append(this.st.journeys, j, 200);
        this.st.journey = null;
    }
    tick(t) {
        if (this.st.journey && t - this.st.journey.moveT >= PARK) this.closeJourney(t - this.st.journey.end > GAP);
    }
    breakContinuity() {
        this.prev = null;
        if (this.st.journey) this.st.journey.partial = true;
    }
    observe(s) {
        if (!s || !num(s.t)) return;
        if (this.prev && s.t - this.prev.t < 1000) return; // bound work at 1 Hz
        this.tick(s.t);
        const p = this.prev, dt = p ? s.t - p.t : 0;
        const valid = num(s.kw) && num(s.speed) && s.speed >= 0;
        const connected = p && dt > 0 && dt <= GAP && valid && num(p.kw) && num(p.speed);
        const charging = valid && s.speed <= 1 && s.kw < -0.3;
        const wasCharging = p && num(p.speed) && p.speed <= 1 && p.kw < -0.3;
        if (!connected && p) this.breakContinuity();
        if (!valid) { this.breakContinuity(); return; }
        const h = connected ? dt / 3600000 : 0;
        const energy = connected ? (p.kw + s.kw) / 2 * h : 0;
        if (charging) {
            this.closeJourney();
        } else {
            if (s.speed > 1 && !this.st.journey) this.st.journey = {
                start: s.t, end: s.t, moveT: s.t, km: 0, kwh: 0, regen: 0, seconds: 0,
                ambientSum: 0, ambientN: 0, partial: false, era: this.st.era || 0,
            };
            const j = this.st.journey;
            if (j) {
                if (s.speed > 1) j.moveT = s.t;
                j.end = s.t;
                if (connected && !wasCharging && p.t >= j.start) {
                    j.km += (Math.max(0, p.speed) + s.speed) / 2 * h;
                    j.kwh += energy; j.regen += Math.max(0, -energy); j.seconds += dt / 1000;
                    if (num(s.ambient)) { j.ambientSum += s.ambient * dt; j.ambientN += dt; }
                }
            }
        }
        this.prev = Object.assign({}, s);
    }
    battery(s) {
        if (!s || !num(s.t)) return;
        const day = Math.floor(s.t / DAY), era = this.st.era || 0;
        let d = this.st.days[this.st.days.length - 1];
        if ((num(s.temp) || num(s.spread)) && (!d || d.day !== day || d.era !== era)) {
            d = { day, t: s.t, era, minTemp: null, maxTemp: null, spread: null, soc: null };
            append(this.st.days, d, 365);
        }
        if (d && d.day === day && d.era === era) {
            d.t = s.t;
            if (num(s.temp)) { d.minTemp = d.minTemp === null ? s.temp : Math.min(d.minTemp, s.temp); d.maxTemp = d.maxTemp === null ? s.temp : Math.max(d.maxTemp, s.temp); }
            if (num(s.spread) && (d.spread === null || s.spread >= d.spread)) { d.spread = s.spread; d.soc = num(s.soc) ? s.soc : null; }
        }
        if (!num(s.capacity) || s.capacity < 15 || s.capacity > 200 || !num(s.capacityT)
            || s.t - s.capacityT > 3600000 || !['reported','learned'].includes(s.source)) return;
        const prev = this.st.capacities[this.st.capacities.length - 1];
        if (prev && prev.era === era && prev.source === s.source && s.capacityT <= prev.t) return;
        const point = { t: s.capacityT, kwh: s.capacity, source: s.source, era,
            temp: num(s.temp) ? s.temp : null, soc: num(s.soc) ? s.soc : null };
        if (prev && Math.floor(prev.t / DAY) === day && prev.source === s.source && prev.era === era) this.st.capacities[this.st.capacities.length - 1] = point;
        else append(this.st.capacities, point, 365);
    }
    view() { return this.st; }
}

function journeyStats(list) {
    const km = list.reduce((a, j) => a + j.km, 0), kwh = list.reduce((a, j) => a + j.kwh, 0);
    return { km, kwh, perKm: km >= 1 ? kwh / km : null, count: list.length,
        ambient: mean(list.reduce((a,j) => a+j.ambientSum,0), list.reduce((a,j) => a+j.ambientN,0)) };
}

function demoInsights(now) {
    const journeys = Array.from({length:12}, (_,i) => ({ start:now-(12-i)*DAY/2, end:now-(12-i)*DAY/2+1800000,
        km:18+i*1.3, kwh:(18+i*1.3)*(.15+(i%4)*.018), regen:.8+i*.03, seconds:1800+i*40,
        ambientSum:(8+i)*1800000, ambientN:1800000, partial:i===3, era:0 }));
    const capacities=Array.from({length:8},(_,i)=>({t:now-(7-i)*7*DAY,kwh:69.1-i*.12+(i%2)*.2,source:'learned',era:0,temp:18+i,soc:50}));
    const days=Array.from({length:14},(_,i)=>({day:Math.floor(now/DAY)-13+i,t:now-(13-i)*DAY,era:0,minTemp:12+i*.3,maxTemp:25+i*.2,spread:18+i%5,soc:60}));
    return {journeys,capacities,days,era:0};
}
module.exports = { Insights, journeyStats, demoInsights };
