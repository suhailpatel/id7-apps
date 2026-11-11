'use strict';
const path=require('path'),fonts=require('./kit/fonts'),pack=require('./kit/pack');
const data=pack.open(path.join(__dirname,'typefaces')),loaded={};
function family(choice) {
    if(choice!=='barlow'&&choice!=='michroma')return 'num';
    const name='ixpulse-'+choice;
    if(!loaded[choice]){fonts.register(name,data.json(choice+'.json'));loaded[choice]=true;}
    return name;
}
// Fit the whole speed to its reserved width. Never clip or abbreviate a digit,
// and keep the units, limit sign and gear outside this box.
function speed(cv,text,x,y,size,color,align,width,choice) {
    const opts={font:family(choice),align:align||'left'};
    const measured=cv.textWidth(text,size,opts);
    cv.text(text,x,y,measured>width?size*width/measured:size,color,opts);
}
module.exports={family,speed};
