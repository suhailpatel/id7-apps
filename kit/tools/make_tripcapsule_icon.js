'use strict';
// Source artwork for this app tile, using the toolkit's own canvas renderer.
const fs=require('fs'),path=require('path');
const {Canvas}=require('../runtime/canvas');
const root=path.resolve(__dirname,'../..'),white='#ffffff',cyan='#39d9f9';
const trip=new Canvas(140,140);
trip.strokeRoundRect(26,22,94,90,12,5,white);trip.strokeRoundRect(16,32,94,90,12,5,cyan);
trip.line(32,94,50,70,5,white);trip.line(50,70,72,85,5,white);trip.line(72,85,93,55,5,white);
trip.circle(32,94,6,cyan);trip.circle(93,55,6,cyan);
fs.writeFileSync(path.join(root,'apps/tripcapsule/icon.png'),trip.png());
