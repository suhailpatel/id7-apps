'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
for (const file of fs.readdirSync(__dirname).filter(n => /^test_.*\.js$/.test(n) && n !== 'test_all.js').sort()) {
    console.log('\n' + file);
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', cwd: path.resolve(__dirname, '..', '..') });
    if (result.error) { console.error(result.error.message); process.exit(1); }
    if (result.status !== 0) process.exit(result.status || 1);
}
