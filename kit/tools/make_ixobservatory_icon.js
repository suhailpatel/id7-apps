'use strict';
// Component-map icon, rendered with the toolkit canvas.
const fs=require('fs'),path=require('path');
const {Canvas}=require('../runtime/canvas');
const c=new Canvas(140,140),white='#ffffff',cyan='#48d9ed',blue='#7da8ff';
c.strokeRoundRect(38,12,64,116,22,4,white);
for(const y of [35,91]){c.roundRect(28,y,7,22,3,white);c.roundRect(105,y,7,22,3,white);}
c.strokeRoundRect(49,48,42,44,6,3,cyan);
for(let i=0;i<3;i++)c.roundRect(55+i*11,57,6,25,2,cyan);
c.line(50,33,90,33,4,blue);c.roundRect(54,104,32,9,4,white);
fs.writeFileSync(path.resolve(__dirname,'../../apps/ixobservatory/icon.png'),c.png());
