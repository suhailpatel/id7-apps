'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createApp(root, id, title) {
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(id || '')) throw new Error('Use a 2–32 character ID: lowercase letters, digits and underscores; begin with a letter.');
    if (typeof title !== 'string' || !title.trim() || title.length > 64 || /[\x00-\x1f]/.test(title)) throw new Error('Provide a title of 1–64 printable characters.');
    const apps = path.join(root, 'apps'), dest = path.join(apps, id);
    if (fs.existsSync(dest)) throw new Error('App already exists: ' + id);
    const taken = new Set();
    for (const name of fs.existsSync(apps) ? fs.readdirSync(apps) : []) {
        const manifest = path.join(apps, name, 'app.json');
        if (fs.existsSync(manifest)) taken.add(JSON.parse(fs.readFileSync(manifest, 'utf8')).loggingId);
    }
    let code = crypto.createHash('sha256').update(id).digest().readUInt32BE(0) % (36 ** 3);
    let loggingId;
    for (let i = 0; i < 36 ** 3; i++) {
        const candidate = 'O' + ((code + i) % (36 ** 3)).toString(36).toUpperCase().padStart(3, '0');
        if (!taken.has(candidate)) { loggingId = candidate; break; }
    }
    if (!loggingId) throw new Error('No free logging ID');
    const template = path.join(root, 'templates', 'basic');
    const spec = JSON.parse(fs.readFileSync(path.join(template, 'app.json'), 'utf8'));
    Object.assign(spec, { id, title: title.trim(), loggingId });
    spec.screens[0].title = spec.title;
    const main = fs.readFileSync(path.join(template, 'main.js'));
    fs.mkdirSync(apps, { recursive: true });
    fs.mkdirSync(dest); // Refuse collisions, including between simultaneous invocations.
    fs.writeFileSync(path.join(dest, 'app.json'), JSON.stringify(spec, null, 2) + '\n');
    fs.writeFileSync(path.join(dest, 'main.js'), main);
    fs.writeFileSync(path.join(dest, 'README.md'), '# ' + spec.title + '\n\nApp ID: `' + id + '`. See `docs/DEVELOPMENT.md` in the repository root.\n');
    return dest;
}
if (require.main === module) {
    try {
        const root = path.resolve(__dirname, '..', '..');
        const [id, title] = process.argv.slice(2);
        console.log('Created ' + createApp(root, id, title));
        console.log('Preview build: npm run build:preview -- ' + id);
    } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { createApp };
