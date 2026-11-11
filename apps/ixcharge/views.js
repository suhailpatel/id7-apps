 'use strict';
// Charging canvases moved from iXDrive; keep the established gauge style.
const G=require('./kit/gauges'),{withAlpha}=require('./kit/canvas');
const {plural}=require('./kit/i18n'),{chargeEstimate}=require('./ev');
const GO='#2fd27a',LOSS=1.1;
module.exports=function createViews(settings,cfg,redraw) {
    let chargeOffset=0,logOffset=0;
    const browseHistory=(kind,step)=>{if(kind==='lab')chargeOffset=Math.max(0,chargeOffset+step);else logOffset=Math.max(0,logOffset+step);return redraw();};
    const num=(v,n,u)=>G.isNum(v)?G.fmt(v,n)+(u?' '+u:''):'--';
    const T=c=>G.isNum(c)?settings.get('tempUnit')==='f'?c*1.8+32:c:null;
    const tU=()=>settings.get('tempUnit')==='f'?'°F':'°C';
    const pad=n=>(n<10?'0':'')+n;
    const shortDate=ms=>{const d=new Date(ms);return pad(d.getDate())+'.'+pad(d.getMonth()+1);};
    const dateOf=ms=>{const d=new Date(ms);return shortDate(ms)+'  '+pad(d.getHours())+':'+pad(d.getMinutes());};
    const price=()=>settings.get('price')||0;
    const money=kwh=>G.isNum(kwh)&&price()>0?(kwh*LOSS*price()).toFixed(2)+' €':null;
    function row(cv,t,x,w,y,label,value,col) {
        cv.text(label,x,y,22,t.dim,{font:'bold',spacing:1.2});
        cv.text(value,x+w,y,26,col||(value==='--'?t.dim:t.text),{font:'bold',align:'right'});
    }
        function renderCharging(cv, t, d) {
            const target = Number(settings.get('chargeTarget'));
            const capacity = { kwh: d.capacity, source: d.source };
            const c = chargeEstimate(d.soc, target, (G.isNum(d.capacity) ? d.capacity / 100 : null),
                d.kw, d.speed);
            G.panel(cv, t, 24, 44, 744, 468, 'Charging estimate');
            G.panel(cv, t, 792, 44, 784, 468, 'Battery energy');
            const kw = d.kw, speed = d.speed;
            const charging = G.isNum(kw) && kw < -0.3 && G.isNum(speed) && speed <= 1;
            const status = charging ? 'CHARGING' : !G.isNum(d.soc) ? 'WAITING FOR CHARGE LEVEL'
                : !c ? 'LEARNING CAPACITY' : c.reached ? 'TARGET REACHED' : 'NO ACTIVE CHARGE DETECTED';
            cv.text(status, 48, 128, 26, charging ? GO : t.dim, { font: 'bold' });
            const value = cv.text(charging ? G.fmt(-kw, 1) : '--', 48, 248, 96, t.text, { font: 'num' });
            cv.text('kW', 60 + value, 248, 32, t.dim, { font: 'bold' });
            row(cv, t, 48, 696, 328, 'ESTIMATE TARGET', G.fmt(target, 0) + ' %');
            row(cv, t, 48, 696, 396, 'AT CURRENT POWER', c && c.minutes !== null ? '~' + Math.ceil(c.minutes) + ' min' : '--');
            cv.text('Charging slows near full; time is an estimate.', 48, 464, 22, t.dim);
            row(cv, t, 816, 736, 144, 'CHARGE LEVEL', num(d.soc, 1, '%'));
            row(cv, t, 816, 736, 222, 'ENERGY TO TARGET', c ? '~' + num(c.remaining, 1, 'kWh') : '--');
            row(cv, t, 816, 736, 300, 'USABLE CAPACITY', num(capacity.kwh, 1, 'kWh'));
            cv.text('Battery-side power; charger losses are excluded.', 816, 378, 21, t.dim);
            cv.text('The target here does not change the car setting.', 816, 420, 21, t.dim);
            cv.text(G.isNum(capacity.kwh) ? 'Capacity source: ' + capacity.source : 'Learning usable capacity while you drive.', 816, 464, 20, t.dim);
        }

        function renderLog(cv, t, d) {
            const all = d.history.log || [];
            const kwhOf = (c) => (G.isNum(c.kwh) ? c.kwh : 0);

            // ---- list, newest first
            const ex = G.panel(cv, t, 24, 44, 1040, 468, 'Charge log' + (all.length ? '  (' + all.length + ')' : '')).h - 468;
            logOffset=G.clamp(logOffset,0,Math.max(0,all.length-1)); cv.scroll=all.length>8;
            G.button(cv,t,780,54,120,38,'Newer',()=>browseHistory('log',-8),{key:'log-newer',busy:!logOffset});
            G.button(cv,t,916,54,120,38,'Older',()=>browseHistory('log',8),{key:'log-older',busy:logOffset+8>=all.length});
            // room below the page: another row where a whole one fits, the rest spread over the rows
            const nRows = 8 + Math.floor(ex / 43), rowP = 43 + (ex - (nRows - 8) * 43) / nRows;
            const cols = [48, 260, 440, 680, 900];
            ['DATE', 'ADDED', 'FROM - TO', 'ENERGY', price() > 0 ? 'EST. COST' : ''].forEach((h, i) => cv.text(h, cols[i], 121, 22, t.dim, { font: 'bold', spacing: 1 }));
            cv.fillRect(48, 133, 992, 1, t.panelEdge);
            if (!all.length) {
                const ny = Math.round(ex / 2);
                cv.text('No charges logged yet.', 544, 284 + ny, 32, t.dim, { align: 'center', font: 'bold' });
                cv.text('Every charge of ' + cfg.chargeMinPct + ' % or more shows up here,', 544, 330 + ny, 26, t.dim, { align: 'center' });
                cv.text('also overnight charges.', 544, 366 + ny, 26, t.dim, { align: 'center' });
            }
            all.slice().reverse().slice(logOffset,logOffset+nRows).forEach((c, i) => {
                const y = Math.round(174 + i * rowP);
                if (i % 2 === 0) cv.roundRect(40, y - 28, 1008, 38, 8, withAlpha(t.track, 0.55));
                const add = c.to - c.from;
                cv.text(dateOf(c.toT), cols[0], y, 24, t.text, { font: 'label' });
                cv.text('+' + add.toFixed(0) + ' %', cols[1], y, 26, GO, { font: 'bold' });
                cv.text(Math.round(c.from) + ' - ' + Math.round(c.to) + ' %', cols[2], y, 24, t.dim, { font: 'label' });
                cv.text(G.isNum(c.kwh) ? c.kwh.toFixed(1) + ' kWh' : '-', cols[3], y, 24, t.text, { font: 'label' });
                const m = money(c.kwh);
                if (m) cv.text(m, cols[4], y, 24, t.text, { font: 'label' });
            });

            if (all.some(c => c.source)) cv.text('Includes imported iXDrive history', 1040, 502 + ex, 16, t.dim, { align: 'right' });

            // ---- totals + 14-day chart
            G.panel(cv, t, 1088, 44, 488, 468, 'Totals');
            const now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const month = all.filter((c) => c.toT >= monthStart);
            const sum = (list) => list.reduce((a, c) => a + kwhOf(c), 0);
            const block = (y, label, list) => {
                cv.text(label, 1112, y, 22, t.dim, { font: 'bold', spacing: 1 });
                const complete = list.every(c => G.isNum(c.kwh));
                const kw = cv.text(complete ? sum(list).toFixed(1) : '--', 1112, y + 52, 48, t.text, { font: 'num' });
                cv.text('kWh', 1120 + kw, y + 52, 24, t.dim);
                if (!complete) cv.text('Energy incomplete', 1112, y + 76, 16, t.dim);
                const m = complete ? money(sum(list)) : null;
                if (m) cv.text(m, 1552, y + 52, 30, t.text, { align: 'right', font: 'bold' });
                cv.text(list.length + ' ' + plural(list.length, 'charge', 'charges'), 1552, y, 22, t.dim, { align: 'right' });
            };
            block(116, 'THIS MONTH', month);
            block(208, 'SAVED', all);
            // kWh per day, last 14 days
            const day = 86400000, today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const days = [];
            for (let i = 13; i >= 0; i--) days.push(sum(all.filter((c) => c.toT >= today0 - i * day && c.toT < today0 - (i - 1) * day)));
            const top = Math.max(4, Math.max.apply(null, days));
            // (taller into the room below the page; its label then ends G.MARGIN over the panel's bottom, as the list's rows)
            const dg = G.toMargin(ex, 9), gx = 1112, gy = 470 + dg, gh = 132 + dg, bw = 440 / 14;
            cv.text('KNOWN KWH PER DAY, 14 DAYS', gx, 318, 22, t.dim, { font: 'bold', spacing: 1 });
            days.forEach((v, i) => {
                const h = v > 0 ? Math.max(6, v / top * gh) : 0;
                cv.roundRect(gx + i * bw + 3, gy - gh, bw - 6, gh, 4, withAlpha(t.track, 0.6));
                if (h) cv.rampRect(gx + i * bw + 3, gy - h, bw - 6, h, 4, t.ramp || [t.accent]);
            });
            cv.text('today', gx + 440, gy + 28, 22, t.dim, { align: 'right' });
        }

        function renderChargeLab(cv,t,d) {
            const history = d.history, all = history.charges.concat(history.charge ? [history.charge] : []);
            chargeOffset=G.clamp(chargeOffset,0,Math.max(0,all.length-1));
            const current = all[all.length-1-chargeOffset], older = all[all.length-2-chargeOffset];
            const previous = older && current && older.era === current.era ? older : null;
            cv.scroll=all.length>1;
            const ex = G.panel(cv,t,24,44,960,468,'Charging power by charge level').h-468;
            G.button(cv,t,704,54,120,38,'Newer',()=>browseHistory('lab',-1),{key:'charge-newer',busy:!chargeOffset});
            G.button(cv,t,840,54,120,38,'Older',()=>browseHistory('lab',1),{key:'charge-older',busy:chargeOffset+1>=all.length});
            const series=[];
            [previous,current].forEach((c,index) => {
                if (!c) return;
                let pts=[], segment=null;
                const flush=()=>{ if(pts.length) series.push({pts,color:index?GO:t.dim,width:index?4:2}); pts=[]; };
                c.points.forEach(p=>{
                    if (!G.isNum(p.soc) || p.segment!==segment) flush();
                    segment=p.segment;
                    if(G.isNum(p.soc)) pts.push([p.soc,p.kw]);
                }); flush();
            });
            const top=Math.max(25,Math.ceil(Math.max(...[previous,current].filter(Boolean).map(c=>c.peak),0)/25)*25);
            cv.text(current ? (current===history.charge ? 'LIVE SESSION' : shortDate(current.start)) : 'NO SESSION YET',48,125,22,GO,{font:'bold'});
            cv.text(previous ? 'GREY · '+shortDate(previous.start) : '',960,125,20,t.dim,{align:'right'});
            const chart=G.chart(cv,t,48,155,912,280+ex,{xMin:0,xMax:100,yMin:0,yMax:top,xStep:20,xUnit:'%',yUnit:'kW',series,
                empty:series.length ? '' : 'Waiting for charging power and charge level'});
            series.forEach(s=>s.pts.forEach(p=>cv.circle(chart.X(p[0]),chart.Y(p[1]),3,s.color)));
            cv.text('Battery-side power · gaps stay separate',48,488+ex,20,t.dim);
            G.panel(cv,t,1008,44,568,468,'Observed session');
            row(cv,t,1032,520,139,'CHARGE',current ? num(current.from,0,'%')+' - '+num(current.to,0,'%'):'--');
            row(cv,t,1032,520,205,'ENERGY ADDED',current ? num(current.kwh,2,'kWh'):'--');
            row(cv,t,1032,520,271,'PEAK POWER',current ? num(current.peak,0,'kW'):'--');
            row(cv,t,1032,520,337,'RECORDED TIME',current ? num(current.seconds/60,1,'min'):'--');
            const temps=current ? current.points.map(p=>p.temp).filter(G.isNum) : [];
            row(cv,t,1032,520,403,'PACK TEMPERATURE',temps.length ? num(T(Math.min(...temps)),0,'')+' - '+num(T(Math.max(...temps)),0,tU()):'--');
            cv.text(!current ? 'Records automatically while charging.' : current.source ? 'Imported from iXDrive · observed intervals' : current.partial ? 'PARTIAL · telemetry interrupted' : 'Observed while the app is awake',1032,484+ex,22,t.dim);
        }

    return {draw(page,cv,t,d){[renderCharging,renderLog,renderChargeLab][page](cv,t,d);},browse:browseHistory};
};
