'use strict';

const FRESH_MS = 120000;
const MAX_EVENTS = 150;
const COLORS = ['DEFAULT', 'RED', 'YELLOW', 'GREEN', 'ORANGE', 'WHITE'];
const SERVICE_NAMES = {
    2: 'Front brakes', 3: 'Brake fluid', 6: 'Rear brakes',
    17: 'Vehicle check', 32: 'Statutory vehicle inspection', 100: 'Vehicle check',
};

function validId(id) {
    return Number.isInteger(id) && id > 0 && id < 65535;
}

function text(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\x00-\x1f\x7f\s]+/g, ' ').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').trim().slice(0, 160);
}

function color(value, max) {
    const index = typeof value === 'string' ? COLORS.indexOf(value) : value;
    return Number.isInteger(index) && index > 0 && index <= max ? index : 0;
}

// The binding can return a field directly, or wrap it in the field name / value.
function unwrap(value, keys, matches) {
    for (let i = 0; i < 6 && value && typeof value === 'object'; i++) {
        if (matches(value)) return value;
        const key = keys.find(k => Object.prototype.hasOwnProperty.call(value, k));
        if (!key) break;
        value = value[key];
    }
    return null;
}

function list(value, field, max, decode) {
    const array = unwrap(value, [field, 'value'], Array.isArray);
    if (!array || array.length > max) return null;
    const result = new Map();
    for (const raw of array) {
        const row = decode(raw);
        if (!row) return null;
        if (row.active !== false || !result.has(row.id)) result.set(row.id, row);
    }
    return result;
}

function serviceList(value) {
    return list(value, 'cbsDataServiceList', 32, raw => {
        const row = unwrap(raw, ['cBSDataServiceStruct', 'cBSDataServiceWithSymbolID', 'cBSDataService', 'value'],
            v => validId(v.cBSIdentifier));
        if (!row) return null;
        return {
            id: row.cBSIdentifier,
            title: text(row.cBSServcieName) || SERVICE_NAMES[row.cBSIdentifier] || 'Service item ' + row.cBSIdentifier,
            distance: text(row.cBSServiceWay),
            date: text(row.cBSServiceDate),
            color: color(row.cBSColor, 4),
        };
    });
}

function serviceSummary(value) {
    const row = unwrap(value, ['cbsDataSBA', 'value'], v => typeof v.cBSDataSBAText === 'string');
    if (!row) return null;
    const summary = {
        title: text(row.cBSDataSBAText), distance: text(row.cBSDataSBADistance),
        date: text(row.cBSDataSBADate), color: color(row.cBSDataSBAColor, 4),
    };
    return summary.title || summary.distance || summary.date ? summary : null;
}

function messageNames(value) {
    return list(value, 'ccList', 42, raw => {
        const row = unwrap(raw, ['cCListElement', 'value'], v => validId(v.cCIdentifer));
        return row && { id: row.cCIdentifer, title: text(row.cCShortName), color: color(row.cCColor, 5) };
    });
}

function warningList(value) {
    const rows = list(value, 'basicList', 45, raw => {
        const row = unwrap(raw, ['value'], v => validId(v.ccmId));
        if (!row) return null;
        const state = row.activeState;
        if (state !== 0 && state !== 1 && state !== 'AKTIV' && state !== 'INAKTIV') return null;
        // The same list can carry diagnostic records. Only CCM records describe warnings.
        const reason = row.reason;
        const diagnostic = reason === 0 || reason === 1 || reason === 'DTC_MESSAGE' || reason === 'DTC_MAX_AMOUNT_REACHED';
        return { id: row.ccmId, active: !diagnostic && (state === 0 || state === 'AKTIV') };
    });
    if (!rows) return null;
    return new Map(Array.from(rows).filter(([, row]) => row.active));
}

const decode = { cbsDataServiceList: serviceList, cbsDataSBA: serviceSummary, ccList: messageNames, basicList: warningList };

function savedEvents(saved) {
    if (!saved || saved.version !== 1 || !Array.isArray(saved.events)) return [];
    return saved.events.slice(0, MAX_EVENTS).filter(event => event && validId(event.id) &&
        Number.isSafeInteger(event.at) && event.at > 0 && event.at < 8640000000000000 &&
        ['observed', 'appeared', 'inactive'].includes(event.kind)).map(event => ({
        id: event.id, at: event.at, kind: event.kind, title: text(event.title), color: color(event.color, 5),
    }));
}

