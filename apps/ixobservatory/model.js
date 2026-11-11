'use strict';
const number=v=>typeof v==='number' && Number.isFinite(v);
function value(bytes,f,at=0) {
    const n=f.bytes||1,off=at+(f.at||0);
    if(n<1 || n>4 || off<0 || off+n>bytes.length) return null;
    let raw=0;
    for(let i=0;i<n;i++) {const b=bytes[off+i];if(!Number.isInteger(b)||b<0||b>255)return null;raw=raw*256+b;}
    if(f.signed && raw>=2**(n*8-1))raw-=2**(n*8);
    const v=raw*(f.factor==null?1:f.factor)+(f.offset||0);
    return !number(v)||(number(f.min)&&v<f.min)||(number(f.max)&&v>f.max)?null:v;
}
function decode(reply,c) {
    const did=parseInt(c.did,16);
    if(!reply || reply.length<4 || reply[0]!==0x62 || reply[1]!==did>>8 || reply[2]!==(did&255))return null;
    const bytes=Array.from(reply).slice(3);
    if(c.array) {
        const n=c.array.bytes||1;
        if(bytes.length%n || bytes.length/n>512)return null;
        const cells=[];for(let at=0;at<bytes.length;at+=n)cells.push(value(bytes,c.array,at));
        const valid=cells.filter(number);if(!valid.length||valid.length<cells.length/2)return null;
        return {cells,min:Math.min(...valid),max:Math.max(...valid),avg:valid.reduce((a,b)=>a+b,0)/valid.length};
    }
    const out={};
    for(const [k,f] of Object.entries(c.fields||{}))out[k]=value(bytes,f);
    if(!Object.values(out).some(number))return null;
    if(number(out.min)&&number(out.max)&&(out.min>out.max || number(out.avg)&&(out.avg<out.min||out.avg>out.max)))return null;
    return out;
}
class Observatory {
    constructor() {this.readings={};this.history=[];this.lastPoint=null;}
    clear() {this.readings={};this.history=[];this.lastPoint=null;}
    put(key,data,t,source) {this.readings[key]={data,t,source};}
    get(key,now,ttl=30000) {
        const r=this.readings[key];return r && now>=r.t && now-r.t<=ttl ? r.data : null;
    }
    snapshot(now) {
        const v=this.get('hvV',now,15000),a=this.get('hvI',now,15000),cellT=this.get('cellT',now),cellV=this.get('cellV',now);
        const volts=v&&v.v,amps=a&&a.a;
        const synced=v&&a&&Math.abs(this.readings.hvV.t-this.readings.hvI.t)<=5000;
        const coolant=this.get('coolant',now),motor=this.get('motor',now),soc=this.get('soc',now),ambient=this.get('ambient',now);
        return {volts:number(volts)?volts:null,amps:number(amps)?amps:null,
            kw:synced&&number(volts)&&number(amps)?volts*amps/1000:null,
            soc:soc&&number(soc.pct)?soc.pct:null,pack:cellT&&number(cellT.avg)?cellT.avg:null,
            minTemp:cellT&&number(cellT.min)?cellT.min:null,maxTemp:cellT&&number(cellT.max)?cellT.max:null,
            coolant:coolant&&number(coolant.t)?coolant.t:null,motor:motor&&number(motor.t)?motor.t:null,
            ambient:ambient&&number(ambient.t)?ambient.t:null,cells:cellV&&cellV.cells||[],
            minV:cellV&&number(cellV.min)?cellV.min:null,maxV:cellV&&number(cellV.max)?cellV.max:null,
            spread:cellV&&number(cellV.min)&&number(cellV.max)?(cellV.max-cellV.min)*1000:null};
    }
    record(now) {
        if(this.lastPoint!==null && now-this.lastPoint<5000)return;
        const d=this.snapshot(now),p={t:now};
        // Each chart point belongs to an actual new reading, not repeated cached data.
        const keys={pack:'cellT',coolant:'coolant',motor:'motor',ambient:'ambient'};
        for(const [name,key] of Object.entries(keys)) {
            const r=this.readings[key];p[name]=r && (this.lastPoint===null||r.t>this.lastPoint) ? d[name] : null;
        }
        this.history.push(p);this.lastPoint=now;
        this.history=this.history.filter(p=>now-p.t<=3600000).slice(-720);
    }
    segments(key,now,minutes) {
        const parts=[];let part=[];let prev=null;
        for(const p of this.history.filter(p=>now-p.t<=minutes*60000 && p.t<=now)) {
            if(!number(p[key]) || prev!==null && p.t-prev>15000) {if(part.length)parts.push(part);part=[];}
            if(number(p[key]))part.push([(p.t-now)/60000,p[key]]);
            prev=p.t;
        }
        if(part.length)parts.push(part);return parts;
    }
}
function demo(now) {
    const m=new Observatory();
    for(let i=0;i<120;i++) {
        const t=now-(119-i)*5000,s=i/119;
        m.history.push({t,pack:17+10*s+Math.sin(s*5)*.5,coolant:15+9*s,motor:null,ambient:12+Math.sin(s*3)});
    }
    m.put('hvV',{v:389},now,'demo');m.put('hvI',{a:72},now,'demo');m.put('soc',{pct:64},now,'demo');
    m.put('cellT',{min:25.1,avg:26.5,max:27.8},now,'demo');m.put('coolant',{t:24},now,'demo');
    m.put('ambient',{t:12.1},now,'demo');
    const cells=Array.from({length:96},(_,i)=>3.91+Math.sin(i*1.7)*.006);cells[17]=3.897;cells[73]=3.923;
    m.put('cellV',{cells,min:Math.min(...cells),max:Math.max(...cells)},now,'demo');
    return m;
}
module.exports={Observatory,decode,number,demo};
