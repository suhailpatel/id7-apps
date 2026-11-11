'use strict';
const path=require('path'),cp=require('child_process');
const result=cp.spawnSync('python3',[path.join(__dirname,'test_store.py')],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status===0?0:1;
