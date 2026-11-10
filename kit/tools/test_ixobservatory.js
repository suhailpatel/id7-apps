'use strict';
const assert=require('assert');
const {boot,env,run}=require('./app_test_harness');
const {Observatory,decode,demo}=require('../../apps/ixobservatory/model');
const {createCollector}=require('../../apps/ixobservatory/telemetry');
const spec=require('../../apps/ixobservatory/app.json');
const T=Date.UTC(2026,10,10),checks=[],test=(name,fn)=>checks.push([name,fn]);
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const response=(did,...bytes)=>[0x62,parseInt(did,16)>>8,parseInt(did,16)&255,...bytes];
const groups=spec.config.groups;
test('candidate decoding checks identifiers, lengths, signs, limits and invalid cells',()=>{
    near(decode(response('DDB4',0x98,0x58),groups.hvV[0]).v,390);
    near(decode(response('DD69',255,255,0xfc,0x18),groups.hvI[0]).a,-10);
    assert.strictEqual(decode(response('DDBC',0x98,0x58),groups.hvV[0]),null);
    assert.strictEqual(decode([0x7f,0x22,0x31],groups.hvV[0]),null);
    assert.strictEqual(decode(response('DDB4',255,255),groups.hvV[0]),null);
    assert.strictEqual(decode(response('DDB4',0x98),groups.hvV[0]),null);
    const v=decode(response('DFA5',0x0f,0x3c,255,255,0x0f,0x46),groups.cellV[0]);
    assert.deepStrictEqual(v.cells,[3.9,null,3.91]);near(v.max-v.min,.01);
    assert.strictEqual(decode(response('DFA5',0x0f),groups.cellV[0]),null);
    assert.strictEqual(decode(response('DDC0',0x0b,0xb8,0x07,0xd0,0x09,0xc4),groups.cellT[0]),null);
});
test('freshness and synchronized voltage/current prevent fabricated power or old temperatures',()=>{
    const m=new Observatory();assert.strictEqual(m.snapshot(T).kw,null);
    m.put('hvV',{v:400},T);m.put('hvI',{a:-20},T);near(m.snapshot(T).kw,-8);
    assert.strictEqual(m.snapshot(T+15001).kw,null);
    m.put('hvI',{a:20},T+6000);assert.strictEqual(m.snapshot(T+6000).kw,null);
    m.put('cellT',{avg:25,min:24,max:26},T);assert.strictEqual(m.snapshot(T+30001).pack,null);
    m.put('cellT',null,T+1000);assert.strictEqual(m.snapshot(T+1000).pack,null);
    assert.strictEqual(m.snapshot(T).motor,null);
});
test('temperature history keeps gaps, rejects cached repeats and stays bounded',()=>{
    const m=new Observatory();m.put('cellT',{avg:20},T);m.record(T);m.record(T+1000);assert.strictEqual(m.history.length,1);
    m.record(T+5000);assert.strictEqual(m.history[1].pack,null);
    m.put('cellT',{avg:22},T+10000);m.record(T+10000);assert.strictEqual(m.segments('pack',T+10000,10).length,2);
    m.put('cellT',{avg:23},T+40000);m.record(T+40000);assert.strictEqual(m.segments('pack',T+40000,10).length,3);
    for(let i=0;i<1000;i++){m.put('cellT',{avg:20},T+60000+i*5000);m.record(T+60000+i*5000);}
    assert.strictEqual(m.history.length,720);m.clear();assert.strictEqual(m.history.length,0);
});
test('collector reads only configured battery DIDs, pauses parked and resumes on interaction',async()=>{
    let now=T;const calls=[],m=new Observatory();
    const diag={available:true,physical:async(ecu,sid,bytes)=>{calls.push({ecu,sid,bytes});const did=(bytes[0]<<8)|bytes[1];return did===0xDDB4?response('DDB4',0x9c,0x40):response('DD69',255,255,0xf8,0x30);}};
    const c=createCollector({diag,config:{ecu:7,powerSign:-1,groups:{hvV:[groups.hvV[0]],hvI:groups.hvI,motor:[]}},model:m,clock:()=>now});
    await c.poll();await c.poll();assert.strictEqual(calls.length,2);assert(calls.every(c=>c.ecu===7&&c.sid===0x22));near(m.snapshot(now).kw,8);
    now+=601000;await c.poll();assert.strictEqual(calls.length,2);
    c.motion(65535);c.motion(65534);await c.poll();assert.strictEqual(calls.length,2);
    c.motion(64*60);await c.poll();assert.strictEqual(calls.length,4);
    now+=181000;await c.poll();assert.strictEqual(calls.length,4);c.touch();await c.poll();assert.strictEqual(calls.length,6);
});
test('unavailable groups back off and delayed replies cannot cross a demo switch',async()=>{
    let now=T,enabled=true,n=0;const m=new Observatory(),config={ecu:7,powerSign:-1,groups:{hvV:[groups.hvV[0]]}};
    const diag={available:true,physical:async()=>{n++;return null;}};
    const c=createCollector({diag,config,model:m,clock:()=>now,enabled:()=>enabled});
    for(let i=0;i<3;i++){await c.poll();now+=5000;}assert.strictEqual(n,3);await c.poll();assert.strictEqual(n,3);
    now+=60000;await c.poll();assert.strictEqual(n,4);
    let release;diag.physical=()=>new Promise(r=>{release=r;});c.reset();const pending=c.poll();await c.poll();
    enabled=false;c.reset();release(response('DDB4',0x98,0x58));await pending;
    assert.strictEqual(m.snapshot(now).volts,null);assert.strictEqual(m.history.length,0);
    enabled=true;diag.available=false;await c.poll();assert.strictEqual(m.history.length,0);
});
test('app identity, read-only declarations and honest motor support',()=>{
    assert.strictEqual(spec.id,'ixobservatory');assert.strictEqual(spec.settings.find(s=>s.key==='demo').default,'off');
    assert.deepStrictEqual(groups.motor,[]);assert(!spec.signals['de.bmw.infotainment.vehicle.CDS']);
    for(const [iface,fields] of Object.entries(spec.signals))for(const [key,val]of Object.entries(fields))if(!key.startsWith('_'))assert(!val.includes('w'));
    assert.strictEqual(demo(T).snapshot(T).motor,null);
});
test('all screens render demo, missing readings and Fahrenheit; cell navigation is bounded',async()=>{
    env.now=T;const b=await boot('ixobservatory');
    for(let i=0;i<3;i++){const text=await b.draw();assert(!text.some(s=>/NaN|Infinity/.test(s)));assert(text.includes('WAITING FOR CAR'));await b.clicks.BTN_NEXT();}
    b.set('demo','on');let text=await b.draw();assert(text.includes('26.5 °C'));assert(text.includes('Unavailable'));
    b.set('tempUnit','f');text=await b.draw();assert(text.includes('79.7 °F'));
    await b.clicks.BTN_NEXT();await b.clicks.BTN_DETAIL();text=await b.draw();assert(text.includes('WINDOW: 30 MIN'));
    await b.clicks.BTN_NEXT();await b.clicks.BTN_DETAIL();text=await b.draw();assert(text.includes('96 / 96 cells read · blue lowest · amber highest'));
    b.set('demo','off');text=await b.draw();assert(text.includes('Cell-by-cell readings unavailable'));b.exit();
});
run(checks);
