#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/local-relations/current'),frozen=path.join(root,'verification/local-relations/iteration-07-before-representative-atlas');
const current=require('./export_publication.cjs'),old=require(path.join(frozen,'implementation/tools/export_publication.cjs'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),snapshot=JSON.parse(fs.readFileSync(path.join(frozen,'snapshot.json')));
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(hash(path.join(frozen,'implementation',file)),digest);
const implementations=['tools/representative_atlas.cjs','tools/export_publication.cjs','tools/audit_representative_atlas.cjs',...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f)];
const implementation=Object.fromEntries(implementations.map(file=>[file,hash(path.join(root,file))]));
const rows=[];
for(const name of ['EquivalentSteps','MixedSteps','ConditionalSteps','UnknownSteps','AliasPartitionSteps','MutableSteps']){
  const file=path.join(out,'structural-repeats',name+'.json'),ir=JSON.parse(fs.readFileSync(file)),original=JSON.stringify(ir),result={};
  for(const [version,exporter]of [['before',old],['current',current]]){
    const dir='representative-atlas/'+name+'-'+version,m=exporter.exportAtlas(ir,path.join(out,dir),{textQA:true});
    assert.equal(JSON.stringify(ir),original);result[version]={directory:dir,manifest_sha256:hash(path.join(out,dir,'manifest.json')),panels:m.panels.length,complete:m.complete,quality_pass:m.quality_pass,
      represented_goals:m.expression_goals.filter(g=>g.coverage_methods?.includes('structural-representative')).length,boundary_goals:m.expression_goals.filter(g=>g.kind==='instance-boundary').length,
      min_font_pt:Math.min(...m.panels.map(p=>p.quality.min_print_font_pt)),unfulfilled_goals:m.unfulfilled_goals};
  }
  rows.push({name,ir:'structural-repeats/'+name+'.json',ir_sha256:hash(file),...result});console.log(JSON.stringify(rows.at(-1)));
}
const limitedDir='representative-atlas/limited',limited=current.exportAtlas(JSON.parse(fs.readFileSync(path.join(out,'structural-repeats/EquivalentSteps.json'))),path.join(out,limitedDir),{maxPanels:1,textQA:true});
assert.equal(limited.complete,false);assert.ok(limited.unfulfilled_goals.length);
for(const [file,digest]of Object.entries(implementation))assert.equal(hash(path.join(root,file)),digest);
const directories=rows.flatMap(r=>[r.before.directory,r.current.directory]).concat(limitedDir),artifacts={};
for(const dir of directories)for(const file of fs.readdirSync(path.join(out,dir)).filter(f=>/\.(svg|json)$/.test(f)))artifacts[dir+'/'+file]=hash(path.join(out,dir,file));
const report={schema:'representative-atlas-audit/1',implementation_sha256:implementation,frozen_snapshot_sha256:hash(path.join(frozen,'snapshot.json')),artifacts_sha256:artifacts,rows,
  limited:{directory:limitedDir,manifest_sha256:hash(path.join(out,limitedDir,'manifest.json')),complete:limited.complete,unfulfilled_goals:limited.unfulfilled_goals},
  scope:'Same source IR, automatic shared internal computation panels plus direct concrete boundary goals. Development inputs; no runtime execution or full-goal claim.'};
fs.writeFileSync(path.join(out,'representative-atlas-report.json'),JSON.stringify(report,null,2)+'\n');
const digest=hash(path.join(out,'representative-atlas-report.json')),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=[];
for(const name of ['EquivalentSteps','MixedSteps']){
  const row=rows.find(r=>r.name===name),m=JSON.parse(fs.readFileSync(path.join(out,row.current.directory,'manifest.json')));
  for(const p of m.panels.filter(p=>p.representative?.structural_group))cards.push(`<article data-case="${esc(name+' '+p.label)}"><h2>${esc(name)} · ${esc(p.label)}</h2><p>${row.before.panels} → ${row.current.panels} panels · ${p.quality.min_print_font_pt} pt · ${p.quality.line_geometry.crossings} crossings</p>${fs.readFileSync(path.join(out,row.current.directory,p.svg),'utf8')}</article>`);
}
fs.writeFileSync(path.join(out,'representative-atlas-review.html'),`<!doctype html><html><meta charset="utf-8"><meta name="representative-atlas-report-sha256" content="${digest}"><title>Automatic structural representatives</title><style>body{font:16px Arial;margin:20px}.panels{display:flex;gap:16px}article{flex:1;min-width:0;border:1px solid #bbb;padding:12px}h2{font-size:17px}svg{width:100%;height:620px}</style><h1>Shared local computation; concrete boundaries remain direct</h1><p>Exact instance positions are printed. Structure does not imply parameter/output equality.</p><div class="panels">${cards.join('')}</div></html>`);
