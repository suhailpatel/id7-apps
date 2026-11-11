'use strict';

const G = require('./kit/gauges');

const TABS = ['Service', 'Check Control', 'History'];
const PAGE_SIZE = 5;
const STATE = ['', 'Due now', 'Due soon', 'OK', 'Due soon'];
const PRIORITY = [3, 0, 1, 2, 1, 3];
const EVENTS = { observed: 'Seen active', appeared: 'Appeared', inactive: 'No longer active' };
const bold = { font: 'bold' };
const right = { align: 'right' };
const center = { align: 'center' };

function accent(t, code) {
    if (code === 1) return t.crit;
    if (code === 2 || code === 4) return t.warn;
    if (code === 3) return '#73d8a6';
    return t.dim;
}

function fit(cv, value, size, width, opts) {
    if (cv.textWidth(value, size, opts) <= width) return value;
    const letters = Array.from(value);
    while (letters.length && cv.textWidth(letters.join('') + '...', size, opts) > width) letters.pop();
    return letters.join('') + '...';
}

function group(cv, t, x, y, w, h, title) {
    G.panel(cv, t, x, y, w, h, title);
    cv.fillRect(x + 22, y + 58, w - 44, 1, t.panelEdge);
}

function empty(cv, t, x, w, title, note) {
    cv.text(title, x + w / 2, 251, 36, t.text, { font: 'bold', align: 'center' });
    cv.text(note, x + w / 2, 292, 23, t.dim, center);
}

function dateTime(at) {
    const date = new Date(at);
    const pad = n => String(n).padStart(2, '0');
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear() +
        '  ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function pagination(cv, t, offset, count) {
    if (count <= PAGE_SIZE) return;
    cv.text((offset + 1) + '-' + Math.min(count, offset + PAGE_SIZE) + ' / ' + count, 48, 478, 20, t.dim);
    cv.text('Previous / Next', 1023, 478, 20, t.dim, right);
    cv.scroll = true;
}

function drawService(cv, t, rows, summary, offset) {
    group(cv, t, 24, 44, 1024, 468, 'Service requirements');
    group(cv, t, 1072, 44, 504, 468, 'Next service');
    if (rows === null) empty(cv, t, 24, 1024, 'Service data unavailable', 'Waiting for the BMW service list');
    else if (!rows.length) empty(cv, t, 24, 1024, 'No items reported', 'BMW returned an empty service list');
    else {
        cv.text('DISTANCE', 652, 128, 17, t.dim, right);
        cv.text('DATE', 836, 128, 17, t.dim, right);
        cv.text('STATUS', 1023, 128, 17, t.dim, right);
        rows.slice(offset, offset + PAGE_SIZE).forEach((item, index) => {
            const y = 163 + index * 64;
            const tone = accent(t, item.color);
            cv.roundRect(49, y - 21, 4, 28, 2, tone);
            cv.text(fit(cv, item.title, 26, 405, bold), 68, y, 26, t.text, bold);
            cv.text(fit(cv, item.distance || '--', 23, 153, right), 652, y, 23, item.distance ? t.text : t.dim, right);
            cv.text(fit(cv, item.date || '--', 23, 150, right), 836, y, 23, item.date ? t.text : t.dim, right);
            cv.text(STATE[item.color] || '--', 1023, y, 22, tone, right);
            cv.fillRect(48, y + 18, 976, 1, t.panelEdge);
        });
    }
    pagination(cv, t, offset, rows ? rows.length : 0);

    if (!summary) {
        empty(cv, t, 1072, 504, 'Unavailable', 'Waiting for the BMW summary');
        return;
    }
    cv.text(fit(cv, summary.title || 'BMW service', 34, 451, bold), 1096, 168, 34, t.text, bold);
    cv.text('DATE', 1096, 220, 19, t.dim, bold);
    cv.text(fit(cv, summary.date || '--', 43, 451, bold), 1096, 269, 43, t.text, bold);
    cv.fillRect(1096, 291, 456, 1, t.panelEdge);
    cv.text('DISTANCE', 1096, 326, 19, t.dim, bold);
    cv.text(fit(cv, summary.distance || '--', 39, 451, bold), 1096, 371, 39, t.text, bold);
    if (STATE[summary.color]) {
        cv.text(STATE[summary.color].toUpperCase(), 1096, 463, 23, accent(t, summary.color), bold);
    }
}

