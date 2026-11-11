'use strict';
const assert=require('assert'),zlib=require('zlib');
const fonts=require('../runtime/fonts'),{atlasId}=require('../runtime/record');
const definition={cacheKey:'fixture-v1',sizes:[{size:12,ascent:1,descent:0,atlasW:1,atlasH:1,
    alpha:zlib.deflateSync(Buffer.from([255])).toString('base64'),glyphs:{48:[0,0,1,1,0,-1,2]}}]};
const original=fonts.get('num',64);
assert.throws(()=>fonts.register('num',definition),/already registered/);
assert.strictEqual(fonts.get('num',64),original,'built-in fonts remain untouched');
assert.throws(()=>fonts.register('app-test',{sizes:definition.sizes}),/Invalid/);
fonts.register('app-test',definition);
const f=fonts.get('app-test',10);
assert.strictEqual(f.family,'app-test');assert.strictEqual(f.alpha[0],255);
assert.strictEqual(fonts.measure(f,'00'),4);
assert.strictEqual(fonts.get('app-test',20),f,'largest baked size handles larger text');
assert.throws(()=>fonts.register('app-test',definition),/already registered/);
const revised=Object.assign({},f,{cacheKey:'fixture-v2'});
assert.notStrictEqual(atlasId(f,f.family),atlasId(revised,revised.family),'changed assets cannot reuse stale renderer glyphs');
console.log('PASS app fonts preserve built-ins, select sizes and distinguish renderer asset revisions');
