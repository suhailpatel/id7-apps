'use strict';
const {number,scale}=require('./model');
const Type=require('./typography');
const fmt=(v,n=0)=>number(v)?v.toFixed(n):'--';
const WIDTH=400,HEIGHT=200;
function fit(cv,text,width,size){let s=String(text||'');if(cv.textWidth(s,size)<=width)return s;while(s&&cv.textWidth(s+'…',size)>width)s=s.slice(0,-1);return s+'…';}
function arrow(cv,type,x,y,c){
    const line=(a,b,d,e)=>cv.line(x+a,y+b,x+d,y+e,3,c);
    if(type==='left'||type==='right'){
        const sign=type==='left'?-1:1;line(0,10,0,-5);line(0,-5,sign*16,-5);line(sign*16,-5,sign*9,-12);line(sign*16,-5,sign*9,2);
    }else if(type==='straight'){line(0,12,0,-12);line(0,-12,-7,-5);line(0,-12,7,-5);}
    else if(type==='uturn'){line(9,12,9,-10);line(9,-10,-9,-10);line(-9,-10,-9,8);line(-9,8,-15,2);line(-9,8,-3,2);}
    else if(type==='roundabout')cv.strokeRoundRect(x-12,y-12,24,24,12,3,c);
    else {line(-9,12,-9,-13);line(-9,-12,12,-12);line(12,-12,12,0);line(12,0,-9,0);}
}
function colours(palette) {
    return palette==='white'?{power:'#ffffff',regen:'#ffffff',dim:'#aeb7c1'}:
        palette==='amber'?{power:'#ffbd61',regen:'#ffbd61',dim:'#c59a60'}:
        {power:'#46daf2',regen:'#67e8ae',dim:'#aeb7c1'};
}
// Compact HUD artwork also remains available as the original cluster layout.
function compact(cv,d,palette,test,speedUnit,typeface) {
    const c=colours(palette),ink=d.kw<0?c.regen:c.power;
    cv.clear();
    if(test) {
        cv.strokeRoundRect(2,2,396,196,4,2,c.power);
        cv.line(200,5,200,195,1,c.dim);
        cv.text('ALIGNMENT',200,58,24,'#ffffff',{align:'center',font:'bold'});
        cv.text('iX PULSE',200,110,32,c.power,{align:'center',font:'bold'});
        cv.text('PARKED ONLY',200,160,18,c.dim,{align:'center'});return cv;
    }
    const mph=speedUnit!=='kmh',speed=number(d.kmh)?d.kmh*(mph?.621371:1):null;
    cv.text(d.demo?'DEMO': 'UNVERIFIED',8,15,12,c.dim,{font:'bold'});
    Type.speed(cv,fmt(speed),8,76,64,'#ffffff','left',96,typeface);
    cv.text('GEAR',130,17,10,c.dim,{align:'center',font:'bold'});
    cv.text(d.gear||'--',130,53,32,'#ffffff',{align:'center',font:'bold'});
    cv.text(mph?'mph':'km/h',110,75,15,c.dim);
    // Keep the car's posted unit: converting a road sign would invent a different limit.
    cv.strokeRoundRect(170,23,58,49,22,2,d.limit?'#ffffff':c.dim);
    cv.text(d.limit?fmt(d.limit.value):'--',199,57,30,'#ffffff',{align:'center',font:'num'});
    cv.text(d.limit?d.limit.unit:'LIMIT',199,17,12,c.dim,{align:'center'});
    cv.text(fmt(d.soc)+'%',392,32,30,'#ffffff',{align:'right',font:'num'});
    cv.text(fmt(d.kw)+' kW',392,60,25,ink,{align:'right',font:'num'});
    cv.text(d.flow,392,77,11,ink,{align:'right',font:'bold'});
    const cap=scale(d.kw),zero=200;
    cv.fillRect(8,93,384,2,c.dim);cv.fillRect(zero-1,87,2,15,'#ffffff');
    if(number(d.kw))cv.fillRect(d.kw<0?zero+184*d.kw/cap:zero,89,Math.max(1,184*Math.abs(d.kw)/cap),10,ink);
    cv.text('IN',8,107,10,c.regen,{font:'bold'});
    cv.text('SCALE +/-'+cap+' kW',200,107,10,c.dim,{align:'center'});
    cv.text('OUT',392,107,10,c.power,{align:'right',font:'bold'});
    const range=number(d.rangeKm)?d.rangeKm/(mph?1.609344:1):null;
    const avg=number(d.averageKwh100Km)?d.averageKwh100Km*(mph?1.609344:1):null;
    cv.text('RANGE',8,122,10,c.dim,{font:'bold'});
    cv.text(fmt(range)+' '+(mph?'mi':'km'),8,146,24,'#ffffff',{font:'num'});
    cv.text('AVG OBS · kWh/100 '+(mph?'mi':'km'),392,122,10,c.dim,{align:'right',font:'bold'});
    cv.text(fmt(avg,1),392,146,24,'#ffffff',{align:'right',font:'num'});
    cv.fillRect(8,154,384,1,c.dim);
    const nav=d.navigation||{},turn=nav.turn;
    if(turn){
        arrow(cv,turn.arrow,29,177,'#ffffff');
        cv.text(fit(cv,turn.text,210,18),60,176,18,'#ffffff',{font:'bold'});
        cv.text(fit(cv,turn.distance,115,17),392,176,17,'#ffffff',{align:'right',font:'num'});
        cv.text(fit(cv,turn.road,332,14),60,195,14,c.dim);
    }else cv.text(fit(cv,nav.text||'Navigation unavailable',380,15),8,182,15,c.dim);
    return cv;
}
const STYLES=['compact','taycan','horizon'];
const styleName=style=>STYLES.indexOf(style)>=0?style:'compact';
const dimensions=style=>styleName(style)==='compact'?{w:WIDTH,h:HEIGHT}:{w:720,h:300};
function values(d,speedUnit) {
    const mph=speedUnit!=='kmh';
    return {speed:fmt(number(d.kmh)?d.kmh*(mph?.621371:1):null),unit:mph?'mph':'km/h',
        range:fmt(number(d.rangeKm)?d.rangeKm/(mph?1.609344:1):null)+' '+(mph?'mi':'km'),
        avg:fmt(number(d.averageKwh100Km)?d.averageKwh100Km*(mph?1.609344:1):null,1),
        avgUnit:'kWh/100 '+(mph?'mi':'km')};
}
function sign(cv,d,x,y,c) {
    cv.strokeRoundRect(x-24,y,48,42,20,2,d.limit?'#ffffff':c.dim);
    cv.text(d.limit?fmt(d.limit.value):'--',x,y+30,28,'#ffffff',{align:'center',font:'num'});
    cv.text(d.limit?d.limit.unit:'LIMIT',x,y-5,11,c.dim,{align:'center'});
}
function navigation(cv,d,c,x,y,width) {
    const nav=d.navigation||{},turn=nav.turn;
    cv.text('NAVIGATION',x,y,12,c.dim,{align:'center',font:'bold'});
    if(turn){
        arrow(cv,turn.arrow,x,y+34,'#ffffff');
        cv.text(fit(cv,turn.text,width,20),x,y+73,20,'#ffffff',{align:'center',font:'bold'});
        cv.text(fit(cv,turn.distance,width,29),x,y+106,29,'#ffffff',{align:'center',font:'num'});
        cv.text(fit(cv,turn.road,width,14),x,y+131,14,c.dim,{align:'center'});
    }else{
        cv.text('--',x,y+66,36,'#ffffff',{align:'center',font:'num'});
        cv.text(fit(cv,nav.text||'Navigation unavailable',width,13),x,y+106,13,c.dim,{align:'center'});
    }
}
function dial(cv,x,y,r,c) {
    cv.arc(x,y,r-1.5,r,222,498,c.dim);
    cv.arc(x,y,r-6,r-4,222,498,'#46515d');
}
function charge(cv,soc,x,y,w,c) {
    for(let i=0;i<20;i++){
        const left=x+i*w/20,width=w/20-2;
        cv.fillRect(left,y,width,3,'#46515d');
        if(number(soc)){
            const fill=Math.max(0,Math.min(1,soc/5-i));
            if(fill>0)cv.fillRect(left,y,width*fill,3,c.regen);
        }
    }
}
function taycan(cv,d,c,v) {
    const white='#ffffff',ink=d.kw<0?c.regen:c.power,cap=scale(d.kw);
    // Three open-bottom tubes echo the Taycan's classic view. Values and scale
    // remain BMW-derived: no invented drive mode, power percentage or map tiles.
    dial(cv,132,149,104,c);dial(cv,360,145,126,c);dial(cv,588,149,104,c);
    cv.text('ENERGY',132,80,12,c.dim,{align:'center',font:'bold'});
    cv.text(fmt(d.soc)+'%',132,120,36,white,{align:'center',font:'num'});
    charge(cv,d.soc,82,131,100,c);
    cv.text(v.range,132,159,28,white,{align:'center',font:'num'});
    cv.text('RANGE',132,177,11,c.dim,{align:'center'});
    cv.text(v.avg,132,209,25,white,{align:'center',font:'num'});
    cv.text('AVG OBS · '+v.avgUnit,132,229,11,c.dim,{align:'center'});
    // Zero is at twelve o'clock; negative kW sweeps left, positive right.
    cv.arc(360,145,115,120,228,360,'#303943');
    cv.arc(360,145,115,120,360,492,'#303943');
    if(number(d.kw)&&d.kw!==0){
        const end=360+132*d.kw/cap;
        cv.arc(360,145,115,120,Math.min(360,end),Math.max(360,end),ink);
        const a=end*Math.PI/180;
        cv.line(360+109*Math.sin(a),145-109*Math.cos(a),360+125*Math.sin(a),145-125*Math.cos(a),2,white);
    }
    cv.line(360,19,360,36,2,white);
    sign(cv,d,360,53,c);
    Type.speed(cv,v.speed,360,164,68,white,'center',188,v.typeface);
    cv.text(v.unit,360,185,15,c.dim,{align:'center'});
    cv.text(d.gear||'--',360,222,29,white,{align:'center',font:'bold'});
    cv.text(fmt(d.kw)+' kW',360,251,23,ink,{align:'center',font:'num'});
    cv.text('IN',267,250,10,c.regen,{align:'center'});cv.text('OUT',453,250,10,c.power,{align:'center'});
    cv.text('SCALE +/-'+cap+' kW',360,287,11,c.dim,{align:'center'});
    navigation(cv,d,c,588,80,170);
    cv.text(d.flow||'UNAVAILABLE',132,287,12,ink,{align:'center'});
    cv.text('iX PULSE',588,287,12,c.dim,{align:'center',font:'bold'});
}
function horizon(cv,d,c,v) {
    const white='#ffffff',ink=d.kw<0?c.regen:c.power,cap=scale(d.kw);
    cv.line(249,52,249,257,1,'#46515d');cv.line(471,52,471,257,1,'#46515d');
    cv.text('BATTERY',30,66,12,c.dim,{font:'bold'});
    cv.text(fmt(d.soc)+'%',30,108,38,white,{font:'num'});
    charge(cv,d.soc,30,120,185,c);
    cv.text(v.range,30,158,33,white,{font:'num'});
    cv.text('REMAINING RANGE',30,180,12,c.dim);
    cv.text(v.avg,30,228,32,white,{font:'num'});
    cv.text('AVG OBS · '+v.avgUnit,30,251,12,c.dim);
    cv.text(d.gear||'--',286,75,30,white,{align:'center',font:'bold'});
    sign(cv,d,427,43,c);
    Type.speed(cv,v.speed,360,164,76,white,'center',184,v.typeface);
    cv.text(v.unit,360,187,16,c.dim,{align:'center'});
    cv.text(fmt(d.kw)+' kW',360,229,28,ink,{align:'center',font:'num'});
    cv.text(d.flow||'UNAVAILABLE',360,251,11,ink,{align:'center'});
    navigation(cv,d,c,590,66,200);
    cv.fillRect(30,273,660,3,'#46515d');cv.fillRect(359,268,2,13,white);
    if(number(d.kw))cv.fillRect(d.kw<0?360+330*d.kw/cap:360,271,Math.max(1,330*Math.abs(d.kw)/cap),6,ink);
    cv.text('IN',30,296,10,c.regen);cv.text('SCALE +/-'+cap+' kW',360,296,10,c.dim,{align:'center'});
    cv.text('OUT',690,296,10,c.power,{align:'right'});
}
function draw(cv,d,palette,test,speedUnit,style,typeface) {
    style=styleName(style);
    if(style==='compact')return compact(cv,d,palette,test,speedUnit,typeface);
    const c=colours(palette);cv.clear();
    if(test){
        cv.strokeRoundRect(2,2,716,296,4,2,c.power);cv.line(360,5,360,295,1,c.dim);
        cv.text('ALIGNMENT · '+style.toUpperCase(),360,75,26,'#ffffff',{align:'center',font:'bold'});
        cv.text('iX PULSE',360,163,40,c.power,{align:'center',font:'bold'});
        cv.text('PARKED ONLY',360,238,22,c.dim,{align:'center'});
        return cv;
    }
    cv.text(d.demo?'DEMO':'UNVERIFIED',20,15,11,c.dim,{font:'bold'});
    (style==='taycan'?taycan:horizon)(cv,d,c,Object.assign(values(d,speedUnit),{typeface}));
    return cv;
}
module.exports={draw,colours,fmt,WIDTH,HEIGHT,dimensions,styleName,STYLES};
