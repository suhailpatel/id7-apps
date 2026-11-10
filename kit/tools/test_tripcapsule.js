'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {boot,env,run}=require('./app_test_harness');
const DAY=86400000,T=Date.UTC(2026,10,10),checks=[];
const test=(name,run)=>checks.push([name,run]);
const {Capsules,packet}=require('../../apps/tripcapsule/model');
const journey=(start=T)=>({start,end:start+60000,km:1,kwh:.2,regen:.04,seconds:60,ambientSum:10000,ambientN:1000,era:0});
test('Trip Capsule preserves annotations, deduplicates and updates live trips to completed',()=>{
    const s={},m=new Capsules(s),j=journey();m.ingest(packet({journey:j},T),T);const id=s.cards[0].id;
    m.label(id);m.star(id);m.ingest(packet({journey:j},T+1000),T+1000);assert.strictEqual(s.cards.length,1);
    m.ingest(packet({journeys:[{...j,km:2,end:T+120000}]},T+2000),T+2000);
    assert.strictEqual(s.cards[0].km,2);assert(!s.cards[0].live);assert(s.cards[0].star);assert.strictEqual(s.cards[0].label,'Commute');
    const restart=new Capsules(JSON.parse(JSON.stringify(s)));assert.strictEqual(restart.list(true).length,1);
    restart.ingest(packet({journey:j},T+3000),T+3000);assert.strictEqual(restart.state.cards[0].km,2);
});
test('Trip Capsule rejects demo, stale, future and malformed transport; retention is bounded',()=>{
    const m=new Capsules();const p=packet({journeys:[journey()]},T);
    for(const bad of [{...p,demo:true},{...p,t:T-16000},{...p,t:T+2000},{...p,source:'unknown'},{...p,version:2}])assert(!m.ingest(bad,T));
    m.ingest(packet({journeys:[{...journey(),km:null}]},T),T);assert.strictEqual(m.list().length,0);
    for(let i=0;i<210;i++)m.ingest(packet({journeys:[journey(T+i*DAY)]},T),T);
    assert.strictEqual(m.list().length,200);
});

test('Trip Capsule UI imports cards, persists labels/favourites, isolates demo and survives restarts',async()=>{
    env.now=T;env.shared=packet({journeys:[journey()]},env.now);const b=await boot('tripcapsule');
    assert((await b.draw()).includes('1.0'));await b.clicks.BTN_LABEL();await b.clicks.BTN_STAR();
    const file=path.join(b.dir,'capsules.json'),saved=fs.readFileSync(file,'utf8');assert(JSON.parse(saved).cards[0].star);
    b.set('demo','on');await b.clicks.BTN_LABEL();await b.clicks.BTN_STAR();b.exit();assert.strictEqual(fs.readFileSync(file,'utf8'),saved);
    env.shared={...env.shared,demo:true};b.set('demo','off');assert((await b.draw()).includes('SAVED CARDS'));
    const r=await boot('tripcapsule',{},b.dir);assert((await r.draw()).includes('Commute'));assert((await r.draw()).includes('RECORDED JOURNEY · FAVOURITE'));
    await r.clicks.BTN_FILTER();assert((await r.draw()).includes('Commute'));r.exit();
});
test('Trip Capsule empty, favourites and imperial layouts render without invented values',async()=>{
    env.shared=null;const b=await boot('tripcapsule');assert((await b.draw()).includes('Your journeys, collected.'));
    await b.clicks.BTN_FILTER();assert((await b.draw()).includes('No favourites yet'));
    b.set('demo','on');b.set('distUnit','mi');b.set('tempUnit','f');const text=await b.draw();
    assert(text.includes('mi recorded'));assert(!text.some(s=>/NaN|Infinity/.test(s)));b.exit();
});
run(checks);
