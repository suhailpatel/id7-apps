'use strict';
const {number}=require('./decode');
// Import only the matching installation's migration packet, never its private files.
function importLegacy(st,packet,sourceId,now) {
    if(st.legacyImported||!packet||packet.version!==1||packet.source!=='ixdrive'||packet.sourceId!==sourceId
        ||packet.demo!==false||!number(packet.t)||now<packet.t||now-packet.t>30000||!packet.history)return false;
    const h=packet.history;
    const soc=v=>number(v)&&v>=0&&v<=100;
    const time=v=>number(v)&&v>0&&v<=now;
    const log=(Array.isArray(h.log)?h.log:[]).slice(-200).concat(h.session?[Object.assign({},h.session,{kwh:null,partial:true})]:[])
        .filter(c=>c&&soc(c.from)&&soc(c.to)&&c.to-c.from>=1&&time(c.fromT)&&time(c.toT)&&c.toT>=c.fromT)
        .map(c=>({from:c.from,to:c.to,fromT:c.fromT,toT:c.toT,kwh:number(c.kwh)&&c.kwh>=0?c.kwh:null,
            partial:!!c.partial,source:sourceId}));
    const charges=(Array.isArray(h.charges)?h.charges:[]).slice(-20).concat(h.charge?[Object.assign({},h.charge,{partial:true})]:[])
        .filter(c=>c&&time(c.start)&&time(c.end)&&c.end>=c.start&&number(c.seconds)&&c.seconds>=30
            &&number(c.kwh)&&c.kwh>=0&&number(c.peak)&&c.peak>=0&&Array.isArray(c.points))
        .map(c=>({start:c.start,end:c.end,seconds:c.seconds,kwh:c.kwh,peak:c.peak,
            from:soc(c.from)?c.from:null,to:soc(c.to)?c.to:null,partial:!!c.partial,source:sourceId,
            era:sourceId+':'+(number(c.era)?c.era:0),points:c.points.slice(-240)
                .filter(p=>p&&time(p.t)&&p.t>=c.start&&p.t<=c.end&&number(p.kw)&&p.kw>=0)
                .map(p=>({t:p.t,soc:soc(p.soc)?p.soc:null,kw:p.kw,temp:number(p.temp)?p.temp:null,segment:number(p.segment)?p.segment:0}))}));
    if(!log.length&&!charges.length)return false;
    st.log=log.concat(st.log||[]).sort((a,b)=>a.toT-b.toT).slice(-200);
    st.charges=charges.concat(st.charges||[]).sort((a,b)=>a.start-b.start).slice(-20);
    st.legacyImported={sourceId,t:now};return true;
}
module.exports={importLegacy};
