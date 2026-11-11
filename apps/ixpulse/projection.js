'use strict';
const {ClusterRender}=require('./cluster_render_client');
const {Canvas}=require('./kit/canvas');
const Draw=require('./draw');
const {number}=require('./model');
const TARGETS={hud:'hud',cluster:'panel'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const styleFor=(settings,key)=>key==='cluster'?Draw.styleName(settings.get('clusterStyle')):'compact';
function placement(settings,key) {
    const n=(suffix,fallback)=>{const v=settings.get(key+suffix);return number(v)?v:fallback;};
    const dim=Draw.dimensions(styleFor(settings,key)),k=clamp(n('Size',100),75,125)/100,w=Math.round(dim.w*k),h=Math.round(dim.h*k);
    // Preserve the compact overlay's saved position; wider styles grow about
    // its centre so switching layouts does not shift the whole display right.
    return {x:clamp(n('X',key==='hud'?200:760)-Math.round((dim.w-Draw.WIDTH)*k/2),0,(key==='hud'?800:1920)-w),
        y:clamp(n('Y',key==='hud'?100:330)-Math.round((dim.h-Draw.HEIGHT)*k/2),0,(key==='hud'?480:720)-h),w,h};
}
function createProjection(ctx,Client=ClusterRender,clock=Date.now) {
    let client=null,states={hud:'Off',cluster:'Off'},layers={},errors={},blocked={};
    function drop(key) {if(client&&layers[key])client.drop(layers[key].ref);delete layers[key];}
    function close() {Object.keys(layers).forEach(drop);if(client){client.close();client.removeAllListeners();client=null;}}
    function connect() {
        client=new Client(ctx.spec.id);
        client.on('disconnected',()=>{Object.keys(layers).forEach(drop);errors={};blocked={};});
        client.on('target',(name,state,holder,reason,guideDisabled,disabled)=>{
            Object.keys(TARGETS).forEach(key=>{if(TARGETS[key]===name){
                if(disabled){blocked[key]=true;drop(key);states[key]='Display guard disabled';}
            }});
        });
        client.on('layer',(ref,state)=>Object.keys(layers).forEach(key=>{if(layers[key].ref===ref){
            layers[key].state=state==='shown'?'Shown':state==='error'?'Display error':state;
            if(state==='error')errors[key]=true;
        }}));
        client.on('refused',(op,ref)=>Object.keys(layers).forEach(key=>{if(layers[key].ref===ref){errors[key]=true;states[key]='Display refused';drop(key);}}));
        client.connect();
    }
    function update(d,active,navReason) {
        const wanted={},now=clock();
        Object.keys(TARGETS).forEach(key=>{
            const mode=ctx.settings.get(key);
            let reason='';
            if(mode!=='on'&&mode!=='test'){reason='Off';delete errors[key];}
            else if(d.demo)reason='Demo: centre screen only';
            else if(!active)reason='Paused while parked';
            else if(mode==='test'&&(!number(d.kmh)||d.kmh>1))reason='Pattern needs fresh parked speed';
            else if(key==='hud'&&navReason)reason=navReason;
            else if(mode==='on'&&!number(d.kw)&&!number(d.soc)&&!number(d.kmh)&&!d.limit&&!number(d.rangeKm)&&!d.gear)reason='Waiting for car';
            if(reason){states[key]=reason;drop(key);}else wanted[key]=mode;
        });
        if(!Object.keys(wanted).length){close();return;}
        if(!client)connect();
        Object.keys(wanted).forEach(key=>{
            if(!client.ready){states[key]='Waiting for Cluster renderer';return;}
            const expected=key==='hud'?'hud:800x480':'panel:1920x720';
            if(client.backend!=='id7'||String(client.targets).split(',').indexOf(expected)<0){states[key]='Display target unavailable';drop(key);return;}
            if(blocked[key]||errors[key]){states[key]=blocked[key]?'Display guard disabled':'Display error (switch off to retry)';drop(key);return;}
            const style=styleFor(ctx.settings,key),dim=Draw.dimensions(style);
            const rect=placement(ctx.settings,key),place=JSON.stringify(rect);
            if(layers[key]&&(layers[key].iw!==dim.w||layers[key].ih!==dim.h))drop(key);
            if(!layers[key]){
                const ref=client.image(Object.assign({target:TARGETS[key],klass:'overlay',exclusive:false,contend:false,
                    guide_hold:false,iw:dim.w,ih:dim.h,fps:2,sampling:'bilinear'},rect));
                if(!ref){errors[key]=true;states[key]='Display refused';return;}
                layers[key]={ref,place,iw:dim.w,ih:dim.h,key:null,state:'Waiting for display'};
            }
            const layer=layers[key];
            if(place!==layer.place){client.set(layer.ref,rect);layer.place=place;}
            const detail=style==='compact'?null:Draw.details(d,ctx.settings.get('speedUnit'),ctx.settings.get('tempUnit'),ctx.settings.get('clusterDetail'));
            const signature=JSON.stringify([style,detail,d.averagePartial,ctx.settings.get('typeface'),d.kw===null?null:Math.round(d.kw),d.soc===null?null:Math.round(d.soc),d.kmh,d.gear,d.limit,d.flow,d.rangeKm,d.averageKwh100Km,d.navigation,ctx.settings.get('speedUnit'),ctx.settings.get('palette'),wanted[key]]);
            if(layer.key!==signature){
                // Notifications can arrive much faster than the display rate. Gate drawing
                // as well as uploads; eligibility/drop checks above always run immediately.
                if(layer.paintedAt!==undefined&&now>=layer.paintedAt&&now-layer.paintedAt<500)return;
                const cv=Draw.draw(new Canvas(dim.w,dim.h),d,ctx.settings.get('palette'),wanted[key]==='test',ctx.settings.get('speedUnit'),style,ctx.settings.get('typeface'),detail);
                const pixels=Buffer.from(cv.d.buffer,cv.d.byteOffset,cv.d.length);
                // Only changed rows travel across the renderer socket; unchanged frames send nothing.
                const stride=dim.w*4;
                let first=0,last=dim.h-1;
                if(layer.pixels){
                    while(first<dim.h&&pixels.slice(first*stride,(first+1)*stride).equals(layer.pixels.slice(first*stride,(first+1)*stride)))first++;
                    while(last>=first&&pixels.slice(last*stride,(last+1)*stride).equals(layer.pixels.slice(last*stride,(last+1)*stride)))last--;
                }
                if(first<=last)client.pixels(layer.ref,layer.pixels?[{x:0,y:first,w:dim.w,h:last-first+1}]:null,pixels.slice(first*stride,(last+1)*stride));
                layer.pixels=pixels;layer.key=signature;layer.paintedAt=now;
            }
            states[key]=layer.state;
        });
    }
    return {update,close,status:key=>states[key]};
}
module.exports={createProjection,placement};
