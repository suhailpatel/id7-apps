'use strict';
const assert=require('assert'),EventEmitter=require('events');
const {boot,env,run}=require('./app_test_harness');
const {Pulse,Navigation,scale}=require('../../apps/ixpulse/model');
const {createCollector}=require('../../apps/ixpulse/telemetry');
const {createProjection,placement}=require('../../apps/ixpulse/projection');
const {ClusterRender}=require('../../apps/ixpulse/cluster_render_client');
const {createReader}=require('../../apps/ixpulse/navigation');
const Draw=require('../../apps/ixpulse/draw');
const spec=require('../../apps/ixpulse/app.json');
const T=Date.UTC(2026,10,11),checks=[],test=(n,f)=>checks.push([n,f]);
const reply=(did,bytes)=>[0x62,parseInt(did,16)>>8,parseInt(did,16)&255].concat(bytes);
test('fresh synchronized power, unknown values and movement distinguish recovery from charging',()=>{
    const m=new Pulse();assert.strictEqual(m.snapshot(T).kw,null);
    m.put('hvV',{v:400},T);m.put('hvI',{a:-50},T);m.put('soc',{pct:0},T);
    assert.strictEqual(m.snapshot(T).kw,-20);assert.strictEqual(m.snapshot(T).soc,0);
    assert.strictEqual(m.snapshot(T).flow,'INTO BATTERY');
    m.speed(64*60,T);assert.strictEqual(m.snapshot(T).flow,'REGEN');
    assert.strictEqual(m.snapshot(T+5001).flow,'INTO BATTERY');
    assert.strictEqual(m.snapshot(T+12001).kw,null);assert.strictEqual(m.snapshot(T+30001).soc,null);
    m.put('hvI',{a:20},T+6000);assert.strictEqual(m.snapshot(T+6000).kw,null);
    m.speed(65535,T);assert.strictEqual(m.snapshot(T).kmh,null);
    m.put('hvV',null,T);assert.strictEqual(m.snapshot(T).volts,null);
    assert.strictEqual(scale(-175),200);assert.strictEqual(scale(null),50);
});
test('navigation yields for route calculation, every phone, unknown data and stale inactive flags',()=>{
    const n=new Navigation();assert(n.reason(T));
    const idle=()=>{n.put('state',0,T);n.put('provider','NONE',T);n.put('carplay',false,T);n.put('android',false,T);};
    idle();assert.strictEqual(n.reason(T),'');
    assert(n.reason(T+15001));assert(n.reason(T-1));
    for(const [key,value]of [['state',1],['state','ACTIVE'],['provider',4],['carplay',true],['android',true],['state','UNKNOWN']]){
        idle();n.put(key,value,T);assert(n.reason(T),key);
    }
    n.clear();assert(n.reason(T));
});
test('gear uses explicit selector enums, clears ambiguity, and shows B only with fresh forward position',()=>{
    const m=new Pulse();assert.strictEqual(m.snapshot(T).gear,null);
    for(const [raw,want]of [[1,'P'],[2,'R'],[3,'N'],[4,'D'],['P','P'],['R','R'],['N','N'],['D','D']]){
        m.gear({statusActualStageDrive:raw},'stage',T);assert.strictEqual(m.snapshot(T).gear,want);
    }
    for(const [raw,want]of [[1,'N'],[2,'R'],[3,'P'],[5,'D'],[13,'D'],['_1','D'],['_9','D']]){
        m.gear({statusGearSelectionDrive:raw},'selection',T);assert.strictEqual(m.snapshot(T).gear,want);
    }
    for(const raw of [0,5,6,7,'INITIALISIERUNG','SIGNAL_UNBEFUELLT',null,'4',4.5]){
        m.gear({statusActualStageDrive:'D'},'stage',T);
        m.gear({statusActualStageDrive:raw},'stage',T+1);assert.strictEqual(m.snapshot(T+1).gear,null);
    }
    for(const raw of [0,4,15,'NP','SIGNAL_UNGUELTIG','D','_10',null]){
        m.gear({statusActualStageDrive:'P'},'stage',T);
        m.gear({statusGearSelectionDrive:raw},'selection',T+1);assert.strictEqual(m.snapshot(T+1).gear,null);
    }
    m.gear({statusActualStageDrive:'D'},'stage',T);m.gearProgram({displayProgramGearbox:'B_PROGRAMM'},T);
    assert.strictEqual(m.snapshot(T).gear,'B');assert.strictEqual(m.snapshot(T+5001).gear,null);
    m.gear({statusActualStageDrive:'D'},'stage',T+5001);assert.strictEqual(m.snapshot(T+5001).gear,'D','stale B does not survive');
    m.gearProgram({displayProgramGearbox:5},T+5001);assert.strictEqual(m.snapshot(T+5001).gear,'B');
    m.gear({statusActualStageDrive:'R'},'stage',T+5002);assert.strictEqual(m.snapshot(T+5002).gear,'R','reverse overrides B programme');
    m.gearProgram({displayProgramGearbox:7},T+5003);m.gear({statusActualStageDrive:'D'},'stage',T+5003);assert.strictEqual(m.snapshot(T+5003).gear,'D');
    m.clear();m.speed(60*64,T+6000);assert.strictEqual(m.snapshot(T+6000).gear,null,'movement cannot imply D');
});
test('reported limits require explicit validity, sign certainty, units and freshness',()=>{
    const m=new Pulse(),sign={invalidFlag:0,displaySymbolStyle:0,displaySpeedLimitSupplemental:0,displaySpeedLimitUnit:1,displaySpeedLimit:60};
    m.speedLimit(sign,T);assert.deepStrictEqual(m.snapshot(T).limit,{value:60,unit:'mph'});
    assert.strictEqual(m.snapshot(T+15001).limit,null);assert.strictEqual(m.snapshot(T-1).limit,null);
    m.speedLimit(Object.assign({},sign,{displaySpeedLimitUnit:'KM_H',displaySpeedLimit:100}),T);
    assert.deepStrictEqual(m.snapshot(T).limit,{value:100,unit:'km/h'});
    for(const delta of [{invalidFlag:1},{invalidFlag:undefined},{displaySpeedLimitUnit:2},{displaySpeedLimitUnit:undefined},
        {displaySymbolStyle:1},{displaySymbolStyle:'ECE_UNSURE'},{displaySpeedLimitSupplemental:2},
        {displaySpeedLimit:0},{displaySpeedLimit:254},{displaySpeedLimit:255},{displaySpeedLimit:'60'}]){
        m.speedLimit(Object.assign({},sign,delta),T);assert.strictEqual(m.snapshot(T).limit,null,JSON.stringify(delta));
    }
    m.speedLimit(null,T);assert.strictEqual(m.snapshot(T).limit,null);m.speedLimit(sign,T);m.clear();assert.strictEqual(m.snapshot(T).limit,null);
});
test('electric range requires the car distance unit, expires, and rejects sentinel values',()=>{
    const m=new Pulse();m.range({displayRangeElectricVehicle:180},T);assert.strictEqual(m.snapshot(T).rangeKm,null);
    m.distanceUnit({unitOfMeasurementMileage:'MEILEN'},T);assert(Math.abs(m.snapshot(T).rangeKm-289.68192)<1e-7);
    assert.strictEqual(m.snapshot(T+30001).rangeKm,null);
    m.distanceUnit({unitOfMeasurementMileage:1},T+1);assert.strictEqual(m.snapshot(T+1).rangeKm,null,'unit change invalidates old number');
    m.range({displayRangeElectricVehicle:300},T+2);assert.strictEqual(m.snapshot(T+2).rangeKm,300);
    for(const v of [4093,4094,4095,-1,null,'300']){m.range({displayRangeElectricVehicle:v},T+3);assert.strictEqual(m.snapshot(T+3).rangeKm,null);}
    m.range({displayRangeElectricVehicle:0},T+4);assert.strictEqual(m.snapshot(T+4).rangeKm,0);
    m.distanceUnit({unitOfMeasurementMileage:3},T+5);assert.strictEqual(m.snapshot(T+5).rangeKm,null);
});
test('observed average matches energy and distance, includes regen, excludes gaps and resets',()=>{
    const m=new Pulse(),sample=(t,kw,speed)=>{
        m.speed(speed*64,t);m.put('hvV',{v:400},t);m.put('hvI',{a:kw*2.5},t);m.observe(t);
    };
    for(let i=0;i<=12;i++)sample(T+i*5000,18,60);
    assert(Math.abs(m.snapshot(T+60000).averageKwh100Km-30)<1e-8);
    const energy=m.energy,distance=m.distance;m.observe(T+60000);assert.strictEqual(m.energy,energy);assert.strictEqual(m.distance,distance);
    sample(T+65000,-18,60);sample(T+70000,-18,60);assert(m.energy<energy);assert(m.snapshot(T+70000).averageKwh100Km<30);
    m.put('hvV',null,T+71000);const before=m.distance;sample(T+75000,18,60);assert.strictEqual(m.distance,before);
    assert(m.snapshot(T+75000).averagePartial);sample(T+100000,18,60);assert.strictEqual(m.distance,before);
    sample(T+105000,-18,0);assert.strictEqual(m.distance,before,'charging is excluded');
    m.resetAverage();assert.strictEqual(m.snapshot(T+105000).averageKwh100Km,null);assert.strictEqual(m.energy,0);
    sample(T+110000,18,60);m.resetAverage();m.observe(T+110001);assert.strictEqual(m.previous,null,'reset cannot reuse a pre-reset power sample');
    sample(T+115000,18,60);assert.strictEqual(m.distance,0);
});
const turn={intersection:{direction:'LEFT',formattedDistance:{distance:'300',unit:'YARD'},description:{elements:[{text:'Station Road'}]}}};
const events=items=>({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:items}]});
function route(n,phone,now){n.put('state',phone?0:2,now);n.put('provider',phone?'CAR_PLAY':'NONE',now);n.put('carplay',phone,now);n.put('android',false,now);}
test('BMW and phone directions obey source, route lifecycle, freshness and safe HUD handoff',()=>{
    const n=new Navigation();route(n,false,T);assert.strictEqual(n.view(T).hudReason,'');
    n.dart({maneuver:turn},T,n.epoch);assert.strictEqual(n.view(T).turn.text,'Turn left');assert.strictEqual(n.view(T).turn.distance,'300 yd');
    assert(n.view(T+3001).hudReason);n.dart({maneuver:turn},T+3002,n.epoch);
    assert(n.view(T+3002).turn);assert(n.view(T+3002).hudReason,'once handed back, HUD stays out for the route');
    n.put('state',0,T+4000);assert.strictEqual(n.view(T+4000).turn,null);assert.strictEqual(n.view(T+4000).hudReason,'');
    route(n,true,T+5000);const old=n.epoch;n.events(events([turn]),T+5000,old);assert(n.view(T+5000).turn);
    n.changed(T+5500);n.events(events([turn]),T+5501,old);assert.strictEqual(n.view(T+5501).turn,null,'reroute discards in-flight turns');
    n.put('carplay',false,T+6000);n.events(events([turn]),T+6001,old);assert.strictEqual(n.view(T+6001).turn,null);
    route(n,true,T+7000);n.events(events([{unknownManeuver:{}},turn]),T+7000,n.epoch);assert.strictEqual(n.view(T+7000).turn,null,'unknown next turn cannot skip ahead');
    n.events(events([{roundabout:{exitNumber:3,formattedDistance:{distance:'100',unit:'METER'}}}]),T+7001,n.epoch);
    assert.strictEqual(n.view(T+7001).turn.text,'Exit 3');
    n.events(events([{intersection:Object.assign({},turn.intersection,{unreliable:true})}]),T+7002,n.epoch);assert.strictEqual(n.view(T+7002).turn,null);
    n.clear();assert.strictEqual(n.view(T+7003).turn,null);
});
test('phone navigation reader bounds requests and discards replies across route and demo changes',async()=>{
    const n=new Navigation();let now=T,enabled=true,calls=0,release,closed=0;
    route(n,true,now);
    const signals={proxy:async()=>({shutdown(){closed++;}}),call:async(p,method,args)=>{
        calls++;assert.strictEqual(method,'queryContent');assert.strictEqual(args.viewConfigs[0].viewport.maxElementCount,6);
        return events([turn]);
    }};
    const r=createReader(signals,n,()=>enabled,()=>now);await r.poll();assert.strictEqual(calls,1);assert(n.view(now).turn);
    await r.poll();assert.strictEqual(calls,1);now+=1000;
    signals.call=()=>new Promise(resolve=>{calls++;release=resolve;});const pending=r.poll();await Promise.resolve();await r.poll();assert.strictEqual(calls,2);
    enabled=false;n.clear();release(events([turn]));await pending;assert.strictEqual(n.view(now).turn,null);
    now+=1000;await r.poll();assert.strictEqual(calls,2);r.stop();assert.strictEqual(closed,1);
});
test('collector stays read-only, bounded and parked; late replies cannot leak across demo',async()=>{
    let now=T,enabled=true,calls=0,release;
    const m=new Pulse(),config={ecu:7,powerSign:-1,groups:{hvV:[spec.config.groups.hvV[0]],hvI:spec.config.groups.hvI}};
    const diag={available:true,physical:async(ecu,sid,bytes)=>{
        calls++;assert.strictEqual(ecu,7);assert.strictEqual(sid,0x22);
        return bytes[1]===0xb4?reply('DDB4',[0x9c,0x40]):reply('DD69',[255,255,0xf8,0x30]);
    }};
    const c=createCollector({diag,config,model:m,enabled:()=>enabled,clock:()=>now});
    await c.poll();assert.strictEqual(calls,2);assert.strictEqual(m.snapshot(now).kw,8);
    await c.poll();assert.strictEqual(calls,2);
    now+=601000;await c.poll();assert.strictEqual(calls,2);
    c.motion(64*30);await c.poll();assert.strictEqual(calls,4);
    now+=181000;await c.poll();assert.strictEqual(calls,4);
    c.touch();diag.physical=()=>new Promise(r=>{release=r;});const pending=c.poll();await c.poll();
    enabled=false;c.reset();release(reply('DDB4',[0x9c,0x40]));await pending;
    assert.strictEqual(m.snapshot(now).kw,null);assert.deepStrictEqual(m.readings,{});
});
class FakeClient extends EventEmitter {
    constructor(id){super();this.id=id;this.ready=true;this.backend='id7';this.targets='map:1088x480,panel:1920x720,hud:800x480';this.layers=new Map();this.frames=[];this.next=1;FakeClient.last=this;}
    connect(){} close(){this.closed=true;} image(o){const ref=this.next++;this.layers.set(ref,o);return ref;}
    drop(ref){this.layers.delete(ref);} set(ref,o){Object.assign(this.layers.get(ref),o);} pixels(ref,rects,b){this.frames.push({ref,rects,bytes:b.length});return true;}
}
test('independent image targets, navigation handoff, demo isolation, guard and reconnect cleanup',()=>{
    const opts={};spec.settings.forEach(s=>opts[s.key]=s.default);
    const ctx={spec,settings:{get:k=>opts[k]}};const p=createProjection(ctx,FakeClient);
    const d={kw:28,soc:64,flow:'POWER',kmh:60,demo:false};
    p.update(d,true,'');assert(!FakeClient.last);
    opts.hud='on';opts.cluster='on';p.update(d,true,'');let c=FakeClient.last;
    assert.strictEqual(c.id,'ixpulse');assert.strictEqual(c.layers.size,2);
    assert.deepStrictEqual(Array.from(c.layers.values()).map(l=>l.target),['hud','panel']);
    assert(Array.from(c.layers.values()).every(l=>l.contend===false&&l.exclusive===false&&l.guide_hold===false&&l.fps===2));
    assert.strictEqual(c.frames.length,2);p.update(d,true,'');assert.strictEqual(c.frames.length,2);env.now+=500;
    p.update(Object.assign({},d,{kw:29}),true,'');assert.strictEqual(c.frames.length,4);assert(c.frames[2].rects);
    p.update(d,true,'Yielding to navigation');assert.strictEqual(c.layers.size,1);assert.strictEqual(p.status('hud'),'Yielding to navigation');
    c.emit('disconnected');assert.strictEqual(c.layers.size,0);
    p.update(d,true,'');assert.strictEqual(c.layers.size,2);
    c.emit('target','hud','unavailable','','',false,true);assert.strictEqual(c.layers.size,1);
    p.update(d,true,'');assert.strictEqual(p.status('hud'),'Display guard disabled');
    p.update(Object.assign({},d,{demo:true}),true,'');assert.strictEqual(c.layers.size,0);assert(c.closed);
    p.close();
});
test('patterns need fresh parked speed; wrong backend, missing targets and refusals do not project',()=>{
    const opts={hud:'off',cluster:'test'},ctx={spec,settings:{get:k=>opts[k]}};
    const p=createProjection(ctx,FakeClient),d={kw:null,soc:null,kmh:null,demo:false,flow:'UNAVAILABLE'};
    p.update(d,true,'');assert.strictEqual(p.status('cluster'),'Pattern needs fresh parked speed');
    d.kmh=0;p.update(d,true,'');const c=FakeClient.last;assert.strictEqual(c.layers.size,1);
    c.backend='id8';p.update(d,true,'');assert.strictEqual(c.layers.size,0);
    c.backend='id7';c.targets='hud:800x480';p.update(d,true,'');assert.strictEqual(c.layers.size,0);
    c.targets='panel:1920x720';p.update(d,true,'');const ref=Array.from(c.layers.keys())[0];
    c.emit('refused','layer',ref,'budget');p.update(d,true,'');assert.strictEqual(c.layers.size,0);
    opts.cluster='off';p.update(d,true,'');assert(c.closed);
    opts.cluster='test';p.update(d,true,'');assert.strictEqual(FakeClient.last.layers.size,1);
    p.update(d,false,'');assert(FakeClient.last.closed);p.close();
    const r=placement({get:()=>99999},'hud');assert(r.x+r.w<=800&&r.y+r.h<=480);
});
test('real client encodes transparent image layers, bounded changed rows and drop messages',()=>{
    const c=new ClusterRender('ixpulse'),messages=[];c._write=b=>messages.push(b);
    c.sock={write:b=>{messages.push(b);return true;}};c.connected=true;c.ready=true;
    const ref=c.image({target:'hud',klass:'overlay',w:400,h:130,iw:400,ih:130,exclusive:false,contend:false,guide_hold:false});
    const layer=JSON.parse(messages[0].slice(5));assert.strictEqual(layer.class,'overlay');assert.strictEqual(layer.contend,0);
    c.pixels(ref,null,Buffer.alloc(400*130*4));assert.strictEqual(messages[1][4],0x46);
    c.pixels(ref,[{x:0,y:20,w:400,h:1}],Buffer.alloc(1600));assert.strictEqual(messages[2].readUInt16LE(17),1);
    c.drop(ref);assert.strictEqual(c.layers.size,0);assert.strictEqual(JSON.parse(messages[3].slice(5)).op,'drop');
});
test('speed alone projects; speed, posted limit, units and expiry update the image',()=>{
    const opts={hud:'off',cluster:'on',speedUnit:'mph'},ctx={spec,settings:{get:k=>opts[k]}};
    const p=createProjection(ctx,FakeClient),d={kw:null,soc:null,kmh:80,limit:null,demo:false,flow:'UNAVAILABLE'};
    p.update(d,true,'');const c=FakeClient.last;assert.strictEqual(c.layers.size,1);assert.strictEqual(c.frames.length,1);
    d.kmh=88;p.update(d,true,'');assert.strictEqual(c.frames.length,1,'fast notification does not redraw');
    env.now+=500;p.update(d,true,'');assert.strictEqual(c.frames.length,2);
    d.limit={value:60,unit:'mph'};env.now+=500;p.update(d,true,'');assert.strictEqual(c.frames.length,3);
    opts.speedUnit='kmh';env.now+=500;p.update(d,true,'');assert.strictEqual(c.frames.length,4);
    d.limit=null;env.now+=500;p.update(d,true,'');assert.strictEqual(c.frames.length,5);
    d.kmh=null;p.update(d,true,'');assert.strictEqual(c.layers.size,0);assert(c.closed);p.close();
});
test('gear-only telemetry projects and gear changes or expiry invalidate cached frames',()=>{
    const opts={hud:'on',cluster:'on'},p=createProjection({spec,settings:{get:k=>opts[k]}},FakeClient);
    const d={kw:null,soc:null,kmh:null,rangeKm:null,gear:'P',demo:false,flow:'UNAVAILABLE'};
    p.update(d,true,'');const c=FakeClient.last;assert.strictEqual(c.layers.size,2);assert.strictEqual(c.frames.length,2);
    env.now+=500;d.gear='R';p.update(d,true,'');assert.strictEqual(c.frames.length,4);
    env.now+=500;d.gear=null;d.kmh=0;p.update(d,true,'');assert.strictEqual(c.frames.length,6,'stale gear draws unknown while speed remains');
    d.kmh=null;p.update(d,true,'');assert.strictEqual(c.layers.size,0);p.close();
});
test('layout switches resize only the cluster; changed rows stay within each image and target',()=>{
    const opts={hud:'on',cluster:'on',clusterStyle:'compact'},p=createProjection({spec,settings:{get:k=>opts[k]}},FakeClient);
    const d={kw:28,soc:64,flow:'POWER',kmh:60,gear:'D',demo:false};
    p.update(d,true,'');const c=FakeClient.last,hud=Array.from(c.layers.keys())[0];
    for(const style of ['taycan','horizon','compact','invalid']){
        opts.clusterStyle=style;env.now+=500;p.update(d,true,'');
        assert.strictEqual(c.layers.size,2);assert(c.layers.has(hud),'HUD is not recreated');
        const [ref,l]=Array.from(c.layers.entries()).find(e=>e[1].target==='panel'),dim=Draw.dimensions(style);
        assert.strictEqual(l.iw,dim.w);assert.strictEqual(l.ih,dim.h);
        const frame=c.frames[c.frames.length-1];assert.strictEqual(frame.ref,ref);
        assert(frame.bytes<=dim.w*dim.h*4);
        if(frame.rects)assert(frame.rects.every(r=>r.x+r.w<=dim.w&&r.y+r.h<=dim.h));
        const count=c.frames.length;p.update(d,true,'');assert.strictEqual(c.frames.length,count);
        for(const size of [75,100,125])for(const xy of [-99999,99999]){
            const r=placement({get:k=>({clusterStyle:style,clusterSize:size,clusterX:xy,clusterY:xy})[k]},'cluster');
            assert(r.x>=0&&r.y>=0&&r.x+r.w<=1920&&r.y+r.h<=720);
        }
    }
    p.close();
});
test('all cluster layouts preserve requested data, units, unknowns and transparent image bounds',async()=>{
    const {Canvas}=require('../runtime/canvas');
    const b=await boot('ixpulse',{demo:'on'});await b.ctx.tab(1);
    for(const style of Draw.STYLES){
        b.set('clusterStyle',style);
        for(const unit of ['mph','kmh'])for(const palette of ['colour','white','amber']){
            b.set('speedUnit',unit);b.set('palette',palette);const texts=await b.draw();
            for(const s of ['D','60','Turn left','300 yd',unit==='mph'?'178 mi':'286 km',unit==='mph'?'29.6':'18.4'])
                assert.strictEqual(texts.filter(t=>t===s).length,2,style+' '+s);
            const dim=Draw.dimensions(style),cv=Draw.draw(new Canvas(dim.w,dim.h),{kw:null,soc:null,kmh:null,flow:'UNAVAILABLE'},palette,false,unit,style);
            assert.strictEqual(cv.d.length,dim.w*dim.h*4);assert.strictEqual(cv.d[3],0,'corner stays transparent');
        }
        b.set('demo','off');let texts=await b.draw();assert(!texts.includes('D'));assert(!texts.some(s=>/NaN|Infinity/.test(s)));
        b.set('cluster','test');texts=await b.draw();assert(texts.includes('PARKED ONLY'));
        b.set('cluster','off');b.set('demo','on');
    }
    await b.ctx.tab(2);const texts=await b.draw();assert.strictEqual(texts.filter(s=>s==='D').length,2);
    assert(texts.includes('Choose layout and speed typeface in Settings'));b.exit();
});
test('font choices retain complete speed digits, equal digit spacing and refresh both projections',()=>{
    const Type=require('../../apps/ixpulse/typography'),fonts=require('../runtime/fonts');
    const {Canvas}=require('../runtime/canvas'),{Recorder,play}=require('../runtime/record');
    for(const choice of ['barlow','michroma','original']){
        for(const speed of ['0','88','188','--']){
            const cv=new Canvas(220,100),rec=new Recorder(220,100);
            Type.speed(cv,speed,10,80,76,'#ffffff','left',96,choice);
            Type.speed(rec,speed,10,80,76,'#ffffff','left',96,choice);
            const replay=new Canvas(220,100);play(rec.words(),replay);
            assert(cv.d.some(v=>v),'font draws ink');
            let error=0,maxError=0;
            // Recorder stores float32 coordinates; allow one alpha step at an
            // antialiased edge rather than comparing RGB of transparent pixels.
            for(let i=3;i<cv.d.length;i+=4){const delta=Math.abs(cv.d[i]-replay.d[i]);error+=delta;maxError=Math.max(maxError,delta);}
            assert(error<cv.w*cv.h/10&&maxError<=1,'software and recorded glyphs agree: '+choice+' '+speed);
            for(let y=0;y<100;y++)for(let x=110;x<220;x++)assert.strictEqual(cv.d[(y*220+x)*4+3],0,'speed stays inside reserved box');
            if(choice!=='original'){
                const f=fonts.get(Type.family(choice),76);
                assert.strictEqual(fonts.measure(f,'111'),fonts.measure(f,'888'),'digits do not shift horizontally');
            }
        }
    }
    const opts={hud:'on',cluster:'on',clusterStyle:'taycan',typeface:'barlow'};
    const p=createProjection({spec,settings:{get:k=>opts[k]}},FakeClient),d={kmh:88,kw:null,soc:null,flow:'UNAVAILABLE'};
    p.update(d,true,'');const c=FakeClient.last,refs=Array.from(c.layers.keys());
    env.now+=500;opts.typeface='michroma';p.update(d,true,'');
    assert.strictEqual(c.frames.length,4);assert.deepStrictEqual(Array.from(c.layers.keys()),refs);
    p.close();
});
test('main pages render demo and missing data; defaults and all subscriptions preserve read-only gates',async()=>{
    env.now=T;const b=await boot('ixpulse');let texts=await b.draw();assert(texts.includes('WAITING FOR CAR'));assert(texts.includes('--'));
    b.set('demo','on');texts=await b.draw();assert(texts.includes('DEMO'));assert(texts.includes('26.5 °C'));
    b.set('tempUnit','f');texts=await b.draw();assert(texts.includes('79.7 °F'));
    await b.clicks.BTN_PAGE();texts=await b.draw();assert.strictEqual(texts.filter(s=>s==='IN').length,2);assert(texts.includes('BMW guidance takes over if directions are unavailable'));
    assert.strictEqual(texts.filter(s=>s==='178 mi').length,2);assert.strictEqual(texts.filter(s=>s==='29.6').length,2);
    assert.strictEqual(texts.filter(s=>s==='Turn left').length,2);assert.strictEqual(texts.filter(s=>s==='300 yd').length,2);
    assert.strictEqual(texts.filter(s=>s==='D').length,2,'demo gear appears on both projections');
    assert.strictEqual(texts.filter(s=>s==='55').length,2);assert.strictEqual(texts.filter(s=>s==='60').length,2);
    b.set('speedUnit','kmh');texts=await b.draw();assert.strictEqual(texts.filter(s=>s==='88').length,2);
    assert.strictEqual(texts.filter(s=>s==='286 km').length,2);assert.strictEqual(texts.filter(s=>s==='18.4').length,2);
    assert.strictEqual(texts.filter(s=>s==='60').length,2,'posted mph limit is not converted by speed preference');
    b.set('demo','off');texts=await b.draw();assert(!texts.includes('D'),'demo gear cannot leak into live output');assert(!texts.some(s=>/NaN|Infinity/.test(s)));b.exit();
    for(const k of ['hud','cluster','demo'])assert.strictEqual(spec.settings.find(s=>s.key===k).default,'off');
    for(const fields of Object.values(spec.signals))for(const [k,v]of Object.entries(fields))if(!k.startsWith('_'))assert(!v.includes('w'));
});
run(checks);
