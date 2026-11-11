'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas } = require('../runtime/canvas');

const canvas = new Canvas(140, 140);
const white = '#ffffff';
const cyan = '#52dced';
canvas.strokeRoundRect(30, 24, 80, 99, 13, 4, white);
canvas.roundRect(49, 15, 42, 20, 7, white);
canvas.line(48, 83, 62, 98, 7, cyan);
canvas.line(62, 98, 93, 62, 7, cyan);
fs.writeFileSync(path.resolve(__dirname, '../../apps/ixservice/icon.png'), canvas.png());
