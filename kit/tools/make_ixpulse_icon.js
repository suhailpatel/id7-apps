'use strict';
const fs=require('fs'),path=require('path');
const {Canvas}=require('../runtime/canvas');
const c=new Canvas(140,140).clear('#080c12');
c.strokeRoundRect(10,25,120,90,18,3,'#ffffff');
c.line(22,76,43,76,5,'#67e8ae');c.line(43,76,58,51,5,'#67e8ae');
c.line(58,51,76,96,5,'#46daf2');c.line(76,96,94,61,5,'#46daf2');c.line(94,61,117,61,5,'#46daf2');
fs.writeFileSync(path.resolve(__dirname,'../../apps/ixpulse/icon.png'),c.png());
