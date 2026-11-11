'use strict';
const {number}=require('./decode');
const {normalizeSoc,CapacityLearner}=require('./ev');
const {ChargeHistory}=require('./history');
class ChargeModel {
    constructor(state,config) {
        this.st=state;this.config=config;
        this.history=new ChargeHistory(state,JSON.stringify([config.ecu,config.powerSign,config.groups,config.socWindow]),config.chargeMinPct);
        this.learner=new CapacityLearner(state.capacityLearning||(state.capacityLearning={}));
        this.clear();
    }
    clear() {
        this.readings={};this.speed=null;this.speedT=0;this.previous=null;this.meter={kwh:0,epoch:0,t:0};
        this.learner.anchor=null;this.learner.candidate=null;this.history.breakContinuity();
    }
    put(key,data,t,source){this.readings[key]={data,t,source};}
    motion(raw,now){this.speed=number(raw)&&raw>=0&&raw<65535&&raw*.015625<=300?raw*.015625:null;this.speedT=now;}
    get(key,now,ttl){const r=this.readings[key];return r&&now>=r.t&&now-r.t<ttl?r.data:null;}
    snapshot(now) {
        const v=this.get('hvV',now,15000),a=this.get('hvI',now,15000),s=this.get('soc',now,30000),temp=this.get('cellT',now,30000),cap=this.get('capacity',now,60000);
        const synced=v&&a&&Math.abs(this.readings.hvV.t-this.readings.hvI.t)<=5000;
        const reported=cap&&number(cap.kwh)&&cap.kwh>=15&&cap.kwh<=200;
        return {t:now,soc:normalizeSoc(s&&s.pct,this.config.socWindow),
            kw:synced&&number(v.v)&&number(a.a)?v.v*a.a/1000:null,
            speed:now>=this.speedT&&now-this.speedT<5000?this.speed:null,
            temp:temp&&number(temp.avg)?temp.avg:null,
            capacity:reported?cap.kwh:this.learner.value(now),source:reported?'reported':'learned'};
    }
    record(now) {
        const d=this.snapshot(now),p=this.previous,dt=p?now-p.t:0;
        // A fresh pair must have been read in this cycle; never integrate cached power.
        const fresh=['hvV','hvI'].every(k=>this.readings[k]&&(!p||this.readings[k].t>p.t));
        if(!fresh)d.kw=null;
        const driving=number(d.kw)&&number(d.speed)&&d.speed>=0&&!(d.speed<=1&&d.kw<-.3);
        const connected=p&&driving&&p.driving&&dt>0&&dt<=6000;
        if(connected)this.meter.kwh+=(p.kw+d.kw)/2*dt/3600000;
        else {this.meter.kwh=0;this.meter.epoch++;}
        this.meter.t=now;
        const sr=this.readings.soc;
        if(sr&&(!p||sr.t>p.t)&&number(d.soc)) {
            this.learner.observe(d.soc,driving?this.meter:null,now);
            this.history.soc(d.soc,now,d.speed,d.capacity);
        }
        this.history.observe(d);this.previous=Object.assign({driving},d);
    }
}
module.exports={ChargeModel};
