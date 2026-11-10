'use strict';
// Source artwork for this app tile, using the toolkit's own canvas renderer.
const fs=require('fs'),path=require('path');
const {Canvas}=require('../runtime/canvas');
const root=path.resolve(__dirname,'../..'),white='#ffffff',cyan='#39d9f9';
const tyre=new Canvas(140,140);
tyre.arc(70,70,43,52,0,360,white);tyre.arc(70,70,22,27,0,360,cyan);
for(let i=0;i<5;i++){const a=i*Math.PI*2/5;tyre.line(70+Math.sin(a)*28,70+Math.cos(a)*28,70+Math.sin(a)*41,70+Math.cos(a)*41,5,white);}
tyre.circle(70,70,8,white);
fs.writeFileSync(path.join(root,'apps/tyrewatch/icon.png'),tyre.png());
