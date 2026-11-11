'use strict';
// Charging-station icon drawn with the existing toolkit canvas.
const fs=require('fs'),path=require('path'),{Canvas}=require('../runtime/canvas');
const c=new Canvas(140,140),white='#ffffff',green='#2fd27a';
c.strokeRoundRect(24,18,66,106,12,4,white);
c.strokeRoundRect(35,30,44,43,6,3,green);
c.line(59,38,47,53,5,green);c.line(47,53,65,53,5,green);c.line(65,53,54,67,5,green);
c.line(90,47,105,47,4,white);c.line(105,47,116,62,4,white);
c.line(116,62,116,102,4,white);c.line(116,102,105,111,4,white);c.line(105,111,90,100,4,white);
c.roundRect(107,43,15,23,4,green);c.line(39,99,75,99,4,white);c.line(17,125,98,125,4,white);
fs.writeFileSync(path.resolve(__dirname,'../../apps/ixcharge/icon.png'),c.png());
