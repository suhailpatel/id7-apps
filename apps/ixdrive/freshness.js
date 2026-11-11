'use strict';
const AUX_MS = 60000;
const recent = (t, now, ttl) => typeof t === 'number' && t > 0 && now >= t && now - t < ttl;
const value = (source, key, now, ttl = AUX_MS) => recent(source[key + 'T'], now, ttl) ? source[key] : null;
// Timestamp each input independently so another signal cannot refresh an old value.
function track(source, keys, clock = Date.now, ttl = AUX_MS) {
    keys.forEach(key => {
        let current = source[key] == null ? null : source[key];
        source[key + 'T'] = 0;
        Object.defineProperty(source, key, { enumerable: true,
            get: () => recent(source[key + 'T'], clock(), ttl) ? current : null,
            set: next => { current = next == null ? null : next; source[key + 'T'] = clock(); }
        });
    });
    return () => keys.forEach(key => { source[key] = null; source[key + 'T'] = 0; });
}
module.exports = { AUX_MS, recent, value, track };