function drawWarnings(cv, t, rows, latest, offset) {
    group(cv, t, 24, 44, 1024, 468, 'Active messages');
    group(cv, t, 1072, 44, 504, 468, 'Check Control');
    if (rows === null) empty(cv, t, 24, 1024, 'Messages unavailable', 'Waiting for a fresh BMW report');
    else if (!rows.length) empty(cv, t, 24, 1024, 'No active messages reported', 'BMW returned a fresh Check Control list');
    else rows.slice(offset, offset + PAGE_SIZE).forEach((item, index) => {
        const y = 136 + index * 64;
        cv.roundRect(49, y - 21, 4, 28, 2, accent(t, item.color));
        cv.text(fit(cv, item.title || 'BMW message', 27, 752, bold), 68, y, 27, t.text, bold);
        cv.text('CC ' + item.id, 1023, y, 22, t.dim, right);
        cv.fillRect(48, y + 18, 976, 1, t.panelEdge);
    });
    pagination(cv, t, offset, rows ? rows.length : 0);

    cv.text(rows ? String(rows.length) : '--', 1096, 245, 110, rows && rows.length ? t.warn : t.text, { font: 'num' });
    cv.text(rows === null ? 'Active count unavailable' : rows.length === 1 ? 'Active BMW message' : 'Active BMW messages',
        1096, 288, 25, t.dim);
    if (latest) {
        cv.fillRect(1096, 324, 456, 1, t.panelEdge);
        cv.text('LAST OBSERVATION', 1096, 371, 19, t.dim, bold);
        cv.text(dateTime(latest.at), 1096, 417, 28, t.text);
    }
}

function drawHistory(cv, t, rows, offset) {
    group(cv, t, 24, 44, 1552, 468, 'Check Control timeline');
    if (!rows.length) {
        empty(cv, t, 24, 1552, 'No observations yet', 'Check Control changes appear here after iX Service sees them');
        return;
    }
    rows.slice(offset, offset + PAGE_SIZE).forEach((item, index) => {
        const y = 136 + index * 64;
        const tone = item.kind === 'inactive' ? t.dim : accent(t, item.color);
        cv.roundRect(49, y - 21, 4, 28, 2, tone);
        cv.text(fit(cv, item.title || 'BMW message', 27, 685, bold), 68, y, 27, t.text, bold);
        cv.text('CC ' + item.id, 857, y, 22, t.dim, right);
        cv.text(EVENTS[item.kind], 920, y, 23, item.kind === 'inactive' ? t.dim : t.text, bold);
        cv.text(dateTime(item.at), 1552, y, 23, t.dim, right);
        cv.fillRect(48, y + 18, 1504, 1, t.panelEdge);
    });
    pagination(cv, t, offset, rows.length);
}

function draw(ctx, model, now, tab, offset, demo) {
    const t = ctx.theme();
    const cv = ctx.canvas(1600, 520).clear(t.bg);
    const sort = (a, b) => PRIORITY[a.color] - PRIORITY[b.color];
    const list = model.read('cbsDataServiceList', now);
    const summary = model.read('cbsDataSBA', now);
    let rows = null;
    if (tab === 0 && list) rows = Array.from(list.values()).sort(sort);
    if (tab === 1) {
        rows = model.warnings(now);
        if (rows) rows.sort(sort);
    }
    if (tab === 2) rows = model.events;
    const count = rows ? rows.length : 0;
    offset = Math.min(offset, Math.max(0, Math.ceil(count / PAGE_SIZE) - 1) * PAGE_SIZE);
    const badge = demo ? { text: 'DEMO' } : tab === 2 ? null :
        rows || (tab === 0 && summary) ? { text: 'BMW DATA', color: t.accent } : { text: 'UNAVAILABLE', color: t.dim };
    G.frame(cv, t, TABS, tab, [badge]);
    if (tab === 0) drawService(cv, t, rows, summary, offset);
    else if (tab === 1) drawWarnings(cv, t, rows, model.events[0], offset);
    else drawHistory(cv, t, rows, offset);
    return { canvas: cv, offset };
}

module.exports = { draw, TABS, PAGE_SIZE };
