'use strict';
const {number}=require('./decode');
class Pulse {
    constructor() { this.clear(); }
    clear() { this.readings={};this.resetAverage(); }
    resetAverage(){this.energy=0;this.distance=0;this.observedMs=0;this.previous=null;this.usedPowerAt=this.readings.hvI?this.readings.hvI.t:null;this.partial=false;}
    put(key,data,t,source) {
        this.readings[key]={data,t,source};
        if(!data&&['hvV','hvI','speed'].indexOf(key)>=0){this.previous=null;if(this.observedMs>0)this.partial=true;}
    }
    get(key,now,ttl) {
        const r=this.readings[key];
        return r&&now>=r.t&&now-r.t<=ttl?r.data:null;
    }
    speed(raw,now) {
        this.put('speed',number(raw)&&raw>=0&&raw<65535&&raw/64<=300?{kmh:raw/64}:null,now,'Vehicle2');
    }
    gear(raw,source,now){
        const r=raw||{},stage=source==='stage',v=stage?r.statusActualStageDrive:r.statusGearSelectionDrive;
        let value=null;
        if(typeof v==='string'){
            if(['P','R','N'].indexOf(v)>=0||stage&&v==='D')value=v;
            else if(!stage&&/^_[1-9]$/.test(v))value='D';
        }else if(Number.isInteger(v)){
            if(stage)value=({1:'P',2:'R',3:'N',4:'D'})[v]||null;
            else value=({1:'N',2:'R',3:'P'})[v]||(v>=5&&v<=13?'D':null);
        }
        // One latest report: a newer invalid/ambiguous position cannot revive an
        // older P/D from the other broadcast. Never infer selector position from speed.
        this.put('gear',value?{value}:null,now,'VehicleInformation.'+(stage?'statusGearboxDrive':'DataPowerTrain2'));
    }
    gearProgram(raw,now){
        const v=raw&&raw.displayProgramGearbox;
        this.put('gearProgram',v===5||v==='B_PROGRAMM'?{value:'B'}:null,now,'MDrive.dataDisplayGearbox');
    }
    speedLimit(raw,now) {
        // Catalogue-derived display value/unit, not the upcoming FASuS limit class.
        // Unknown validity, uncertain sign style and supplemental conditions are withheld.
        const r=raw||{},unit=r.displaySpeedLimitUnit;
        const mph=unit===1||unit==='MPH',kmh=unit===0||unit==='KM_H';
        const certain=[0,2,4,6,8,'ECE','US','CHINA','KOREA','JAPAN'].indexOf(r.displaySymbolStyle)>=0;
        const unconditional=r.displaySpeedLimitSupplemental===0||r.displaySpeedLimitSupplemental==='KEIN_ZUSATZZEICHEN';
        const valid=r.invalidFlag===0&&certain&&unconditional&&(mph||kmh)&&Number.isInteger(r.displaySpeedLimit)&&r.displaySpeedLimit>=5&&r.displaySpeedLimit<=200;
        this.put('limit',valid?{value:r.displaySpeedLimit,unit:mph?'mph':'km/h'}:null,now,'TrafficSignDisplayControl (unvalidated)');
    }
    distanceUnit(raw,now){
        const v=raw&&raw.unitOfMeasurementMileage,unit=v===1||v==='KILOMETER'?'km':v===2||v==='MEILEN'?'mi':null;
        const old=this.get('distanceUnit',now,60000);
        if(!unit||old&&old.unit!==unit)delete this.readings.range;
        this.put('distanceUnit',unit?{unit}:null,now,'EnvironmentalInformation.UnitBN2020');
    }
    range(raw,now){
        const value=raw&&raw.displayRangeElectricVehicle;
        this.put('range',Number.isInteger(value)&&value>=0&&value<4093?{value}:null,now,'KombiIF.displayRangeElectricVehicle');
    }
    observe(now){
        const d=this.snapshot(now),power=this.readings.hvI;
        if(!number(d.kw)||!number(d.kmh)||(d.kmh<=1&&d.kw<-.3)){
            this.previous=null;if(this.observedMs>0)this.partial=true;return;
        }
        if(!power||power.t===this.usedPowerAt)return;
        this.usedPowerAt=power.t;
        const point={t:power.t,kw:d.kw,kmh:d.kmh},prev=this.previous;
        if(prev){
            const dt=point.t-prev.t;
            if(dt>0&&dt<=10000){
                this.energy+=(prev.kw+point.kw)/2*dt/3600000;
                this.distance+=(prev.kmh+point.kmh)/2*dt/3600000;
                this.observedMs+=dt;
            }else if(this.observedMs>0)this.partial=true;
        }
        this.previous=point;
    }
    snapshot(now) {
        const v=this.get('hvV',now,12000),a=this.get('hvI',now,12000),soc=this.get('soc',now,30000);
        const temp=this.get('cellT',now,30000),speed=this.get('speed',now,5000);
        const kw=v&&a&&number(v.v)&&number(a.a)&&Math.abs(this.readings.hvV.t-this.readings.hvI.t)<=5000?v.v*a.a/1000:null;
        const kmh=speed?speed.kmh:null;
        const flow=!number(kw)?'UNAVAILABLE':kw<-.3?(number(kmh)&&kmh>1?'REGEN':'INTO BATTERY'):kw>.3?'POWER':'IDLE';
        const range=this.get('range',now,30000),units=this.get('distanceUnit',now,60000);
        const gear=this.get('gear',now,5000),program=this.get('gearProgram',now,5000);
        return {kw,kmh,flow,gear:gear?(gear.value==='D'&&program?'B':gear.value):null,
            rangeKm:range&&units?range.value*(units.unit==='mi'?1.609344:1):null,
            averageKwh100Km:this.distance>=1?100*this.energy/this.distance:null,observedKm:this.distance,averagePartial:this.partial,
            observedSeconds:this.observedMs/1000,observedNetKwh:this.observedMs>0?this.energy:null,
            limit:this.get('limit',now,15000),soc:soc&&number(soc.pct)?soc.pct:null,temp:temp&&number(temp.avg)?temp.avg:null,
            volts:v&&number(v.v)?v.v:null,demo:false};
    }
}
const {Navigation}=require('./navigation');
function demo(now) {
    const kw=Math.round(40+70*Math.sin(now/4000));
    return {kw,kmh:88,gear:'D',limit:{value:60,unit:'mph'},flow:kw<-.3?'REGEN':'POWER',soc:64,temp:26.5,volts:389,demo:true,
        rangeKm:286,averageKwh100Km:18.4,observedKm:24,observedSeconds:1800,observedNetKwh:4.416,averagePartial:false,
        navigation:{turn:{arrow:'left',text:'Turn left',distance:'300 yd',road:'Station Road'},text:'',hudReason:''}};
}
// This is a labelled drawing scale, never rated power or a learned vehicle capability.
function scale(kw) { return Math.max(50,Math.ceil(Math.abs(kw||0)/50)*50); }
module.exports={Pulse,Navigation,demo,scale,number};
