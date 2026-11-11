'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
const ROOT=path.resolve(__dirname,'../..'),KIT=path.join(ROOT,'kit/runtime');
const T=Date.UTC(2026,10,10);
// Run the real entrypoints with the real canvas recorder and fake transport/clock.
const env={now:T,shared:null};
let timers=[],app;
const originalNow=Date.now,originalInterval=global.setInterval;
Date.now=()=>env.now;global.setInterval=(fn,ms)=>{timers.push({fn,ms});return 0;};
const load=Module._load;
Module._load=function(req,parent,isMain){
    if(req==='./kit/mgu')return {run:a=>{app=a;}};
    if(req.startsWith('./kit/'))return load.call(this,path.join(KIT,req.slice(6)),parent,isMain);
    if(req==='fs' && parent && /apps[/\\](tyrewatch|tripcapsule|ixcharge)/.test(parent.filename))return Object.assign({},fs,{
        statSync:p=>(p==='/tmp/mgu-ixdrive-trips.json'||p==='/tmp/mgu-ixdrive-legacy-charges.json')?{size:env.shared?JSON.stringify(env.shared).length:0}:fs.statSync(p),
        readFileSync:(p,...args)=>(p==='/tmp/mgu-ixdrive-trips.json'||p==='/tmp/mgu-ixdrive-legacy-charges.json')?JSON.stringify(env.shared):fs.readFileSync(p,...args)
    });
    return load.call(this,req,parent,isMain);
};
const dirs=[];
async function boot(id,settings={},dir) {
    timers=[];const file=path.join(ROOT,'apps',id,'main.js');delete require.cache[file];require(file);
    const spec=require(path.join(ROOT,'apps',id,'app.json')),opts=Object.fromEntries(spec.settings.map(s=>[s.key,s.default]));Object.assign(opts,settings);
    dir=dir||fs.mkdtempSync(path.join(os.tmpdir(),id+'-test-'));dirs.push(dir);
    const clicks={},watchers={},changes=[],texts=[],requests=[],subscriptions={};
    const {Recorder}=require(path.join(KIT,'record'));
    const ctx={spec,dataDir:dir,settings:{get:k=>opts[k],onChange:fn=>changes.push(fn)},
        log:{info(){},warn(){}},theme:()=>require(path.join(KIT,'themes')).theme('ice'),
        canvas:(w,h)=>{texts.length=0;const cv=new Recorder(w,h);cv.own=true;const text=cv.text.bind(cv);cv.text=(s,...args)=>{texts.push(String(s));return text(s,...args);};return cv;},
        ui:{onClick:(k,fn)=>clicks[k]=fn,onVisible:fn=>ctx.visible=fn,image:async()=>{}},
        signals:{watch:async(iface,version,h,log,opts)=>{
            Object.assign(watchers,h);
            const sub={available:true,proxy:{getValue:async f=>{requests.push(f);return {};}}};
            subscriptions[iface]={sub,opts};return sub;
        }},
        onTab:fn=>ctx.tab=fn,onScroll:fn=>ctx.scroll=fn,loop:(name,fps,fn)=>ctx.frame=fn};
    const before=process.listeners('exit');await app.start(ctx);
    const exits=process.listeners('exit').filter(fn=>!before.includes(fn));exits.forEach(fn=>process.removeListener('exit',fn));
    return {dir,clicks,watchers,requests,subscriptions,ctx,texts,timers:timers.slice(),draw:async()=>{await ctx.frame();return texts;},
        set:(k,v)=>{opts[k]=v;changes.forEach(fn=>fn(k));},exit:()=>exits.forEach(fn=>fn())};
}
async function run(checks) {let fail=0;for(const [name,fn]of checks){try{await fn();console.log('PASS '+name);}catch(e){fail++;console.error('FAIL '+name+'\n'+e.stack);}}
    Module._load=load;Date.now=originalNow;global.setInterval=originalInterval;
    for(const dir of new Set(dirs))fs.rmSync(dir,{recursive:true,force:true});process.exitCode=fail?1:0;
}
module.exports={boot,env,run};