class Service {
    constructor(saved) {
        this.events = savedEvents(saved);
        this.live = {};
        this.revision = 0;
    }

    invalidate(fields) {
        for (const field of fields) delete this.live[field];
    }

    read(field, now) {
        const entry = this.live[field];
        return entry && now >= entry.at && now - entry.at < FRESH_MS ? entry.value : null;
    }

    last(id) {
        return this.events.find(event => event.id === id);
    }

    details(id, now) {
        const names = this.read('ccList', now);
        return names && names.get(id);
    }

    record(id, kind, now) {
        const last = (kind === 'inactive' && this.last(id)) || {};
        const details = this.details(id, now) || {};
        this.events.unshift({
            id, at: now, kind, title: details.title || last.title || '', color: details.color || last.color || 0,
        });
        if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
        this.revision++;
    }

    receive(field, value, now) {
        const before = this.read(field, now);
        const decoded = decode[field](value);
        this.live[field] = { at: now, value: decoded };
        if (field === 'basicList' && decoded) {
            if (before) {
                for (const id of before.keys()) {
                    if (!decoded.has(id)) this.record(id, 'inactive', now);
                }
                for (const id of decoded.keys()) {
                    if (!before.has(id)) this.record(id, 'appeared', now);
                }
            } else {
                // Across a gap, we know only what is active in this first snapshot.
                for (const id of decoded.keys()) {
                    const last = this.last(id);
                    if (!last || last.kind === 'inactive') this.record(id, 'observed', now);
                }
            }
        }
        if (field === 'basicList' || field === 'ccList') this.enrich(now);
    }

    enrich(now) {
        const active = this.read('basicList', now);
        const names = this.read('ccList', now);
        if (!active || !names) return;
        for (const id of active.keys()) {
            const event = this.last(id);
            const detail = names.get(id);
            if (!event || event.kind === 'inactive' || !detail) continue;
            const title = event.title || detail.title;
            const reportedColor = event.color || detail.color;
            if (title === event.title && reportedColor === event.color) continue;
            event.title = title;
            event.color = reportedColor;
            this.revision++;
        }
    }

    warnings(now) {
        const active = this.read('basicList', now);
        if (!active) return null;
        return Array.from(active.keys(), id => this.details(id, now) || { id, title: '', color: 0 });
    }
}

function demo(now) {
    const model = new Service();
    model.receive('cbsDataServiceList', [
        { cBSIdentifier: 2, cBSServcieName: 'Front brakes', cBSColor: 'GREEN', cBSServiceWay: '14,000 mi' },
        { cBSIdentifier: 3, cBSServcieName: 'Brake fluid', cBSColor: 'YELLOW', cBSServiceDate: '12/2026' },
        { cBSIdentifier: 6, cBSServcieName: 'Rear brakes', cBSColor: 'GREEN', cBSServiceWay: '22,000 mi' },
        { cBSIdentifier: 17, cBSServcieName: 'Vehicle check', cBSColor: 'GREEN', cBSServiceDate: '11/2027', cBSServiceWay: '9,800 mi' },
    ], now);
    model.receive('cbsDataSBA', {
        cBSDataSBAText: 'Brake fluid', cBSDataSBADate: '12/2026', cBSDataSBAColor: 'YELLOW',
    }, now);
    model.receive('ccList', [
        { cCIdentifer: 1, cCShortName: 'Washer fluid low', cCColor: 'YELLOW' },
        { cCIdentifer: 2, cCShortName: 'Tyre pressure low', cCColor: 'YELLOW' },
    ], now);
    model.receive('basicList', [{ ccmId: 1, activeState: 'AKTIV' }], now);
    model.events = [
        { id: 1, at: now - 360000, kind: 'appeared', title: 'Washer fluid low', color: 2 },
        { id: 2, at: now - 86400000, kind: 'inactive', title: 'Tyre pressure low', color: 2 },
        { id: 2, at: now - 90000000, kind: 'observed', title: 'Tyre pressure low', color: 2 },
    ];
    return model;
}

module.exports = { Service, demo };
