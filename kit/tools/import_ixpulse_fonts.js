'use strict';
// Convert two pinned bimmer-lab atlases; no font rasterizer is needed on the car.
// Usage: node kit/tools/import_ixpulse_fonts.js /path/to/bimmer-lab-apps-checkout
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const root=process.argv[2];
if(!root)throw new Error('Supply the bimmer-lab/apps source checkout');
const revision='e212b4cb8dc09eec9d2ad5e806e949ec0a0a12da';
const sources=[
    ['barlow','apps/idrive_hud_widgets/hud/fonts/hero.json','50bf474aa0110cbf419dbe7a7895bf740f4154aa1cc4c5a78d7e2469baac7cd6'],
    ['michroma','apps/cluster_themes/hud/fonts/s_speed.json','f89e368bace5769811c114788d2cdb88884dc6a9269fff1d4a3639c14d6ff911']
];
const out=path.resolve(__dirname,'../../apps/ixpulse/typefaces');fs.mkdirSync(out,{recursive:true});
for(const [name,file,expected] of sources){
    const raw=fs.readFileSync(path.join(root,file)),hash=crypto.createHash('sha256').update(raw).digest('hex');
    if(hash!==expected)throw new Error('Source font differs from pinned revision: '+file);
    const j=JSON.parse(raw),alpha=Buffer.from(j.alpha,'base64'),glyphs={};
    if(alpha.length!==j.width*j.height)throw new Error('Invalid source atlas');
    Object.keys(j.glyphs).forEach(ch=>{const g=j.glyphs[ch];glyphs[ch.codePointAt(0)]=[g.x,g.y,g.w,g.h,g.ox,-j.baseline,g.advance];});
    const definition={family:'ixpulse-'+name,cacheKey:hash,source:j.source,
        provenance:'https://github.com/bimmer-lab/apps/blob/'+revision+'/'+file,license:'SIL OFL 1.1; see NOTICE',
        sizes:[{size:j.size,ascent:j.baseline,descent:j.cellHeight-j.baseline,
            atlasW:j.width,atlasH:j.height,glyphs,alpha:zlib.deflateSync(alpha,{level:9}).toString('base64')}]};
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(definition)+'\n');
}
