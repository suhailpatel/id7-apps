'use strict';
// iX Cluster's 140 x 140 icon: two cluster dials (speed white, power cyan with its needle) on black.
const fs=require('fs'),path=require('path');
const {Canvas}=require('../runtime/canvas');
const c=new Canvas(140,140).clear('#080c12');
c.arc(40,72,24,28,-135,135,'#ffffff',{aa:true});
c.arc(100,72,24,28,-135,135,'#2a3542',{aa:true});
c.arc(100,72,24,28,-135,30,'#46daf2',{aa:true});
c.line(40,72,54,58,4,'#ffffff');
c.line(100,72,117,79,4,'#46daf2');
c.circle(40,72,4,'#ffffff');c.circle(100,72,4,'#46daf2');
c.line(14,112,126,112,3,'#ffffff');
fs.writeFileSync(path.resolve(__dirname,'../../apps/ixcluster/icon.png'),c.png());
