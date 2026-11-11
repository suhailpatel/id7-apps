'use strict';
const mgu=require('./kit/mgu'),G=require('./kit/gauges');
const {Diag}=require('./kit/diag');
const {Pulse,Navigation,demo,number,scale}=require('./model');
const {createCollector}=require('./telemetry');
const {createProjection}=require('./projection');
const Draw=require('./draw');
const Type=require('./typography');
const {createReader}=require('./navigation');
mgu.run({async start(ctx) {
    const model=new Pulse(),nav=new Navigation(),diag=new Diag(ctx.signals,ctx.log),projection=createProjection(ctx);
    const usingDemo=()=>ctx.settings.get('demo')==='on';
    const collector=createCollector({diag,config:ctx.spec.config,model,enabled:()=>!usingDemo()});
    let page=0,epoch=0;const subscriptions=[];
    const navReader=createReader(ctx.signals,nav,()=>collector.active());
    const current=()=>usingDemo()?demo(Date.now()):Object.assign(model.snapshot(Date.now()),{navigation:nav.view(Date.now())});
    const project=()=>{if(!usingDemo())model.observe(Date.now());const d=current();projection.update(d,collector.active(),d.navigation.hudReason);};
    function watch(iface,instance,handlers,pollMs,routeOnly) {
        ctx.signals.watch(iface,instance,handlers,ctx.log,{pollMs,shouldRead:()=>collector.active()&&(!routeOnly||nav.route(Date.now()).source==='bmw'),
            shouldReceive:()=>!usingDemo()&&(!routeOnly||nav.route(Date.now()).source==='bmw'),generation:()=>routeOnly?epoch+':'+nav.epoch:epoch}).then(s=>subscriptions.push(s));
    }
    watch('de.bmw.infotainment.vehicle.Vehicle2','1',{statusCarSpeed2:v=>{
        const raw=v&&v.speedVehicleCentreOfGravity;model.speed(raw,Date.now());collector.motion(raw);project();
    }},2000);
    watch('de.bmw.infrastructure.VehicleInformation','1',{
        statusGearboxDrive:v=>{model.gear(v,'stage',Date.now());project();},
        DataPowerTrain2:v=>{model.gear(v,'selection',Date.now());project();}
    },0);
    watch('de.bmw.infotainment.misc.MDrive','1',{
        dataDisplayGearbox:v=>{model.gearProgram(v,Date.now());project();}
    },0);
    watch('de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl','1',{
        displaySpeedLimitAndNoPassingRestriction:v=>{model.speedLimit(v,Date.now());project();}
    },0);
    watch('de.bmw.infrastructure.EnvironmentalInformation','1',{UnitBN2020:v=>model.distanceUnit(v,Date.now())},10000);
    watch('de.bmw.infotainment.KombiIF','1',{displayRangeElectricVehicle:v=>model.range(v,Date.now())},5000);
    const receive=key=>v=>{nav.put(key,v,Date.now());project();};
    watch('de.bmw.infotainment.navigation.guiding.Guidance','Main_Instance',{
        guidanceState:receive('state'),guidingProvider:receive('provider'),activeRouteChanged:()=>{nav.changed(Date.now());project();}
    },5000);
    watch('de.bmw.infotainment.navigation.guiding.Guidance','Main_Instance',{conclusiveDart:v=>{nav.dart(v,Date.now());project();}},1000,true);
    watch('de.bmw.infotainment.a4a.carplay.CarPlayManager','CarPlayManagerInst1',{projectedGuidanceActive:receive('carplay')},5000);
    watch('de.bmw.infotainment.sdi.aap.androidautoprojectedmanager.AndroidAutoProjectedManager','AndroidAutoProjectedManagerInst1',{projectedGuidanceActive:receive('android')},5000);
    diag.quiet=true;diag.on('available',available=>{if(available)collector.poll();});diag.init();
    const pollTimer=setInterval(()=>collector.poll(),5000),projectionTimer=setInterval(project,500),navTimer=setInterval(()=>navReader.poll(),1000);
    [pollTimer,projectionTimer,navTimer].forEach(t=>{if(t.unref)t.unref();});
    const touch=()=>{collector.touch();subscriptions.forEach(s=>{if(s.refresh)s.refresh();});collector.poll();};
    ctx.ui.onClick('BTN_PAGE',()=>{touch();page=(page+1)%3;return render();});
    ctx.ui.onClick('BTN_RESET_AVG',()=>{if(!usingDemo())model.resetAverage();touch();return render();});
    ctx.onTab(i=>{touch();page=G.clamp(i,0,2);return render();});
    ctx.ui.onVisible((name,visible)=>{if(name==='MAIN'&&visible)touch();});
    ctx.settings.onChange(key=>{if(key==='demo'){epoch++;collector.reset();nav.clear();projection.close();}touch();project();render();});
    process.on('exit',()=>{clearInterval(pollTimer);clearInterval(projectionTimer);clearInterval(navTimer);navReader.stop();projection.close();});
    function preview(cv,d,x,y,k,test,style) {
        const scaled={clear(){},text:(s,a,b,size,c,o)=>cv.text(s,x+a*k,y+b*k,size*k,c,o),
            fillRect:(a,b,w,h,c)=>cv.fillRect(x+a*k,y+b*k,w*k,h*k,c),
            line:(a,b,c,e,w,col)=>cv.line(x+a*k,y+b*k,x+c*k,y+e*k,w*k,col),
            strokeRoundRect:(a,b,w,h,r,l,c)=>cv.strokeRoundRect(x+a*k,y+b*k,w*k,h*k,r*k,l*k,c),
            arc:(a,b,r0,r1,a0,a1,c,o)=>cv.arc(x+a*k,y+b*k,r0*k,r1*k,a0,a1,c,o),
            textWidth:(s,size,o)=>cv.textWidth(s,size*k,o)/k};
        Draw.draw(scaled,d,ctx.settings.get('palette'),test,ctx.settings.get('speedUnit'),style,ctx.settings.get('typeface'));
    }
    function render() {
        const d=current(),t=ctx.theme(),cv=ctx.canvas(1600,520).clear(t.bg),c=Draw.colours(ctx.settings.get('palette'));
        G.frame(cv,t,['Pulse','Displays','Layouts'],page,[{text:d.demo?'DEMO':!collector.active()?'PAUSED':number(d.kw)||number(d.soc)||number(d.kmh)||number(d.rangeKm)||d.gear||d.limit?'UNVERIFIED DATA':'WAITING FOR CAR',color:t.dim}]);
        if(page===0){
            G.panel(cv,t,24,44,1056,468,'Battery power');G.panel(cv,t,1104,44,472,468,'Drive essentials');
            const ink=d.kw<0?c.regen:c.power;
            cv.text(d.flow,56,128,24,ink,{font:'bold'});
            cv.text(Draw.fmt(d.kw),56,269,136,ink,{font:'num'});cv.text('kW',414,267,42,t.dim);
            cv.text(Draw.fmt(d.soc),1016,242,96,t.text,{align:'right',font:'num'});
            cv.text('% BATTERY',1016,281,22,t.dim,{align:'right'});
            const cap=scale(d.kw),zero=552;
            for(let i=0;i<40;i++){
                const fraction=(i<20?20-i:i-19)/20,on=number(d.kw)&&fraction<=Math.abs(d.kw)/cap;
                const lit=on&&((d.kw<0&&i<20)||(d.kw>=0&&i>=20));
                cv.roundRect(56+i*25,327,19,46,3,lit?ink:t.track);
            }
            cv.fillRect(zero,316,2,68,t.text);
            cv.text('INTO BATTERY',56,414,22,c.regen,{font:'bold'});cv.text('POWER OUT',1044,414,22,c.power,{align:'right',font:'bold'});
            const miles=ctx.settings.get('speedUnit')==='mph',distanceUnit=miles?'mi':'km';
            cv.text('RANGE  '+Draw.fmt(number(d.rangeKm)?d.rangeKm/(miles?1.609344:1):null)+' '+distanceUnit,56,466,26,t.text);
            cv.text('AVG OBS  '+Draw.fmt(number(d.averageKwh100Km)?d.averageKwh100Km*(miles?1.609344:1):null,1)+' kWh/100 '+distanceUnit,1044,466,24,t.text,{align:'right'});
            cv.text('Scale +/-'+cap+' kW',552,413,16,t.dim,{align:'center'});
            const mph=ctx.settings.get('speedUnit')==='mph';
            cv.text('SPEED',1136,127,20,t.dim,{font:'bold'});
            Type.speed(cv,Draw.fmt(number(d.kmh)?d.kmh*(mph?.621371:1):null),1136,224,84,t.text,'left',108,ctx.settings.get('typeface'));
            cv.text(mph?'mph':'km/h',1256,222,24,t.dim);
            cv.strokeRoundRect(1436,146,88,74,32,3,d.limit?t.text:t.dim);
            cv.text(d.limit?Draw.fmt(d.limit.value):'--',1480,200,46,t.text,{align:'center',font:'num'});
            cv.text(d.limit?'LIMIT '+d.limit.unit:'LIMIT',1480,127,18,t.dim,{align:'center',font:'bold'});
            cv.line(1136,260,1544,260,1,t.tick);
            const f=ctx.settings.get('tempUnit')==='f',temp=number(d.temp)?f?d.temp*1.8+32:d.temp:null;
            cv.text('BATTERY TEMPERATURE',1136,312,20,t.dim,{font:'bold'});cv.text(Draw.fmt(temp,1)+(f?' °F':' °C'),1136,365,44,t.text,{font:'num'});
            cv.text('PACK VOLTAGE',1136,422,20,t.dim,{font:'bold'});cv.text(Draw.fmt(d.volts)+' V',1136,475,40,t.text,{font:'num'});
        }else if(page===1){
            G.panel(cv,t,24,44,760,468,'Head-up display');G.panel(cv,t,808,44,768,468,'Instrument cluster');
            const style=Draw.styleName(ctx.settings.get('clusterStyle')),wide=style!=='compact';
            preview(cv,d,134,106,1.35,ctx.settings.get('hud')==='test');
            preview(cv,d,wide?832:922,106,wide?1:1.35,ctx.settings.get('cluster')==='test',style);
            cv.text(projection.status('hud'),56,440,24,t.text);cv.text(projection.status('cluster'),840,440,24,t.text);
            cv.text('BMW guidance takes over if directions are unavailable',56,485,20,t.dim);
            cv.text('AVG OBS: recorded driving since app start or reset',840,485,20,t.dim);
        }else{
            G.panel(cv,t,24,44,760,468,'Taycan · three instruments');G.panel(cv,t,808,44,768,468,'Horizon · wide digital');
            preview(cv,d,44,110,1,false,'taycan');preview(cv,d,832,110,1,false,'horizon');
            cv.text('Energy · speed / power · navigation',56,446,22,t.text);
            cv.text('Large digits · open layout · power strip',840,446,22,t.text);
            cv.text('Choose layout and speed typeface in Settings',56,482,20,t.dim);
            cv.text('HUD keeps its compact layout',840,482,20,t.dim);
        }
        return ctx.ui.image('MAIN_GFX',cv);
    }
    ctx.loop('MAIN',2,render);await render();
}});
