'use strict';
const {decodeDart,decodeEvents}=require('./nav-decode');
const EVENT_IFACE='de.bmw.infotainment.navigation.guiding.GuidanceEventList';
const DIRECTIONS={STRAIGHT_ON:['straight','Continue'],LEFT:['left','Turn left'],RIGHT:['right','Turn right'],
    SLIGHT_LEFT:['left','Bear left'],SLIGHT_RIGHT:['right','Bear right'],HARD_LEFT:['left','Sharp left'],HARD_RIGHT:['right','Sharp right'],
    UTURN_LEFT:['uturn','Make a U-turn'],UTURN_RIGHT:['uturn','Make a U-turn']};
function instruction(m) {
    if(!m||m.unreliable)return null;
    let pair=null;
    if(m.kind==='turn')pair=DIRECTIONS[m.dir];
    if(m.kind==='branch') {
        const left=['BRANCH_LEFT','FORK_LEFT','TRIPLE_FORK_LEFT','HIGHWAY_OUT_LEFT','HIGHWAY_IN_LEFT'];
        const right=['BRANCH_RIGHT','FORK_RIGHT','TRIPLE_FORK_RIGHT','HIGHWAY_OUT_RIGHT','HIGHWAY_IN_RIGHT'];
        if(left.indexOf(m.dir)>=0)pair=['left',m.dir.indexOf('HIGHWAY_OUT')===0?'Exit left':'Keep left'];
        if(right.indexOf(m.dir)>=0)pair=['right',m.dir.indexOf('HIGHWAY_OUT')===0?'Exit right':'Keep right'];
        if(['HIGHWAY_IN_STRAIGHT','HIGHWAY_OUT_STRAIGHT','FORK_STRAIGHT','TRIPLE_FORK_STRAIGHT','OVERPASS','UNDERPASS'].indexOf(m.dir)>=0)pair=['straight','Continue'];
    }
    if(m.kind==='keep'||m.kind==='lanechange')pair=m.dir==='LEFT'?['left','Keep left']:m.dir==='RIGHT'?['right','Keep right']:null;
    if(m.kind==='roundabout'&&m.exit)pair=['roundabout','Exit '+m.exit];
    if(m.kind==='destination')pair=['arrival',m.flag===false?'Stopover':'Destination'];
    if(!pair)return null;
    return {arrow:pair[0],text:pair[1],distance:m.dist&&m.unit?m.dist+' '+m.unit:'',road:(m.road||'').slice(0,160)};
}
class Navigation {
    constructor(){this.epoch=0;this.clear();}
    clear(){this.values={};this.turns={};this.epoch++;this.since=null;this.yielded=false;}
    changed(now){this.epoch++;this.turns={};this.since=now;}
    put(key,value,now){
        const old=this.values[key];
        if(!old||old.value!==value){this.epoch++;this.turns={};this.since=now;this.yielded=false;}
        this.values[key]={value,t:now};
    }
    route(now){
        const v={};
        for(const key of ['state','provider','carplay','android']){
            const r=this.values[key];
            if(!r||now<r.t||now-r.t>15000)return {reason:'Navigation status unavailable'};
            v[key]=r.value;
        }
        const state=typeof v.state==='number'?['INACTIVE','CALCULATING_ROUTE','ACTIVE'][v.state]:v.state;
        const provider=typeof v.provider==='number'?['NONE','CAR_PLAY','ANDROID_AUTO','CAR_LIFE','OTHER'][v.provider]:v.provider;
        if(['INACTIVE','CALCULATING_ROUTE','ACTIVE'].indexOf(state)<0||['NONE','CAR_PLAY','ANDROID_AUTO','CAR_LIFE','OTHER'].indexOf(provider)<0||
            typeof v.carplay!=='boolean'||typeof v.android!=='boolean')return {reason:'Navigation status unavailable'};
        if(v.carplay&&v.android||provider==='CAR_PLAY'&&v.android||provider==='ANDROID_AUTO'&&v.carplay)return {reason:'Navigation sources disagree'};
        if(v.carplay)return {source:'phone',provider:'CAR_PLAY'};
        if(v.android)return {source:'phone',provider:'ANDROID_AUTO'};
        if(provider!=='NONE')return {reason:'Waiting for navigation provider'};
        if(state==='CALCULATING_ROUTE')return {reason:'Calculating route'};
        return state==='ACTIVE'?{source:'bmw',provider:'BMW'}:{idle:true};
    }
    dart(raw,now,epoch){if(epoch!==undefined&&epoch!==this.epoch)return;this.turns.bmw={data:instruction(decodeDart(raw)),t:now};}
    events(raw,now,epoch){
        if(epoch!==this.epoch)return;
        const r=decodeEvents(raw);
        // Do not skip an unknown first manoeuvre and accidentally draw a later turn.
        this.turns.phone={data:r.ok?instruction(r.events[0]):null,t:now};
    }
    view(now){
        const r=this.route(now);
        if(r.reason){this.yielded=true;return {turn:null,text:r.reason,hudReason:r.reason};}
        if(r.idle){this.yielded=false;return {turn:null,text:'No active route',hudReason:''};}
        const t=this.turns[r.source],turn=t&&now>=t.t&&now-t.t<=3000?t.data:null;
        // Allow the first read to arrive before releasing the HUD slot. Once yielded,
        // stay out for this route; reclaiming can park behind BMW's guidance card.
        if(!turn&&(this.since===null||now-this.since>=3000))this.yielded=true;
        return {turn,text:turn?'':'Directions unavailable',hudReason:this.yielded?'Yielding to BMW guidance':''};
    }
    reason(now){const r=this.route(now);return r.reason|| (r.idle?'':'Yielding to navigation');}
}
function query(){return {viewConfigs:[{viewport:{startPoint:{anchorPoint:{standardReferencePoint:'CCP'},offsets:[]},
    maxElementCount:6,endPoints:[],includedTypes:['INCLUDE_ACTIVE_MANEUVERS','INCLUDE_ALONG_MAIN_ROAD','INCLUDE_DESTINATIONS']},
    options:[],minimumUpdateIntervalMs:1000,segmentItemRasterLength:100}]};}
function createReader(signals,nav,enabled,clock=Date.now){
    let proxy=null,busy=false,next=0,failures=0,stopped=false;
    const allowed=()=>!stopped&&enabled()&&nav.route(clock()).source==='phone';
    async function poll(){
        if(busy||!allowed()||clock()<next||!signals.proxy||!signals.call)return;
        busy=true;next=clock()+1000;const epoch=nav.epoch;
        try{
            if(!proxy)proxy=await signals.proxy(EVENT_IFACE,'Main_Instance');
            if(stopped){if(proxy&&proxy.shutdown)Promise.resolve(proxy.shutdown()).catch(()=>{});proxy=null;return;}
            if(!allowed()||epoch!==nav.epoch)return;
            const reply=await signals.call(proxy,'queryContent',query(),900);
            if(allowed()&&epoch===nav.epoch){nav.events(reply,clock(),epoch);failures=0;}
        }catch(e){
            failures++;next=clock()+(failures>=5?30000:failures>=2?2000:1000);
            if(failures>=5){if(proxy&&proxy.shutdown)Promise.resolve(proxy.shutdown()).catch(()=>{});proxy=null;}
        }finally{busy=false;}
    }
    function stop(){stopped=true;if(proxy&&proxy.shutdown)Promise.resolve(proxy.shutdown()).catch(()=>{});proxy=null;}
    return {poll,stop};
}
module.exports={Navigation,createReader,instruction,query};
