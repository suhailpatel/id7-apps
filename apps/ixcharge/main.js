'use strict';
/** iXCharge: independent read-only charging dashboard for iDrive 7. */
const fs=require('fs'),path=require('path'),mgu=require('./kit/mgu'),G=require('./kit/gauges');
const {Diag}=require('./kit/diag'),{ChargeModel}=require('./model'),{createCollector}=require('./telemetry');
const {demoHistory}=require('./history'),{importLegacy}=require('./legacy'),createViews=require('./views');
mgu.run({async start(ctx) {
    const {settings,log}=ctx,cfg=ctx.spec.config,file=path.join(ctx.dataDir,'charging.json');
    let st={};try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data&&typeof data==='object'&&!Array.isArray(data))st=data;}catch(_){}
    const model=new ChargeModel(st,cfg),diag=new Diag(ctx.signals,log);
    const usingDemo=()=>settings.get('demo')==='on';
    let saved=JSON.stringify(st),savedAt=Date.now(),page=0;
    function save() {
        if(usingDemo())return;
        const data=JSON.stringify(st);if(data===saved)return;
        try{fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);saved=data;savedAt=Date.now();}catch(e){log.warn('save: '+e);}
    }
    const collector=createCollector({diag,config:cfg,model,enabled:()=>!usingDemo()});
    const sourceId=cfg.legacySource||'ixdrive',legacyFile='/tmp/mgu-'+sourceId+'-legacy-charges.json';
    function migrate() {
        if(usingDemo()||st.legacyImported)return;
        try{if(fs.statSync(legacyFile).size>2000000)return;
            if(importLegacy(st,JSON.parse(fs.readFileSync(legacyFile,'utf8')),sourceId,Date.now()))save();
        }catch(_){}
    }
    async function poll() {
        if(usingDemo())return;
        const charge=st.charge,session=st.session,logCount=st.log.length;
        await collector.poll();
        if(usingDemo())return;
        model.history.tick(Date.now());migrate();
        if(charge!==st.charge||session!==st.session||logCount!==st.log.length||Date.now()-savedAt>=30000)save();
    }
    diag.quiet=true;diag.on('available',available=>{if(available)poll();});diag.init();
    ctx.signals.watch('de.bmw.infotainment.vehicle.Vehicle2','1',{statusCarSpeed2:v=>{
        if(usingDemo())return;
        const raw=v&&v.speedVehicleCentreOfGravity;collector.motion(raw);model.motion(raw,Date.now());
    }},log);
    const timer=setInterval(poll,5000);if(timer.unref)timer.unref();
    process.on('exit',save);
    const views=createViews(settings,cfg,render);
    const act=fn=>()=>{collector.touch();fn();poll();return render();};
    ctx.ui.onClick('BTN_PAGE',act(()=>page=(page+1)%3));
    ctx.ui.onClick('BTN_PREV',act(()=>page=(page+2)%3));
    ctx.ui.onClick('BTN_READ',act(()=>{if(page)views.browse(page===1?'log':'lab',page===1?8:1);}));
    ctx.onTab(i=>act(()=>page=G.clamp(i,0,2))());
    ctx.onScroll(dy=>{if(!page)return false;collector.touch();views.browse(page===1?'log':'lab',Math.sign(dy)*(page===1?8:1));return true;});
    ctx.ui.onVisible((name,visible)=>{if(name==='MAIN'&&visible){collector.touch();poll();}});
    settings.onChange(key=>{
        collector.touch();
        if(key==='demo')collector.reset();
        poll();render();
    });
    function render() {
        const now=Date.now(),demo=usingDemo();
        const d=demo?{soc:64,kw:-45,speed:0,temp:27,capacity:67.71,source:'demo',history:demoHistory(now)}
            :Object.assign(model.snapshot(now),{history:st});
        const t=ctx.theme(),cv=ctx.canvas(1600,520).clear(t.bg);
        G.frame(cv,t,['Charging','Charge log','Charge lab'],page,[{text:demo?'DEMO':!collector.active()?'PAUSED':G.isNum(d.soc)?'CANDIDATE DATA':'WAITING FOR CAR',color:demo?t.warn:t.dim}]);
        views.draw(page,cv,t,d);
        if(ctx.ui.text)ctx.ui.text('BTN_READ',page===1?'Older charges':page===2?'Older session':'Read now');
        return ctx.ui.image('MAIN_GFX',cv);
    }
    migrate();ctx.loop('MAIN',2,render);await render();
}});
