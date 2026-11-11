'use strict';
const {decode,number}=require('./decode');
// Only read-data requests (0x22). Candidate layouts come from iXDrive, not G08 validation.
function createCollector({diag,config,model,clock=Date.now,enabled=()=>true}) {
    let user=clock(),move=-Infinity,busy=false,epoch=0,nextPoll=-Infinity;
    const failures={},retryAt={},picked={};
    const active=()=>enabled() && (clock()-user<600000 || clock()-move<180000);
    const touch=()=>{user=clock();};
    const motion=raw=>{if(number(raw)&&raw>=0&&raw<65535&&raw*.015625>1&&raw*.015625<=300)move=clock();};
    function reset() {epoch++;nextPoll=-Infinity;model.clear();for(const k of Object.keys(retryAt))delete retryAt[k];for(const k of Object.keys(failures))delete failures[k];}
    async function poll() {
        if(busy||!active()||!diag.available||clock()<nextPoll)return;
        busy=true;nextPoll=clock()+5000;const generation=epoch;
        try {
            for(const [key,list] of Object.entries(config.groups)) {
                if(!active()||generation!==epoch)break;
                if(clock()<(retryAt[key]||0)||!list.length)continue;
                let result=null,source=null;
                for(let offset=0;offset<list.length;offset++) {
                    if(!active()||generation!==epoch)break;
                    const index=((picked[key]||0)+offset)%list.length,c=list[index],did=parseInt(c.did,16);
                    const accept=r=>r && (r[0]===0x62 && ((r[1]<<8)|r[2])===did || r[0]===0x7f && r[1]===0x22);
                    let reply=null;
                    try {reply=await diag.physical(c.ecu==null?config.ecu:c.ecu,0x22,[did>>8,did&255],c.timeoutMs||1000,accept,
                        {maxRetries:0,pendingTimeoutMs:1500,callTimeoutMs:2000});}catch(_){}
                    if(!active()||generation!==epoch)break;
                    result=decode(reply,c);
                    if(result) {source=c.did;picked[key]=index;break;}
                }
                if(!active()||generation!==epoch)break;
                if(key==='hvI'&&result&&number(result.a))result.a*=config.powerSign<0?-1:1;
                model.put(key,result,clock(),source);
                if(result)failures[key]=0;
                else if((failures[key]=(failures[key]||0)+1)>=3){retryAt[key]=clock()+60000;failures[key]=0;}
            }
            if(active()&&generation===epoch)model.record(clock());
        } finally {busy=false;}
    }
    return {poll,touch,motion,active,reset};
}
module.exports={createCollector};
