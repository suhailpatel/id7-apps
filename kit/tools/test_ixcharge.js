'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {boot,env,run}=require('./app_test_harness');
const {ChargeModel}=require('../../apps/ixcharge/model');
const {ChargeHistory}=require('../../apps/ixcharge/history');
const {createCollector}=require('../../apps/ixcharge/telemetry');
const {importLegacy}=require('../../apps/ixcharge/legacy');
const {chargeEstimate}=require('../../apps/ixcharge/ev');
const spec=require('../../apps/ixcharge/app.json'),T=Date.UTC(2026,10,11),checks=[];
const test=(name,fn)=>checks.push([name,fn]);
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,a+' != '+b);
const sample=(m,t,soc=60,kw=-60,speed=0)=>{
    m.put('hvV',{v:400},t,'DDB4');m.put('hvI',{a:kw*2.5},t,'DD69');m.put('soc',{pct:soc},t,'DDBC');
    m.motion(speed*64,t);m.record(t);
};
test('standalone identity, explicit demo, read-only signals and no nominal capacity',()=>{
    assert.strictEqual(spec.id,'ixcharge');assert.strictEqual(spec.settings.find(s=>s.key==='demo').default,'off');
    assert(!spec.requires);assert.deepStrictEqual(spec.config.groups.capacity,[]);
    assert(!spec.settings.some(s=>/batterySize|ratedPower|model|reserve|distUnit/.test(s.key)));
    for(const fields of Object.values(spec.signals))for(const [key,val]of Object.entries(fields))if(!key.startsWith('_'))assert(!val.includes('w'));
});
test('SOC log survives sleep and restart once, preserves unknown energy and excludes regen',()=>{
    const st={};let h=new ChargeHistory(st,'a');h.soc(20,T,0,null);
    h=new ChargeHistory(st,'a');h.soc(80,T+8*3600000,null,null);
    h=new ChargeHistory(st,'a');h.soc(80,T+8*3600000+5000,40,null);
    assert.strictEqual(st.log.length,1);assert.strictEqual(st.log[0].kwh,null);
    h.soc(82,T+8*3600000+10000,40,70);assert.strictEqual(st.log.length,1);assert(!st.session);
    h=new ChargeHistory(st,'b');assert.strictEqual(st.log.length,1);assert(!st.lastSoc);
});
test('independent collector feeds charging energy, freshness and gaps without cached integration',()=>{
    const st={},m=new ChargeModel(st,spec.config);
    for(let i=0;i<=12;i++)sample(m,T+i*5000,20+i/12);
    near(st.charge.kwh,1);near(st.charge.seconds,60);assert.strictEqual(st.charge.peak,60);
    m.record(T+65000);near(st.charge.kwh,1);assert(st.charge.partial);
    assert.strictEqual(m.snapshot(T+80000).kw,null);assert.strictEqual(m.snapshot(T+100000).soc,null);
    sample(m,T+100000,30,-60,60);assert.strictEqual(st.charges.length,1);assert(!st.charge);
    assert.strictEqual(m.snapshot(T+106000).speed,null);
    const d=m.snapshot(T+100000);assert.strictEqual(chargeEstimate(d.soc,80,.7,d.kw,d.speed).minutes,null);
});
test('capacity learns from two driving windows and calibration changes keep completed records only',()=>{
    const st={},m=new ChargeModel(st,spec.config);
    // 35 kW for 12 minutes = 7 kWh over a 10% drop: two independent 5% windows.
    for(let i=0;i<=144;i++)sample(m,T+i*5000,80-i*10/144,35,60);
    near(m.snapshot(T+720000).capacity,70);assert.strictEqual(m.snapshot(T+720000).source,'learned');
    assert.strictEqual(m.snapshot(T+31*86400000).capacity,null);
    const unknown=new ChargeModel({},spec.config);sample(unknown,T,50);assert.strictEqual(unknown.snapshot(T).capacity,null);
    assert.strictEqual(chargeEstimate(50,80,null,-60,0),null);
    st.log.push({from:20,to:80});
    const config=JSON.parse(JSON.stringify(spec.config));config.powerSign=1;
    const changed=new ChargeModel(st,config);assert.strictEqual(changed.snapshot(T+720000).capacity,null);assert.strictEqual(st.log.length,1);
});
test('collector uses only reads, bounded polling, backoff and demo cancellation',async()=>{
    let now=T,enabled=true,calls=0;
    const st={},m=new ChargeModel(st,spec.config);
    const diag={available:true,physical:async(ecu,sid,bytes)=>{calls++;assert.strictEqual(ecu,7);assert.strictEqual(sid,0x22);return [0x62,bytes[0],bytes[1],0x9c,0x40];}};
    const config=Object.assign({},spec.config,{groups:{hvV:[spec.config.groups.hvV[0]]}});
    const c=createCollector({diag,config,model:m,clock:()=>now,enabled:()=>enabled});
    await c.poll();await c.poll();assert.strictEqual(calls,1);
    now+=601000;await c.poll();assert.strictEqual(calls,1);
    c.motion(65535);await c.poll();assert.strictEqual(calls,1);
    c.motion(64*30);await c.poll();assert.strictEqual(calls,2);
    now+=181000;await c.poll();assert.strictEqual(calls,2);c.touch();await c.poll();assert.strictEqual(calls,3);
    diag.physical=async()=>{calls++;return null;};
    for(let i=0;i<3;i++){now+=5000;await c.poll();}const failed=calls;
    now+=5000;await c.poll();assert.strictEqual(calls,failed);
    let release;diag.physical=()=>new Promise(r=>{release=r;});c.reset();const pending=c.poll();
    enabled=false;c.reset();release([0x62,0xdd,0xb4,0x9c,0x40]);await pending;
    assert.deepStrictEqual(m.readings,{});assert(!st.charge);assert.strictEqual(st.log.length,0);
});
test('legacy import is identity-checked, bounded, once-only and keeps source provenance',()=>{
    const st={log:[],charges:[]},entry={from:20,to:80,fromT:T-3600000,toT:T,kwh:null};
    const packet={version:1,source:'ixdrive',sourceId:'ixdrive',demo:false,t:T,history:{log:[entry],charges:[]}};
    assert(!importLegacy(st,packet,'suhailpatel_ixdrive',T));assert(!importLegacy(st,packet,'ixdrive',T+31000));
    assert(!importLegacy(st,Object.assign({},packet,{demo:true}),'ixdrive',T));
    assert(importLegacy(st,packet,'ixdrive',T));assert.strictEqual(st.log.length,1);assert.strictEqual(st.log[0].source,'ixdrive');
    assert.strictEqual(st.log[0].kwh,null);assert(!importLegacy(st,packet,'ixdrive',T));
    const restarted=JSON.parse(JSON.stringify(st));assert(!importLegacy(restarted,packet,'ixdrive',T));
    assert.deepStrictEqual(packet.history.log,[entry],'source remains untouched');
    const curve={start:T-60000,end:T,seconds:60,kwh:1,peak:60,from:20,to:21,era:3,
        points:[{t:T,soc:21,kw:60,temp:25,segment:1}]};
    packet.history.charge=curve;
    const migrated={};assert(importLegacy(migrated,packet,'ixdrive',T));
    assert(migrated.charges[0].partial);assert.strictEqual(migrated.charges[0].era,'ixdrive:3');
    assert.strictEqual(migrated.charges[0].points[0].temp,25);assert(!curve.partial);

});
test('all three pages, navigation, units and saved history work independently; demo never saves fixtures',async()=>{
    env.now=T;const b=await boot('ixcharge');
    for(let i=0;i<3;i++){const text=await b.draw();assert(text.includes('WAITING FOR CAR'));assert(!text.some(s=>/NaN|Infinity/.test(s)));await b.clicks.BTN_PAGE();}
    b.set('demo','on');let text=await b.draw();assert(text.includes('45.0'));assert(text.includes('Capacity source: demo'));
    await b.clicks.BTN_PAGE();text=await b.draw();assert(text.includes('ADDED'));await b.clicks.BTN_READ();
    await b.clicks.BTN_PAGE();text=await b.draw();assert(text.includes('130 kW'));await b.clicks.BTN_READ();assert((await b.draw()).includes('145 kW'));
    b.set('tempUnit','f');assert((await b.draw()).some(s=>s.includes('°F')));
    b.exit();assert(!fs.existsSync(path.join(b.dir,'charging.json')),'demo fixtures never reach storage');
    b.set('demo','off');text=await b.draw();assert(text.includes('NO SESSION YET'));b.exit();
    // Offline browsing needs neither iXDrive nor an active car connection.
    const saved={log:[{from:20,to:80,fromT:T-3600000,toT:T,kwh:null}],charges:[]};
    fs.writeFileSync(path.join(b.dir,'charging.json'),JSON.stringify(saved));
    const restored=await boot('ixcharge',{},b.dir);await restored.clicks.BTN_PAGE();text=await restored.draw();
    assert(text.includes('+60 %'));assert(text.some(s=>/energy incomplete/i.test(s)));restored.exit();
});
run(checks);
