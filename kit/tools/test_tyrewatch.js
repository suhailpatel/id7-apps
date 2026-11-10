'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {boot,env,run}=require('./app_test_harness');
const DAY=86400000,T=Date.UTC(2026,10,10),checks=[];
const test=(name,run)=>checks.push([name,run]);
const {Tyres,WHEELS,pressure,temperature}=require('../../apps/tyrewatch/model');
const near=(a,b)=>assert(Math.abs(a-b)<.00001,`${a} != ${b}`);
function tyres(m,t,p=25,temp=52) {
    for(const [k,prefix,value] of [['p','actualValuePressureTyre',p],['temp','actualValueTemperatureTyre',temp],['target','targetPressureTyre',25]]) {
        m.receive(k,Object.fromEntries(WHEELS.map(w=>[prefix+w+'H',value])),t);
    }
}
test('TPMS decodes explicit bar, psi, kPa and independent C/F units',()=>{
    near(pressure(25,'BAR'),2.5);near(pressure(362.594345,'PSI'),2.5);near(pressure(2500,'KPA'),2.5);
    near(temperature(60,'C'),20);near(temperature(108,'F'),20);
    for(const x of [null,undefined,NaN,Infinity,'25',0,65532,65535])assert.strictEqual(pressure(x,'BAR'),null);
    assert.strictEqual(pressure(25,null),null);assert.strictEqual(temperature(60,null),null);
    assert.strictEqual(temperature(65535,'C'),null);assert.strictEqual(temperature(255,'C'),null);
});
test('missing or stale wheel values stay unavailable, unit changes invalidate cache',()=>{
    const m=new Tyres();m.setUnits({unitOfMeasurementAirPressure:1,unitOfMeasurementTemperature:1});tyres(m,T);
    near(m.wheel('FL',T).p,2.5);assert.strictEqual(m.wheel('FL',T+30001).p,null);
    m.receive('p',{actualValuePressureTyreFLH:65535},T+1000);
    assert.strictEqual(m.wheel('FL',T+1000).p,null);assert.strictEqual(m.wheel('RR',T+1000).p,null);
    m.setUnits({unitOfMeasurementAirPressure:3,unitOfMeasurementTemperature:1});assert.strictEqual(m.wheel('FL',T).temp,null);
});
test('cool snapshots require observed rest, fresh speed, ambient and all relevant wheel values',()=>{
    const s={},m=new Tyres(s);m.setUnits({unitOfMeasurementAirPressure:1,unitOfMeasurementTemperature:1});
    tyres(m,T);m.motion(0,T);m.outside(104,T);assert(!m.capture(T));
    s.lastMove=T-4*3600000;assert(m.capture(T));assert.strictEqual(s.history.length,4);assert(!m.capture(T+1000));
    tyres(m,T+DAY,24,80);m.motion(0,T+DAY);m.outside(104,T+DAY);assert(!m.capture(T+DAY),'warm tyres are excluded');
    tyres(m,T+DAY,24);assert(m.capture(T+DAY));assert.strictEqual(s.history.length,8);
    tyres(m,T+2*DAY);m.outside(104,T+2*DAY);assert(!m.capture(T+2*DAY),'stale speed is not stationary');
    m.motion(2,T+2*DAY);assert(!m.capture(T+2*DAY));
});
test('trend compares similar temperatures across a week and bounds stored history',()=>{
    const s={history:[0,4,8].map((d,i)=>({wheel:'FL',t:T+d*DAY,p:2.6-i*.15,temp:12}))},m=new Tyres(s);
    assert(m.trend('FL').falling);near(m.trend('FL').delta,-.3);
    s.history[0].temp=30;assert.strictEqual(m.trend('FL'),null);
    const many=new Tyres({history:Array.from({length:1000},(_,i)=>({wheel:'FL',t:T+i*DAY,p:2.5,temp:12}))});
    assert.strictEqual(many.state.history.length,360);
});
test('TyreWatch renders missing/live/demo states, stops parked polling and resumes on opening',async()=>{
    env.now=T;const b=await boot('tyrewatch');let text=await b.draw();assert(text.some(s=>s==='-- bar'));
    b.watchers.statusNewCurrentUnitsStatusExt({unitOfMeasurementAirPressure:1,unitOfMeasurementTemperature:1});
    b.watchers.statusTyrePressure({actualValuePressureTyreFLH:25,actualValuePressureTyreFRH:26,actualValuePressureTyreRLH:27,actualValuePressureTyreRRH:28});
    text=await b.draw();assert(text.includes('2.50 bar'));assert(!text.some(s=>/NaN|Infinity/.test(s)));
    const poll=b.timers.find(t=>t.ms===10000);await poll.fn();assert(b.requests.length>0);
    b.requests.length=0;env.now+=11*60000;await poll.fn();assert.strictEqual(b.requests.length,0);
    b.ctx.visible('MAIN',true);await new Promise(r=>setImmediate(r));assert(b.requests.length>0);
    b.set('demo','on');
    b.watchers.statusCarSpeed2({speedVehicleCentreOfGravity:4000});await poll.fn();await b.clicks.BTN_PAGE();text=await b.draw();assert(text.includes('FALLING')||text.includes('Cool readings only'));
    b.exit();const saved=JSON.parse(fs.readFileSync(path.join(b.dir,'tyres.json')));assert.strictEqual(saved.history.length,0);assert(!saved.lastMove);
    b.set('demo','off');await b.clicks.BTN_PAGE();text=await b.draw();assert(text.includes('-- bar'));
});
run(checks);
