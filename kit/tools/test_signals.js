'use strict';
// Exercise the real signal watcher against a fake native transport, including late replies.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
(async () => {
    let active = false, demo = false, epoch = 0, gets = 0, received = 0, resolveRead, availability, notify;
    const timers = new Set();
    const native = {
        init: async () => {}, isAvailable: () => true,
        subscribeToAvailability(fn) { availability = fn; },
        subscribe: async opts => { notify = opts.onReceive; },
        getValue() { gets++; return new Promise(resolve => { resolveRead = resolve; }); },
        shutdown: async () => {},
    };
    const module = { exports: {} }, file = path.resolve(__dirname, '../runtime/signals.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, __dirname: path.dirname(file),
        require: name => name === 'someip' ? { buildProxy: async () => native } : name === 'fs' ?
            { readFileSync: () => JSON.stringify({ fields: { speed: { getter: {} } } }) } : require(name),
        setImmediate, setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
    });
    const sub = await module.exports.watch('test.Vehicle', '1', { speed: () => received++ }, null,
        { pollMs: 10, shouldRead: () => active && !demo, shouldReceive: () => !demo, generation: () => epoch });
    await flush(); assert.strictEqual(gets, 0, 'parked startup does not read');
    availability(false); availability(true); timers.forEach(fn => fn()); await flush();
    assert.strictEqual(gets, 0, 'parked reconnect and periodic reads stay stopped');
    notify({ speed: 10 }); assert.strictEqual(received, 1, 'motion notification can wake a parked app');
    active = true; sub.refresh(); await flush(); assert.strictEqual(gets, 1);
    sub.refresh(); timers.forEach(fn => fn()); await flush(); assert.strictEqual(gets, 1, 'no overlapping getter');
    active = false; resolveRead({}); await flush(); assert.strictEqual(received, 1, 'late parked reply ignored');
    active = true; sub.refresh(); await flush();
    demo = true; epoch++; notify({}); assert.strictEqual(received, 1, 'demo blocks notifications');
    timers.forEach(fn => fn()); await flush(); assert.strictEqual(gets, 2, 'demo blocks reads');
    demo = false; epoch++; resolveRead({}); await flush();
    assert.strictEqual(received, 1, 'pre-demo reply ignored even after returning to real mode');
    sub.refresh(); await flush(); resolveRead({}); await flush(); assert.strictEqual(received, 2);
    sub.refresh(); active = false; await flush(); assert.strictEqual(gets, 3, 'gate checked again before queued getter');
    await sub.shutdown(); active = true; sub.refresh(); notify({}); await flush();
    assert.strictEqual(gets, 3); assert.strictEqual(received, 2); assert.strictEqual(timers.size, 0);
    // Existing callers without the optional gates retain the initial read behavior.
    await module.exports.watch('test.Legacy', '1', { speed: () => received++ }); await flush();
    assert.strictEqual(gets, 4); resolveRead({}); await flush(); assert.strictEqual(received, 3);
    console.log('PASS signal gates cover startup, reconnect, parked/demo, late replies, resume and shutdown');
})().catch(e => { console.error(e); process.exitCode = 1; });
