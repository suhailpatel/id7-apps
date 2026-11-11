'use strict';
const mgu=require('./kit/mgu'),G=require('./kit/gauges');
const {Diag}=require('./kit/diag');
const {Observatory,demo,number}=require('./model');
const {createCollector}=require('./telemetry');
const COLOURS={pack:'#48d9ed',coolant:'#7da8ff',motor:'#d09bff',ambient:'#c0c8d0'};
mgu.run({async start(ctx) {
    const model=new Observatory(),diag=new Diag(ctx.signals,ctx.log);
    const usingDemo=()=>ctx.settings.get('demo')==='on';
    const collector=createCollector({diag,config:ctx.spec.config,model,enabled:()=>!usingDemo()});
    let page=0,windowMinutes=10,cellPage=0;
    diag.quiet=true;diag.on('available',available=>{if(available)collector.poll();});diag.init();
    ctx.signals.watch('de.bmw.infotainment.vehicle.Vehicle2','1',{statusCarSpeed2:v=>{
        if(!usingDemo())collector.motion(v&&v.speedVehicleCentreOfGravity);
    }},ctx.log);
    ctx.signals.watch('de.bmw.infrastructure.EnvironmentalInformation','1',{ExteriorTemperature:v=>{
        if(usingDemo())return;const raw=v&&v.temperatureExterior;
        model.put('ambient',{t:number(raw)&&raw>=0&&raw<255?raw*.5-40:null},Date.now(),'EnvironmentalInformation');
    }},ctx.log);
    const timer=setInterval(()=>collector.poll(),5000);if(timer.unref)timer.unref();
    const act=fn=>()=>{collector.touch();fn();collector.poll();return render();};
    ctx.ui.onClick('BTN_NEXT',act(()=>page=(page+1)%3));
    ctx.ui.onClick('BTN_PREV',act(()=>page=(page+2)%3));
    ctx.ui.onClick('BTN_DETAIL',act(()=>{if(page===1)windowMinutes=windowMinutes===10?30:windowMinutes===30?60:10;else if(page===2){const now=Date.now(),d=(usingDemo()?demo(now):model).snapshot(now);cellPage=(cellPage+1)%Math.max(1,Math.ceil(d.cells.length/96));}}));
    ctx.onTab(i=>act(()=>page=G.clamp(i,0,2))());
    ctx.onScroll(dy=>{if(page!==2)return false;act(()=>{cellPage=Math.max(0,cellPage+Math.sign(dy));})();return true;});
    ctx.ui.onVisible((name,visible)=>{if(name==='MAIN'&&visible){collector.touch();collector.poll();}});
    ctx.settings.onChange(key=>{collector.touch();if(key==='demo'){collector.reset();cellPage=0;}collector.poll();render();});
    const fmt=(v,n=1)=>number(v)?v.toFixed(n):'--';
    const fahrenheit=()=>ctx.settings.get('tempUnit')==='f';
    const T=v=>number(v)?fahrenheit()?v*1.8+32:v:null;
    const unit=()=>fahrenheit()?'°F':'°C';
    const temp=v=>fmt(T(v))+' '+unit();
    function stat(cv,t,x,y,label,value,colour=t.text,size=42) {
        cv.text(label,x,y,18,t.dim,{font:'bold'});cv.text(value,x,y+46,size,colour,{font:'num'});
    }
    function system(cv,t,d) {
        G.panel(cv,t,24,44,416,468,'Battery');G.panel(cv,t,464,44,672,468,'Thermal overview');G.panel(cv,t,1160,44,416,468,'Electrical');
        stat(cv,t,48,126,'PACK AVERAGE',temp(d.pack),COLOURS.pack,58);
        stat(cv,t,48,251,'COLDEST / WARMEST',fmt(T(d.minTemp))+' / '+fmt(T(d.maxTemp))+' '+unit(),t.text,34);
        stat(cv,t,48,362,'CELL VOLTAGE SPREAD',fmt(d.spread,0)+' mV',t.text,44);
        cv.text(number(d.soc)?fmt(d.soc,0)+'% charge':'Charge unavailable',48,484,24,t.dim);
        // A component map, not a claim about coolant plumbing or heat-flow direction.
        cv.strokeRoundRect(697,100,206,338,52,3,t.dim);
        [[677,151],[907,151],[677,347],[907,347]].forEach(([x,y])=>cv.roundRect(x,y,16,56,5,t.tick));
        cv.roundRect(726,142,148,40,8,t.track);
        cv.text('COOLANT',800,168,18,COLOURS.coolant,{align:'center',font:'bold'});
        cv.strokeRoundRect(724,202,152,142,14,2,COLOURS.pack);
        for(let i=0;i<6;i++)cv.roundRect(735+(i%3)*44,216+Math.floor(i/3)*58,34,44,4,t.track);
        cv.text('BATTERY',800,282,21,COLOURS.pack,{align:'center',font:'bold'});
        cv.roundRect(738,371,124,36,10,t.track);cv.text('MOTOR',800,395,18,t.dim,{align:'center',font:'bold'});
        cv.line(874,160,932,160,2,COLOURS.coolant);cv.text(temp(d.coolant),950,169,30,COLOURS.coolant);
        cv.line(876,272,932,272,2,COLOURS.pack);cv.text(temp(d.pack),950,282,30,COLOURS.pack);
        cv.line(862,388,932,388,2,t.tick);cv.text(number(d.motor)?temp(d.motor):'Unavailable',950,398,24,t.dim);
        cv.text('Outside  '+temp(d.ambient),800,484,24,COLOURS.ambient,{align:'center'});
        stat(cv,t,1184,126,'BATTERY POWER',fmt(d.kw)+' kW',number(d.kw)&&d.kw<0?'#67e8ae':t.text,52);
        cv.text(!number(d.kw)?'Waiting for readings':d.kw<-.3?'Into battery':d.kw>.3?'From battery':'Near idle',1184,211,23,t.dim);
        stat(cv,t,1184,285,'PACK VOLTAGE',fmt(d.volts,0)+' V');
        stat(cv,t,1184,403,'PACK CURRENT (A)',fmt(d.amps));
    }
    function thermal(cv,t,d,m,now) {
        G.panel(cv,t,24,44,1120,468,'Temperature history');G.panel(cv,t,1168,44,408,468,'Now');
        G.button(cv,t,872,54,248,38,'Window: '+windowMinutes+' min',act(()=>{windowMinutes=windowMinutes===10?30:windowMinutes===30?60:10;}),{key:'window'});
        const series=[];
        Object.entries(COLOURS).forEach(([key,color])=>m.segments(key,now,windowMinutes).forEach(pts=>series.push({pts:pts.map(([x,y])=>[x,T(y)]),color,width:3})));
        const vals=series.reduce((all,s)=>all.concat(s.pts.map(p=>p[1])),[]);
        let low=vals.length?Math.floor((Math.min(...vals)-3)/5)*5:T(0),high=vals.length?Math.ceil((Math.max(...vals)+3)/5)*5:T(50);
        if(high-low<10)high=low+10;
        G.chart(cv,t,96,138,1000,292,{xMin:-windowMinutes,xMax:0,yMin:low,yMax:high,xFmt:v=>v===0?'now':Math.round(v)+'m',yUnit:unit(),series,empty:vals.length?'':'Temperatures appear as readings arrive'});
        Object.entries(COLOURS).forEach(([key,color],i)=>{cv.roundRect(56+i*262,464,20,5,2,color);cv.text({pack:'Battery',coolant:'Coolant',motor:'Motor',ambient:'Outside'}[key],88+i*262,475,22,t.dim);});
        [['BATTERY',d.pack,COLOURS.pack],['COOLANT',d.coolant,COLOURS.coolant],['MOTOR',d.motor,COLOURS.motor],['OUTSIDE',d.ambient,COLOURS.ambient]].forEach(([label,v,c],i)=>stat(cv,t,1192,128+i*94,label,temp(v),number(v)?c:t.dim,38));
    }
    function cells(cv,t,d) {
        G.panel(cv,t,24,44,1120,468,'Cell voltages');G.panel(cv,t,1168,44,408,468,'Pack detail');
        const pages=Math.max(1,Math.ceil(d.cells.length/96));cellPage=Math.min(cellPage,pages-1);cv.scroll=pages>1;
        G.button(cv,t,892,54,228,38,'Next cells',act(()=>cellPage=(cellPage+1)%pages),{key:'cells',busy:pages===1});
        const valid=d.cells.filter(number),min=valid.length?Math.min(...valid):null,max=valid.length?Math.max(...valid):null;
        if(!d.cells.length) {
            cv.text('Cell-by-cell readings unavailable',584,254,32,t.dim,{align:'center'});
            cv.text('Pack limits appear when the battery responds.',584,304,24,t.dim,{align:'center'});
        }
        d.cells.slice(cellPage*96,(cellPage+1)*96).forEach((v,i)=>{
            const x=48+(i%16)*67,y=123+Math.floor(i/16)*51;
            const col=!number(v)?t.tick:v===min?COLOURS.coolant:v===max?'#f7c268':t.accent;
            cv.strokeRoundRect(x,y,59,43,6,1,col);
            cv.text(String(cellPage*96+i+1),x+5,y+14,12,t.dim);
            cv.text(fmt(v,3),x+29,y+34,18,col,{align:'center',font:'num'});
        });
        cv.text(d.cells.length?valid.length+' / '+d.cells.length+' cells read · blue lowest · amber highest':'No nominal cell count assumed',48,481,21,t.dim);
        stat(cv,t,1192,128,'LOWEST CELL',fmt(d.minV,3)+' V',COLOURS.coolant,42);
        stat(cv,t,1192,228,'HIGHEST CELL',fmt(d.maxV,3)+' V','#f7c268',42);
        stat(cv,t,1192,328,'VOLTAGE SPREAD',fmt(d.spread,0)+' mV',t.text,42);
        stat(cv,t,1192,428,'TEMPERATURE SPREAD',number(d.minTemp)&&number(d.maxTemp)?fmt((d.maxTemp-d.minTemp)*(fahrenheit()?1.8:1))+' '+unit():'-- '+unit(),t.text,32);
    }
    function render() {
        const now=Date.now(),m=usingDemo()?demo(now):model,d=m.snapshot(now),t=ctx.theme(),cv=ctx.canvas(1600,520).clear(t.bg);
        const any=['pack','coolant','volts','soc'].some(k=>number(d[k]));
        G.frame(cv,t,['Overview','Temperatures','Cells'],page,[{text:usingDemo()?'DEMO':!collector.active()?'PAUSED':any?'CANDIDATE DATA':'WAITING FOR CAR',color:usingDemo()?t.warn:t.dim}]);
        if(page===0)system(cv,t,d);else if(page===1)thermal(cv,t,d,m,now);else cells(cv,t,d);
        return ctx.ui.image('MAIN_GFX',cv);
    }
    ctx.loop('MAIN',2,render);await render();
}});
