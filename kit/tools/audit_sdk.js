'use strict';
// Offline audit only: SDK/application code runs against fake clocks, files and transport.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'../..'),kit=path.join(root,'kit/runtime');
const sdk=path.join(root,'oap-sdk/source');
const capture=process.argv[2] && path.resolve(process.argv[2]);
const catalogFile=capture ? path.join(capture,'etc/oap/someip/someip-interfaces.json') : path.join(root,'reference/someip-interfaces.json');
if(!fs.existsSync(path.join(sdk,'src/core/CurrentVehicleUnitsTypesConverters.js'))) {
 console.error('Local extracted SDK required in oap-sdk/. It is intentionally not committed.');process.exit(2);
}
const converters=require(path.join(sdk,'src/core/CurrentVehicleUnitsTypesConverters'));
const defaults=require(path.join(sdk,'config/base.json.js'));
const {Tyres}=require(path.join(root,'apps/tyrewatch/model'));
const unitResults=[];
for(const p of ['BAR','KPA','PSI','DEFAULT','SIGNAL_UNGUELTIG'])for(const t of ['C','F','DEFAULT','SIGNAL_UNGUELTIG']) {
 const input={unitOfMeasurementAirPressure:p,unitOfMeasurementTemperature:t};
 const sdkValue=converters.someipVehicleUnitsToTsVehicleUnits(input),m=new Tyres();m.setUnits(input);
 assert.strictEqual(m.units.p&&{BAR:'bar',KPA:'kPa',PSI:'psi'}[m.units.p]||undefined,sdkValue.pressureUnit);
 assert.strictEqual(m.units.t||undefined,sdkValue.temperatureUnit);unitResults.push(input);
}
function load(file,overrides,globals={}) {
 const module={exports:{}},local=req=>Object.prototype.hasOwnProperty.call(overrides,req)?overrides[req]:
  req.startsWith('./kit/')?require(path.join(kit,req.slice(6))):req.startsWith('.')?require(path.resolve(path.dirname(file),req)):require(req);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),Object.assign({module,exports:module.exports,require:local,__dirname:path.dirname(file),__filename:file,Buffer,console,setImmediate,clearImmediate,process},globals),{filename:file});return module.exports;
}
const quiet={info(){},warn(){},error(){},debug(){},verbose(){}};
const flush=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));};
(async()=>{
 const calls=[],timers=[],native={init:async()=>{},subscribeToAvailability:()=>{},isAvailable:()=>true,
  subscribe:async options=>{calls.push({kind:'subscribe',name:options.name});},getValue:async(name,timeout)=>{calls.push({kind:'get',name,timeout});return {};}};
 const config={fields:{reading:{getter:{id:1},event:{id:2}}}};
 const runtime=load(path.join(kit,'signals.js'),{fs:{readFileSync:()=>JSON.stringify(config)},someip:{buildProxy:async(c,instance)=>{calls.push({kind:'build',instance});return native;}}},{setInterval:(fn,ms)=>{timers.push({fn,ms});}});
 let active=true;
 await runtime.watch('audit.Service','1',{reading:()=>{}},quiet,{pollMs:10000,shouldRead:()=>active});await flush();
 const startupGets=calls.filter(c=>c.kind==='get').length;
 // Parked gate must stop the timer while leaving subscriptions available.
 active=false; timers[0].fn();await flush();
 const parkedGets=calls.filter(c=>c.kind==='get').length-startupGets;
 const sdkCalls=[];
 class SdkError extends Error {static reject(msg){return Promise.reject(new SdkError(msg));}}
 const sdkProxy=Object.assign({},native,{getValue:async(name,timeout)=>{sdkCalls.push({kind:'get',name,timeout});return {};},subscribe:async o=>sdkCalls.push({kind:'subscribe',name:o.name})});
 const builders=load(path.join(sdk,'src/someip/someipBuilders.js'),{
  '../config/config':{get:k=>k==='someip.proxyAvailabilityTimeoutMs'?1000:'someipInterfaces'},
  '../errors/SDKError':SdkError,'../logging/logging':{getLogger:()=>({getContext:()=>({})}),getContextLogger:()=>quiet},
  '../utils/fileAccess':{readJsonFile:async()=>config},'../utils/npmUtils':{getModulePathSync:()=>'/audit/source'},
  someip:{buildProxy:async(c,instance)=>{sdkCalls.push({kind:'build',instance});return sdkProxy;}}
 });
 const proxy=await builders.buildTypedProxy('audit.Service','1');await proxy.init();await proxy.reading.getValue(3000);await proxy.reading.subscribe(()=>{});
 for(const kind of ['build','get','subscribe'])assert.deepStrictEqual(calls.find(c=>c.kind===kind),sdkCalls.find(c=>c.kind===kind));
 let now=Date.UTC(2026,10,11),timeoutList=[],settings={demo:'off',slowPoll:5};
 const samples=[],L={speed:60,speedT:now,soc:60,socT:now,climate:false,seats:{},wheel:false,batt:{avg:25,min:24,max:26},battT:now,ambient:10,ambientT:now};
 class Clock extends Date {static now(){return now;}}
 const fakeFs={readFileSync(){throw new Error('no saved state');},writeFileSync(){}};
 let failVoltage=false;
 const reader={raws:{},key:c=>c.did,read:async c=>{
  if(c.did==='DD68'&&failVoltage)return null;
  reader.raws[c.did]={bytes:'62 '+c.did.slice(0,2)+' '+c.did.slice(2)+' 00 00'};return c.did==='DD68'?400:-50;
 }};
 const start=load(path.join(root,'apps/ixdrive/live.js'),{fs:fakeFs},{Date:Clock,process:{on(){}},
  setTimeout:(fn,ms)=>{const t={fn,ms};timeoutList.push(t);return t;},clearTimeout:t=>{timeoutList=timeoutList.filter(x=>x!==t);},setInterval:()=>0});
 const live=start({dataDir:'/audit',spec:{config:{battery:{powerSign:-1,fast:{hvV:[{did:'DD68',fields:{v:{}}}],hvI:[{did:'DD69',fields:{a:{}}}]},slow:{}}}},settings:{get:k=>settings[k],onChange(){}},log:quiet},
  {diag:{available:true,on(){}},reader,exclusive:fn=>fn(),live:L,active:()=>true,page:()=> 'main',onSample:s=>samples.push(s)});
 const fire=async()=>{const t=timeoutList.find(t=>t.ms===2000);assert(t);timeoutList=timeoutList.filter(x=>x!==t);await t.fn();await flush();};
 await fire();failVoltage=true;now+=30000;L.speedT=now;L.socT=now;await fire();
 const oldVoltageSample=samples[samples.length-1];
 for(let i=0;i<2;i++){now+=2000;L.speedT=now;L.socT=now;await fire();}
 const oldVoltageEnergy=live.energySample().kwh;
 const {Recorder}=require(path.join(kit,'record')),theme=require(path.join(kit,'themes')).theme('ice');
 now+=3600000;
 const hourOld=live.draw('battery',new Recorder(1600,520),theme);
 // Two real collectors: no SDK-derived numeric schemas are available for their identifiers.
 const paths=[];function walk(d){for(const n of fs.readdirSync(d)){const f=path.join(d,n);if(fs.statSync(f).isDirectory())walk(f);else paths.push(f);}}walk(sdk);
 const source=paths.map(f=>fs.readFileSync(f,'utf8')).join('\n');
 const apps=fs.readdirSync(path.join(root,'apps')).filter(n=>fs.existsSync(path.join(root,'apps',n,'app.json'))).map(n=>require(path.join(root,'apps',n,'app.json')));
 const fields=Array.from(new Set(apps.reduce((a,s)=>a.concat(Object.values(s.signals||{}).reduce((b,f)=>b.concat(Object.keys(f).filter(k=>!k.startsWith('_'))),[])),[])));
 let catalogEvidence=null;
 if(fs.existsSync(catalogFile)) {
  const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));let declarations=0;
  for(const app of apps)for(const [name,fields] of Object.entries(app.signals||{})) {
   const service=catalog.interfaces[name];assert(service,app.id+' missing '+name);
   const instances=catalog.instanceIDs[name]||{};
   if(name==='com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu')
    assert.strictEqual(instances.SystemFunctionsInternalTasuInst1,128,'diagnostic instance');
   else assert(Object.values(instances).includes(1),name+' missing instance 1');
   for(const [name,flags] of Object.entries(fields)) {
    if(name==='_methods'||name==='_broadcasts') {
     for(const f of flags)assert((service[name==='_methods'?'methods':'events']||{})[f],f);
    } else if(!name.startsWith('_')) {
     const field=service.fields[name];assert(field,name);
     if(flags.includes('r'))assert(field.getter&&field.getter.id,name+' getter');
     if(flags.includes('s'))assert(field.notifier,name+' notifier');
     assert(catalog.datatypes[field.dataRef],name+' wrapper');declarations++;
    }
   }
  }
  const unitField=catalog.interfaces['de.bmw.infotainment.vehicle.Vehicle'].fields.statusNewCurrentUnitsStatusExt;
  const members=catalog.datatypes[unitField.dataRef].members;
  for(const [field,wanted] of [['unitOfMeasurementAirPressure',{BAR:1,KPA:2,PSI:3}],['unitOfMeasurementTemperature',{C:1,F:2}]]) {
   const ref=members.find(m=>m.name===field).dataRef,items=catalog.datatypes[ref].items;
   for(const [label,n] of Object.entries(wanted))assert.strictEqual(items[label],n);
  }
  catalogEvidence={interfaces:Object.keys(catalog.interfaces).length,appSignalDeclarationsChecked:declarations,
   allDeclaredMethodsFieldsPermissionsAndInstancesMatch:true,numericTyreUnitEnumsMatch:true,
   physicalScalingAndBatteryDiagnosticDefinitionsValidated:false};
 }
 const report={sdkVersion:require(path.join(root,'oap-sdk/package.json')).version,sdkSourceFiles:paths.length,
  nativeCallConventionMatchesSdk:true,symbolicUnitCasesMatched:unitResults.length,
  sdkDefaultInstances:{vehicle:defaults.someip.instances.vehicleService,vehicle2:defaults.someip.instances.vehicle2,environment:defaults.someip.instances.environmentalInformation},
  declaredFieldNamesMentionedInExtractedSdk:fields.filter(f=>source.includes(f)),declaredFieldNamesAbsentFromExtractedSdk:fields.filter(f=>!source.includes(f)),
  localMasterCatalogPresent:fs.existsSync(catalogFile),catalogEvidence,
  reproductions:{getterCallsWhileParked:parkedGets,newPowerUsing30SecondOldVoltage:oldVoltageSample.kw,
   energyIntegratedFromOldVoltageKwh:oldVoltageEnergy,ambientAfterOneHour:hourOld.ambient,batteryTemperatureFallbackAfterOneHour:hourOld.carT},
  vehicleValidation:'Not performed; fake transport confirms software behaviour only.'};
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
