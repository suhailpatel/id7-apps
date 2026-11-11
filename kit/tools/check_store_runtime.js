'use strict';
// Run a staged Store edition with Node 8 (or newer), without a car or SDK.
// Usage: node check_store_runtime.js <staged source/> <temporary data directory>
const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const source=path.resolve(process.argv[2]),dataDir=path.resolve(process.argv[3]);
const spec=require(path.join(source,'javascript/kit/app-spec.json'));
const kit=path.join(source,'javascript/kit');
const shared={},timers=[],changes=[],clicks={},texts=[];
let app;
const load=Module._load;
const isShared=p=>typeof p==='string' && /^\/tmp\/mgu-.*\.json/.test(p);
const fakeFs=Object.assign({},fs,{
    writeFileSync(p,data,opts){if(isShared(p))shared[p]=String(data);else fs.writeFileSync(p,data,opts);},
    readFileSync(p,opts){if(isShared(p)){if(!shared[p])throw new Error('No shared data');return shared[p];}return fs.readFileSync(p,opts);},
    statSync(p){return isShared(p)?{size:shared[p]?shared[p].length:0}:fs.statSync(p);},
    chmodSync(p,mode){if(!isShared(p))fs.chmodSync(p,mode);},
    renameSync(a,b){if(isShared(a)){shared[b]=shared[a];delete shared[a];}else fs.renameSync(a,b);}
});
Module._load=function(req,parent,main){
    if(req==='./kit/mgu')return {run:a=>{app=a;}};
    if(req==='fs')return fakeFs;
    return load.call(this,req,parent,main);
};
global.setInterval=(fn,ms)=>{timers.push({fn,ms});return {unref(){}};};
global.setTimeout=()=>({unref(){}});
const opts={};spec.settings.forEach(s=>{opts[s.key]=s.default;});
if(/ixdrive\d*$/.test(spec.id))opts.diagPage=true;
const Recorder=require(path.join(kit,'record')).Recorder;
const ctx={spec,dataDir,
    settings:{get:k=>opts[k],onChange:fn=>changes.push(fn)},
    log:{info(){},warn(){},error(){}},
    signals:{watch:async()=>({available:false})},
    ui:{onClick:(key,fn)=>{clicks[key]=fn;},onVisible(){},text(){},image:async()=>{}},
    hideButton(){},onTab(fn){this.tab=fn;},onScroll(){},loop(name,fps,fn){this.frame=fn;},
    theme:()=>require(path.join(kit,'themes')).theme('ice'),
    canvas(w,h){const cv=new Recorder(w,h),text=cv.text.bind(cv);cv.own=true;
        cv.text=(s,...rest)=>{texts.push(String(s));return text(s,...rest);};return cv;}
};
async function main(){
    require(path.join(source,'javascript/app.js'));
    const before=process.listeners('exit');
    await app.start(ctx);
    process.listeners('exit').filter(fn=>before.indexOf(fn)<0).forEach(fn=>process.removeListener('exit',fn));
    for(const setting of ['off','on']){
        opts.demo=setting;changes.forEach(fn=>fn('demo'));
        // Exercise every page and its drawing helpers, not only module parsing.
        const count=/ixdrive\d*$/.test(spec.id)?6:/(ixobservatory|ixcharge|ixservice)\d*$/.test(spec.id)?3:2;
        for(let i=0;i<count;i++){
            texts.length=0;
            if(ctx.tab)await ctx.tab(i);
            await ctx.frame();
            assert(texts.length>0,'page drew text');
            assert(!texts.some(s=>/NaN|Infinity/.test(s)),'finite display values');
        }
    }
    if(/ixdrive\d*$/.test(spec.id)){
        const name='/tmp/mgu-'+spec.id+'-trips.json';
        assert(shared[name],'journey output uses installed ID');
        assert.strictEqual(JSON.parse(shared[name]).sourceId,spec.id);
        assert(!shared['/tmp/mgu-ixdrive-trips.json'],'Store edition leaves developer transport alone');
        const legacy='/tmp/mgu-'+spec.id+'-legacy-charges.json';
        assert.strictEqual(JSON.parse(shared[legacy]).sourceId,spec.id);
        assert(!shared['/tmp/mgu-ixdrive-legacy-charges.json'],'migration also uses installed ID');
        timers.filter(t=>t.ms===5000).forEach(t=>t.fn());
        assert.strictEqual(JSON.parse(shared[name]).demo,true,'demo cannot publish real records');
    }
    if(/tripcapsule\d*$/.test(spec.id)){
        opts.demo='off';changes.forEach(fn=>fn('demo'));
        const sourceId=spec.config.journeySource;
        assert.strictEqual(sourceId,'suhailpatel_ixdrive');
        const packet={version:1,t:Date.now(),source:'ixdrive',sourceId,demo:false,journeys:[]};
        shared['/tmp/mgu-'+sourceId+'-trips.json']=JSON.stringify(packet);
        timers.forEach(t=>t.fn());texts.length=0;await ctx.frame();
        assert(texts.indexOf('IXDRIVE CONNECTED')>=0,'imports correct Store companion');
        packet.sourceId='ixdrive';shared['/tmp/mgu-'+sourceId+'-trips.json']=JSON.stringify(packet);
        timers.forEach(t=>t.fn());texts.length=0;await ctx.frame();
        assert(texts.indexOf('SAVED CARDS')>=0,'rejects other installation identities');
    }
    if(/ixcharge\d*$/.test(spec.id)){
        opts.demo='off';changes.forEach(fn=>fn('demo'));
        const sourceId=spec.config.legacySource,now=Date.now();
        assert.strictEqual(sourceId,'suhailpatel_ixdrive');
        const name='/tmp/mgu-'+sourceId+'-legacy-charges.json';
        shared[name]=JSON.stringify({version:1,source:'ixdrive',sourceId,demo:false,t:now,
            history:{log:[{from:20,to:80,fromT:now-3600000,toT:now,kwh:null}],charges:[]}});
        for(const timer of timers)await timer.fn();
        for(const timer of timers)await timer.fn();
        const saved=JSON.parse(fs.readFileSync(path.join(dataDir,'charging.json'),'utf8'));
        assert.strictEqual(saved.log.length,1,'Store history imports only once');
        assert.strictEqual(saved.log[0].source,sourceId);
        assert.strictEqual(saved.log[0].kwh,null);
        texts.length=0;await ctx.tab(1);await ctx.frame();
        assert(texts.indexOf('Includes imported iXDrive history')>=0);
    }
    // Exercise the real decoder whose modern Object API previously failed on Node 8.
    if(/ixobservatory\d*$/.test(spec.id)){
        const model=require(path.join(source,'javascript/model'));
        assert.deepStrictEqual(model.decode([0x62,0x12,0x34,10],{did:'1234',fields:{t:{at:0}}}),{t:10});
    }
    console.log('PASS '+spec.id+' packaged pages and transport on '+process.version);
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
