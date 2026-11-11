'use strict';
const fs=require('fs'),path=require('path');
const mgu=require('./kit/mgu'),G=require('./kit/gauges');
const {Capsules,demo}=require('./model');
mgu.run({async start(ctx) {
    const sourceId=ctx.spec.config && ctx.spec.config.journeySource || 'ixdrive';
    const SHARED='/tmp/mgu-'+sourceId+'-trips.json';
    const file=path.join(ctx.dataDir,'capsules.json');let state={};
    try{const s=JSON.parse(fs.readFileSync(file,'utf8'));if(s&&typeof s==='object'&&!Array.isArray(s))state=s;}catch(_){}
    const real=new Capsules(state,sourceId);let offset=0,stars=false,saved=JSON.stringify(state),demoModel=demo(Date.now());
    const isDemo=()=>ctx.settings.get('demo')==='on',model=()=>isDemo()?demoModel:real;
    const save=()=>{
        const data=JSON.stringify(state);if(saved===data)return;
        try{fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);saved=data;}catch(e){ctx.log.warn('Trip cards: '+e.message);}
    };
    const read=()=>{
        if(isDemo())return;
        real.connected=false;
        try{if(fs.statSync(SHARED).size>512000)return;const data=JSON.parse(fs.readFileSync(SHARED,'utf8'));if(real.ingest(data,Date.now()))save();}catch(_){}
    };
    const current=()=>{const list=model().list(stars);offset=G.clamp(offset,0,Math.max(0,list.length-1));return list[offset];};
    const browse=step=>{offset=G.clamp(offset+step,0,Math.max(0,model().list(stars).length-1));};
    const action=fn=>()=>{fn();if(!isDemo())save();return render();};
    const mark=()=>{const j=current();if(j)model().star(j.id);};
    const label=()=>{const j=current();if(j)model().label(j.id);};
    ctx.ui.onClick('BTN_OLDER',action(()=>browse(1)));
    ctx.ui.onClick('BTN_NEWER',action(()=>browse(-1)));
    ctx.ui.onClick('BTN_STAR',action(mark));
    ctx.ui.onClick('BTN_LABEL',action(label));
    ctx.ui.onClick('BTN_FILTER',action(()=>{stars=!stars;offset=0;}));
    ctx.onTab(i=>action(()=>{stars=i===1;offset=0;})());
    ctx.onScroll(dy=>{action(()=>browse(Math.sign(dy)))();return true;});
    ctx.settings.onChange(k=>{if(k==='demo'){offset=0;demoModel=demo(Date.now());}read();render();});
    const timer=setInterval(read,5000);if(timer.unref)timer.unref();process.on('exit',save);
    const f=(v,n=1)=>G.isNum(v)?v.toFixed(n):'--';
    function render() {
        const cv=ctx.canvas(1600,520),t=ctx.theme();cv.clear(t.bg);
        const m=model(),list=m.list(stars),j=current(),mi=ctx.settings.get('distUnit')==='mi',du=mi?'mi':'km',D=v=>v*(mi?.621371:1);
        const fahrenheit=ctx.settings.get('tempUnit')==='f';
        G.frame(cv,t,['All trips','Favourites'],stars?1:0,isDemo()?[{text:'DEMO'}]:[{text:real.connected?'IXDRIVE CONNECTED':'SAVED CARDS',color:real.connected?t.accent:t.dim}]);
        G.panel(cv,t,24,44,1016,468,'Trip Capsule');
        G.panel(cv,t,1064,44,512,468,'Journey details');
        cv.scroll=list.length>1;
        if(!j) {
            cv.text(stars?'No favourites yet':'Your journeys, collected.',532,230,42,t.text,{align:'center',font:'bold'});
            cv.text(stars?'Mark a trip to keep it here.':'Open iXDrive to start recording trips.',532,291,27,t.dim,{align:'center'});
            cv.text('Distance, energy and temperature',1088,170,23,t.dim);
            cv.text('arrive from iXDrive automatically.',1088,209,23,t.dim);
            cv.text('Cards stay available after it closes.',1088,280,23,t.dim);
            return ctx.ui.image('MAIN_GFX',cv);
        }
        const date=new Date(j.start);
        cv.text(date.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}),48,137,27,t.dim);
        cv.text(j.label==='Unlabelled'?'A journey in your iX3':j.label,48,198,46,t.text,{font:'bold'});
        cv.text(f(D(j.km)),48,310,104,t.text,{font:'num'});
        cv.text(du+' recorded',48,351,24,t.dim);
        cv.text(f(j.kwh,2),440,293,65,t.accent,{font:'num'});
        cv.text('kWh net energy',440,337,24,t.dim);
        cv.text(f(j.seconds/60,0),770,293,65,t.text,{font:'num'});
        cv.text('min recorded',770,337,24,t.dim);
        const status=j.live?(m.connected?'LIVE JOURNEY':'LAST LIVE SNAPSHOT'):j.partial?'PARTIAL RECORD':'RECORDED JOURNEY';
        cv.text(status+(j.star?' · FAVOURITE':''),48,399,21,j.partial||j.live?t.warn:t.dim,{font:'bold'});
        G.button(cv,t,48,448,144,40,'Newer',action(()=>browse(-1)),{key:'newer',busy:offset===0});
        G.button(cv,t,208,448,144,40,'Older',action(()=>browse(1)),{key:'older',busy:offset+1>=list.length});
        G.button(cv,t,452,448,176,40,j.star?'Unfavourite':'Favourite',action(mark),{key:'star',primary:j.star});
        G.button(cv,t,648,448,170,40,'Change label',action(label),{key:'label'});
        cv.text((offset+1)+' / '+list.length,1016,480,22,t.dim,{align:'right'});
        const time=ms=>new Date(ms).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
        const fields=[['START / LAST OBSERVED',time(j.start)+' / '+time(j.end)],
            ['EFFICIENCY',j.km>=1?f(j.kwh*100/D(j.km))+' kWh / 100 '+du:'--'],
            ['REGENERATED',f(j.regen,2)+' kWh'],
            ['OUTSIDE AVERAGE',f(G.isNum(j.ambient)?fahrenheit?j.ambient*1.8+32:j.ambient:null,0)+(fahrenheit?' °F':' °C')]];
        fields.forEach(([label,value],i)=>{cv.text(label,1088,132+i*83,18,t.dim,{font:'bold'});cv.text(value,1088,168+i*83,30,t.text);});
        cv.text('Observed intervals; gaps are not filled.',1088,479,20,t.dim);
        return ctx.ui.image('MAIN_GFX',cv);
    }
    read();ctx.loop('MAIN',2,render);await render();
}});
