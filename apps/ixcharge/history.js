'use strict';
// Charging recorder extracted from iXDrive's Insights. Only observed intervals count.
const num=v=>typeof v==='number'&&isFinite(v);
const GAP=6000, ASLEEP=600000;
const append=(list,value,max)=>{list.push(value);if(list.length>max)list.splice(0,list.length-max);};
class ChargeHistory {
    constructor(state,basis,minPct=1) {
        this.st=state;this.minPct=minPct;this.prev=null;
        if(!Array.isArray(state.log))state.log=[];
        if(!Array.isArray(state.charges))state.charges=[];
        if(state.basis&&state.basis!==basis) {
            this.closeCharge(true);state.session=null;delete state.lastSoc;delete state.lastSocT;
            state.era=(state.era||0)+1;delete state.capacityLearning;
        }
        state.basis=basis;
        if(state.charge)state.charge.partial=true;
    }
    closeCharge(partial) {
        const c=this.st.charge;if(!c)return;
        c.partial=c.partial||!!partial;
        if(c.seconds>=30)append(this.st.charges,c,20);
        this.st.charge=null;
    }
    tick(t) {if(this.st.charge&&t-this.st.charge.end>=120000)this.closeCharge(!this.prev||t-this.prev.t>GAP);}
    breakContinuity() {this.prev=null;if(this.st.charge)this.st.charge.partial=true;}
    observe(s) {
        if(!s||!num(s.t))return;
        if(this.prev&&s.t-this.prev.t<1000)return;
        this.tick(s.t);
        const p=this.prev,dt=p?s.t-p.t:0,valid=num(s.kw)&&num(s.speed)&&s.speed>=0;
        const connected=p&&dt>0&&dt<=GAP&&valid&&num(p.kw)&&num(p.speed);
        const charging=valid&&s.speed<=1&&s.kw<-.3;
        const wasCharging=p&&num(p.speed)&&p.speed<=1&&p.kw<-.3;
        if(!connected&&p)this.breakContinuity();
        if(!valid){this.breakContinuity();return;}
        if(charging) {
            let c=this.st.charge;
            if(!c)c=this.st.charge={start:s.t,end:s.t,seconds:0,kwh:0,peak:-s.kw,
                from:num(s.soc)?s.soc:null,to:num(s.soc)?s.soc:null,points:[],partial:false,era:this.st.era||0};
            if(connected&&wasCharging){c.kwh-=(p.kw+s.kw)/2*dt/3600000;c.seconds+=dt/1000;}
            c.end=s.t;c.peak=Math.max(c.peak,-s.kw);
            if(num(s.soc)){if(c.from===null)c.from=s.soc;c.to=s.soc;}
            if(!(connected&&wasCharging))c.segment=(c.segment||0)+1;
            const last=c.points[c.points.length-1];
            if(!last||last.segment!==c.segment||s.t-last.t>=30000||(num(s.soc)&&num(last.soc)&&Math.abs(s.soc-last.soc)>=1)) {
                c.points.push({t:s.t,soc:num(s.soc)?s.soc:null,kw:-s.kw,temp:num(s.temp)?s.temp:null,segment:c.segment||0});
                if(c.points.length>240)c.points=c.points.filter((_,i)=>i%2===0||i===c.points.length-1);
            }
        } else if(this.st.charge&&s.speed>1)this.closeCharge();
        this.prev=Object.assign({},s);
    }
    // SOC-only log also captures a rise across head-unit sleep. Energy is an estimate.
    soc(soc,now,speed,capacity) {
        if(!num(soc)||soc<0||soc>100)return;
        const st=this.st,prev=st.lastSoc,moving=num(speed)&&speed>3;
        const close=()=>{
            const s=st.session;st.session=null;
            if(s&&s.to-s.from>=this.minPct)append(st.log,Object.assign({},s,{kwh:num(capacity)?(s.to-s.from)*capacity/100:null}),200);
        };
        if(num(prev)) {
            if(soc>prev+.3 && now-(st.lastSocT||now)>ASLEEP && soc>=(st.session?st.session.from:prev)+this.minPct) {
                if(!st.session)st.session={from:prev,fromT:st.lastSocT};
                st.session.to=soc;st.session.toT=now;if(moving)close();
            } else if(soc>prev+.3&&num(speed)&&speed>=0&&speed<=1) {
                if(!st.session)st.session={from:prev,fromT:st.lastSocT||now};
                st.session.to=soc;st.session.toT=now;
            } else if(st.session&&(soc<st.session.to-2||moving))close();
        }
        st.lastSoc=soc;st.lastSocT=now;
    }
    view(){return this.st;}
}
function demoHistory(now) {
    const day=86400000;
    const charges=[0,1].map(n=>({start:now-(2-n)*day,end:now-(2-n)*day+2400000,seconds:2400,
        from:20,to:80,kwh:42.5-n,peak:145-n*15,partial:false,era:0,
        points:Array.from({length:13},(_,i)=>({t:now-(2-n)*day+i*200000,soc:20+i*5,kw:(145-n*15)*(1-i*.052),temp:22+i*.65,segment:0}))}));
    const log=Array.from({length:16},(_,i)=>({from:12+(i*23)%40,to:80,fromT:now-(17-i)*day-3600000,toT:now-(17-i)*day,kwh:(80-12-(i*23)%40)*.6771}));
    return {charges,log};
}
module.exports={ChargeHistory,demoHistory};
