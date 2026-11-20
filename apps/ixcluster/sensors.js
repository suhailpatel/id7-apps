'use strict';
/**
 * sensors.js - what a readout slot can show (both apps). Only values the car really sends us (hud.js reads them);
 * nothing is made up. A layout names its slots ("slots": [{ id, where, default }]) and its text widgets show
 *   {{slot:<id>}}      the value            {{slotHead:<id>}}   the name, upper case (the box's heading)
 *   {{slotUnit:<id>}}  the unit, upper case {{slotSuffix:<id>}} '°' for temperatures, else nothing
 *   {{slotHeadU:<id>}} the name and, unless the value carries a °, its unit ("FUEL %": a slot with no unit box)
 *   {{slotHeadS:<id>}} the short name where a theme has less room ("short", else the name: M's slot rows)
 * The pick per layout and slot is kept in <data>/slots.json (hud.js slotSensor / setSlot).
 *
 * Each sensor: id, name (the page), cat (the page's chips), head (upper case, the cluster's heading fonts), tok (a
 * hud.js token, the value; digits, '.', ':' and '-' only, so it fits every value font), unit(us) (upper case).
 * Plain Node 8 (the car's 8.16.2).
 */
// iX Cluster: the iX3's own readouts in place of Cluster Themes' engine ones (evtokens.js holds the values)
const CATS = ['Battery', 'Drive', 'Temps', 'Tyres'];
const T = (us) => (us ? '°F' : '°C');
const P = (us) => (us ? 'PSI' : 'BAR');

const LIST = [
    { id: 'kw', name: 'Battery power (+ out)', cat: 'Battery', head: 'POWER', tok: 'kw', unit: () => 'KW' },
    { id: 'regenKw', name: 'Regen (power in)', cat: 'Battery', head: 'REGEN', tok: 'regenKw', unit: () => 'KW' },
    { id: 'pwrPct', name: 'Power, % of the scale', cat: 'Battery', head: 'POWER', tok: 'pwrPct', unit: () => '%' },
    { id: 'kwPeak', name: 'Peak power this run', cat: 'Battery', head: 'PEAK', tok: 'kwPeak', unit: () => 'KW' },
    { id: 'soc', name: 'Charge level', cat: 'Battery', head: 'CHARGE', tok: 'soc', unit: () => '%' },
    { id: 'range', name: 'Electric range', cat: 'Battery', head: 'RANGE', tok: 'range', unit: (us) => (us ? 'MI' : 'KM') },
    { id: 'speed', name: 'Speed', cat: 'Drive', head: 'SPEED', tok: 'speed', unit: (us) => (us ? 'MPH' : 'KM/H') },
    { id: 'avgSpeed', name: 'Average speed this drive', cat: 'Drive', head: 'AVERAGE', tok: 'avgSpeed', unit: (us) => (us ? 'MPH' : 'KM/H') },
    { id: 'gLat', name: 'Cornering g', cat: 'Drive', head: 'LAT G', tok: 'gLat', unit: () => 'G' },
    { id: 'gLong', name: 'Braking / accel g', cat: 'Drive', head: 'LONG G', tok: 'gLong', unit: () => 'G' },
    { id: 'time', name: 'Clock', cat: 'Drive', head: 'TIME', tok: 'time', unit: null },
    { id: 'batt', name: 'Battery temperature', cat: 'Temps', head: 'BATTERY', short: 'BATT', tok: 'batt', unit: T, suffix: '°' },
    { id: 'ambient', name: 'Outside temperature', cat: 'Temps', head: 'OUTSIDE', tok: 'ambientN', unit: T, suffix: '°' },
    { id: 'tyrePFL', name: 'Tyre pressure, front left', cat: 'Tyres', head: 'FL', tok: 'tyreP:FL', unit: P },
    { id: 'tyrePFR', name: 'Tyre pressure, front right', cat: 'Tyres', head: 'FR', tok: 'tyreP:FR', unit: P },
    { id: 'tyrePRL', name: 'Tyre pressure, rear left', cat: 'Tyres', head: 'RL', tok: 'tyreP:RL', unit: P },
    { id: 'tyrePRR', name: 'Tyre pressure, rear right', cat: 'Tyres', head: 'RR', tok: 'tyreP:RR', unit: P },
    { id: 'tyreTFL', name: 'Tyre temperature, front left', cat: 'Tyres', head: 'FL', tok: 'tyreT:FL', unit: T, suffix: '°' },
    { id: 'tyreTFR', name: 'Tyre temperature, front right', cat: 'Tyres', head: 'FR', tok: 'tyreT:FR', unit: T, suffix: '°' },
    { id: 'tyreTRL', name: 'Tyre temperature, rear left', cat: 'Tyres', head: 'RL', tok: 'tyreT:RL', unit: T, suffix: '°' },
    { id: 'tyreTRR', name: 'Tyre temperature, rear right', cat: 'Tyres', head: 'RR', tok: 'tyreT:RR', unit: T, suffix: '°' },
];
const BY_ID = {};
LIST.forEach((s) => { BY_ID[s.id] = s; });

module.exports = { CATS, LIST, get: (id) => BY_ID[id] || null };
