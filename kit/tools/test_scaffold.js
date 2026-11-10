'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createApp } = require('./create_app');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'id7-scaffold-'));
try {
    fs.cpSync(path.resolve(__dirname, '../../templates'), path.join(root, 'templates'), { recursive: true });
    const first = createApp(root, 'sample', 'Sample app');
    const read = dir => JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'));
    const a = read(first);
    assert.strictEqual(a.id, 'sample');
    assert.strictEqual(a.screens[0].title, 'Sample app');
    assert(/^[A-Z0-9]{4}$/.test(a.loggingId));
    assert.deepStrictEqual(a.signals, {});
    assert.strictEqual(a.settings.find(s => s.key === 'demo').default, 'off');
    const b = read(createApp(root, 'another', 'Another'));
    assert.notStrictEqual(a.loggingId, b.loggingId);
    assert.throws(() => createApp(root, 'sample', 'Overwrite'), /already exists/);
    assert.strictEqual(read(first).title, 'Sample app');
    for (const id of ['../escape', '/tmp/escape', 'UPPER', 'a/b', '', 'x']) assert.throws(() => createApp(root, id, 'Invalid'));
    assert.throws(() => createApp(root, 'invalid_title', ''), /title/);
    assert(!fs.existsSync(path.join(root, 'apps', 'invalid_title')));
    console.log('PASS: unique identity, isolated template, valid settings, no traversal or overwrite');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
