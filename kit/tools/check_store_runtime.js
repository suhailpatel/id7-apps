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
const Recorder=require(path.join(kit,'record')).Recorder;
const ctx={spec,dataDir,
    settings:{get:k=>opts[k],onChange:fn=>changes.push(fn),item:k=>spec.settings.find(s=>s.key===k)||null,
        set(k,v){opts[k]=v;changes.forEach(fn=>fn(k));}},
    log:{info(){},warn(){},error(){}},
    signals:{watch:async()=>({available:false}),proxy:async()=>{throw new Error('no SOME/IP');},on:async()=>{},onAvailable:async()=>{},call:async()=>{throw new Error('no SOME/IP');}},
    ui:{onClick:(key,fn)=>{clicks[key]=fn;},onVisible(){},text(){},image:async()=>{}},
    hideButton(){},onTab(fn){this.tab=fn;},onLayout(){},onScroll(){},loop(name,fps,fn){this.frame=fn;},
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
        const count=2;
        for(let i=0;i<count;i++){
            texts.length=0;
            if(ctx.tab)await ctx.tab(i);
            await ctx.frame();
            assert(texts.length>0,'page drew text');
            assert(!texts.some(s=>/NaN|Infinity/.test(s)),'finite display values');
        }
    }
    // iX Cluster: its shared decoder (Node 8 has no modern Object API) and the EV readouts it draws with
    if(/ixcluster\d*$/.test(spec.id)){
        const {decode}=require(path.join(source,'javascript/decode'));
        assert.deepStrictEqual(decode([0x62,0x12,0x34,10],{did:'1234',fields:{t:{at:0}}}),{t:10});
    }
    console.log('PASS '+spec.id+' packaged pages and transport on '+process.version);
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
