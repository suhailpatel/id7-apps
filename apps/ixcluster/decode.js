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
module.exports={decode,number};
