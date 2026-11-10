'use strict';
const fs = require('fs'), path = require('path');
const mgu = require('./kit/mgu'), G = require('./kit/gauges');
const {Tyres,WHEELS,NAMES,demo} = require('./model');
const TPMS = 'de.bmw.infotainment.vehicle.TPMS';
const VEHICLE = 'de.bmw.infotainment.vehicle.Vehicle';
const FIELDS = {statusTyrePressure:'p',statusTyreTemperature:'temp',statusTargetTyrePressure:'target'};
mgu.run({async start(ctx) {
    const file = path.join(ctx.dataDir,'tyres.json');
    let state = {};
    try { const s=JSON.parse(fs.readFileSync(file,'utf8')); if(s && typeof s==='object' && !Array.isArray(s)) state=s; } catch (_) {}
    const model = new Tyres(state);
    let page=0, wheel=0, offset=0, touch=Date.now(), moved=0, saved='', saveT=0, fetching=false;
    const isDemo=()=>ctx.settings.get('demo')==='on';
    const active=()=>Date.now()-touch<600000 || Date.now()-moved<180000;
    const save=()=>{
        const data=JSON.stringify(state); if(data===saved) return;
        try { fs.writeFileSync(file+'.tmp',data); fs.renameSync(file+'.tmp',file); saved=data; saveT=Date.now(); }
        catch(e) { ctx.log.warn('Tyre history: '+e.message); }
    };
    process.on('exit',save);
    const handlers={};
    Object.entries(FIELDS).forEach(([field,kind])=>handlers[field]=v=>{
        if(isDemo()) return;
        model.receive(kind,v,Date.now()); if(model.capture(Date.now())) save();
    });
    const watchers=[];
    const watch=(iface,h)=>ctx.signals.watch(iface,'1',h,ctx.log).then(sub=>{watchers.push({sub,h,iface});});
    await Promise.all([
        watch(TPMS,handlers),
        watch(VEHICLE,{statusNewCurrentUnitsStatusExt:v=>{if(!isDemo()) model.setUnits(v);}}),
        watch('de.bmw.infotainment.vehicle.Vehicle2',{statusCarSpeed2:v=>{
            if(isDemo()) return;
            const raw=v && v.speedVehicleCentreOfGravity;
            model.motion(typeof raw==='number' && raw<65535 ? raw*.015625 : null,Date.now());
            if(model.speed>1) moved=Date.now();
            if(model.capture(Date.now()) || Date.now()-saveT>60000) save();
        }}),
        watch('de.bmw.infrastructure.EnvironmentalInformation',{ExteriorTemperature:v=>{if(!isDemo()) model.outside(v && v.temperatureExterior,Date.now());}})
    ]);
    // Only read while recently driven or used; no writes or diagnostic sessions.
    async function refresh() {
        if(fetching || isDemo() || !active()) return;
        fetching=true;
        try {
            // Units first, so a changed unit invalidates old readings before fetching replacements.
            for(const iface of [VEHICLE,TPMS]) {
                const entry=watchers.find(w=>w.iface===iface);
                if(!entry || !entry.sub.available || !entry.sub.proxy) continue;
                await Promise.all(Object.entries(entry.h).map(async ([f,fn])=>{
                    try {const v=await entry.sub.proxy.getValue(f,3000); if(!isDemo() && active()) fn(v);} catch(_) {}
                }));
            }
        } finally { fetching=false; }
    }
    const timer=setInterval(refresh,10000);
    if(timer.unref) timer.unref();
    const act=fn=>()=>{touch=Date.now();fn();refresh();return render();};
    const rows=()=> (isDemo()?demo(Date.now()):model).state.history.filter(p=>p.wheel===WHEELS[wheel]).slice().reverse();
    const browse=step=>{offset=G.clamp(offset+step,0,Math.max(0,rows().length-1));};
    ctx.ui.onClick('BTN_PAGE',act(()=>{page=1-page;offset=0;}));
    ctx.ui.onClick('BTN_WHEEL',act(()=>{wheel=(wheel+1)%4;offset=0;page=1;}));
    ctx.ui.onClick('BTN_OLDER',act(()=>{page=1;browse(7);}));
    ctx.ui.onClick('BTN_NEWER',act(()=>{page=1;browse(-7);}));
    ctx.onTab(i=>act(()=>{page=i;offset=0;})());
    ctx.onScroll(dy=>{if(page!==1)return false;act(()=>browse(Math.sign(dy)))();return true;});
    ctx.ui.onVisible((name,visible)=>{if(name==='MAIN' && visible){touch=Date.now();refresh();}});
    ctx.settings.onChange(k=>{touch=Date.now();if(k==='demo'){model.reset();offset=0;}refresh();render();});
    const fmt=(v,n=1)=>G.isNum(v)?v.toFixed(n):'--';
    const pu=()=>ctx.settings.get('pressureUnit')||'bar';
    const P=v=>G.isNum(v)?v*({bar:1,psi:14.5037738,kPa:100}[pu()]):null;
    const pressureText=v=>fmt(P(v),pu()==='bar'?2:1)+' '+pu();
    const tempText=v=>fmt(G.isNum(v)?(ctx.settings.get('tempUnit')==='f'?v*1.8+32:v):null,0)+(ctx.settings.get('tempUnit')==='f'?' °F':' °C');
    function render() {
        const t=ctx.theme(),cv=ctx.canvas(1600,520).clear(t.bg),now=Date.now(),m=isDemo()?demo(now):model;
        G.frame(cv,t,['Tyres','Cool history'],page,isDemo()?[{text:'DEMO'}]:[]);
        if(page===0) {
            const pos=[[24,44],[1000,44],[24,280],[1000,280]];
            WHEELS.forEach((w,i)=>{
                const [x,y]=pos[i],v=m.wheel(w,now),trend=m.trend(w);
                const low=G.isNum(v.delta)&&v.delta<-.2;
                G.panel(cv,t,x,y,576,228,NAMES[i]);
                cv.text(pressureText(v.p),x+24,y+108,58,low?t.warn:t.text,{font:'num'});
                cv.text(tempText(v.temp),x+550,y+108,30,t.dim,{align:'right'});
                cv.text('Car target  '+pressureText(v.target),x+24,y+155,23,t.dim);
                cv.text(G.isNum(v.delta)?(v.delta>=0?'+':'')+pressureText(v.delta)+' vs target':'Target comparison unavailable',x+24,y+194,22,low?t.warn:t.dim);
                if(trend && trend.falling) cv.text('FALLING',x+550,y+36,18,t.warn,{align:'right',font:'bold'});
            });
            // Car silhouette; wheel colours report data availability and target difference only.
            cv.strokeRoundRect(708,97,184,326,56,3,t.dim);
            cv.strokeRoundRect(730,151,140,169,28,2,t.tick);
            cv.line(738,192,862,192,2,t.tick); cv.line(738,286,862,286,2,t.tick);
            [[681,135],[899,135],[681,339],[899,339]].forEach(([x,y],i)=>{
                const v=m.wheel(WHEELS[i],now);
                cv.roundRect(x,y,20,58,6,!G.isNum(v.p)?t.tick:G.isNum(v.delta)&&v.delta<-.2?t.warn:t.accent);
            });
            cv.text('FRONT',800,78,18,t.dim,{align:'center'});
            cv.text('TYREWATCH',800,466,23,t.text,{align:'center',font:'bold'});
            cv.text('Live readings · 30s expiry',800,496,16,t.dim,{align:'center'});
        } else {
            G.panel(cv,t,24,44,960,468,NAMES[wheel]+' · cool snapshots');
            WHEELS.forEach((w,i)=>G.button(cv,t,390+i*138,54,124,38,w,act(()=>{wheel=i;offset=0;}),{key:'wheel-'+w,primary:i===wheel}));
            const list=m.state.history.filter(p=>p.wheel===WHEELS[wheel]).slice().reverse();
            offset=G.clamp(offset,0,Math.max(0,list.length-1));cv.scroll=list.length>7;
            ['DATE','PRESSURE','TEMPERATURE','CAR TARGET'].forEach((s,i)=>cv.text(s,[48,275,497,748][i],128,18,t.dim,{font:'bold'}));
            list.slice(offset,offset+7).forEach((p,i)=>{
                const y=176+i*39;
                [new Date(p.t).toISOString().slice(0,10),pressureText(p.p),tempText(p.temp),pressureText(p.target)].forEach((s,k)=>cv.text(s,[48,275,497,748][k],y,24,t.text));
            });
            if(!list.length) cv.text('Cool readings will appear here.',504,280,28,t.dim,{align:'center'});
            G.button(cv,t,48,452,150,38,'Newer',act(()=>browse(-7)),{key:'newer',busy:offset===0});
            G.button(cv,t,218,452,150,38,'Older',act(()=>browse(7)),{key:'older',busy:offset+7>=list.length});
            cv.text(list.length+' snapshots · up to 90 days',956,480,20,t.dim,{align:'right'});
            G.panel(cv,t,1008,44,568,468,'Pressure trend');
            const tr=m.trend(WHEELS[wheel]);
            cv.text(tr?(tr.delta>=0?'+':'')+pressureText(tr.delta):'--',1032,190,62,tr && tr.falling?t.warn:t.text,{font:'num'});
            cv.text(tr?tr.days+' days · '+tr.count+' comparable readings':'Waiting for comparable readings',1032,237,23,t.dim);
            cv.text(tr&&tr.falling?'Falling pressure trend':'Cool readings only',1032,302,28,t.text,{font:'bold'});
            ['At least 3 hours since observed movement,','stationary and within 5 °C of outside air.','Trend compares temperatures within 3 °C.','This does not diagnose a leak.'].forEach((s,i)=>cv.text(s,1032,350+i*35,21,t.dim));
        }
        return ctx.ui.image('MAIN_GFX',cv);
    }
    ctx.loop('MAIN',2,render);await render();
}});
