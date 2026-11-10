'use strict';
const num=v=>typeof v==='number' && Number.isFinite(v);
const LABELS=['Unlabelled','Commute','Weekend','Road trip','School run','Errands','Day out'];
function clean(j,live) {
    if(!j || !num(j.start) || !num(j.end) || j.start<=0 || j.end<j.start || !num(j.km) || j.km<0 ||
        !num(j.seconds) || j.seconds<0 || !num(j.kwh) || !num(j.regen) || j.regen<0) return null;
    const era=Number.isInteger(j.era) && j.era>=0?j.era:0;
    const ambient=num(j.ambientSum) && num(j.ambientN) && j.ambientN>0 ? j.ambientSum/j.ambientN : null;
    return {id:era+':'+j.start,start:j.start,end:j.end,km:j.km,kwh:j.kwh,regen:j.regen,seconds:j.seconds,
        ambient:num(ambient)&&ambient>=-50&&ambient<=60?ambient:null,partial:!!j.partial,era,live:!!live};
}
// Shared transport contains metrics only; personal labels remain in this app's data folder.
function packet(history,now) {
    return {version:1,t:now,source:'ixdrive',demo:false,
        journeys:(history.journeys||[]).slice(-200),journey:history.journey||null};
}
class Capsules {
    constructor(state={}) {
        this.state=state;
        state.cards=Array.isArray(state.cards)?state.cards.filter(j=>j && typeof j.id==='string' && num(j.start) && num(j.end) && num(j.km) && num(j.kwh) && num(j.seconds)).slice(-200):[];
        this.connected=false;
    }
    ingest(data,now) {
        this.connected=false;
        if(!data || data.version!==1 || data.source!=='ixdrive' || data.demo!==false || !num(data.t) ||
            data.t>now+1000 || now-data.t>15000 || !Array.isArray(data.journeys) || data.journeys.length>200) return false;
        const incoming=data.journeys.map(j=>clean(j,false)).filter(Boolean);
        const live=clean(data.journey,true);if(live)incoming.push(live);
        const map=new Map(this.state.cards.map(j=>[j.id,j]));
        for(const j of incoming) {
            const prev=map.get(j.id);
            // Never regress a completed record to a delayed live snapshot.
            if(prev && (!prev.live && j.live || prev.end>j.end)) continue;
            map.set(j.id,Object.assign({},j,{label:prev&&LABELS.includes(prev.label)?prev.label:LABELS[0],star:!!(prev&&prev.star)}));
        }
        this.state.cards=Array.from(map.values()).sort((a,b)=>a.start-b.start).slice(-200);
        this.connected=true;return true;
    }
    list(stars=false) {return this.state.cards.filter(j=>!stars || j.star).slice().reverse();}
    label(id) {const j=this.state.cards.find(j=>j.id===id);if(j) j.label=LABELS[(Math.max(0,LABELS.indexOf(j.label))+1)%LABELS.length];}
    star(id) {const j=this.state.cards.find(j=>j.id===id);if(j)j.star=!j.star;}
}
function demo(now) {
    const m=new Capsules();
    m.ingest(packet({journeys:Array.from({length:8},(_,i)=>({start:now-(8-i)*86400000,end:now-(8-i)*86400000+2280000,
        km:24+i*3.5,kwh:4.5+i*.6,regen:.7+i*.1,seconds:2280,ambientSum:(9+i)*1000,ambientN:1000,partial:i===2,era:0}))},now),now);
    m.state.cards.forEach((j,i)=>{j.label=LABELS[1+i%6];j.star=i%3===0;});return m;
}
module.exports={Capsules,LABELS,clean,packet,demo};
