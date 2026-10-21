'use strict';
// Ignored full-IR documents can be rebuilt on a fresh checkout. Verify the
// exact committed capture hashes before making them available to the audit.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=root+'/verification/header-reflow/current/',cache='/tmp/archcanvas-residual-bands-before-0dcab92';
const snapshot=JSON.parse(fs.readFileSync(root+'/verification/residual-bands/current/snapshot.json'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(cache+'/'+path.basename(f)),h);
const report=JSON.parse(fs.readFileSync(cache+'/large-report.json')),R=require('./load_publication_renderer.cjs')(cache);
for(const row of report.rows){
 const capture=row.results.find(r=>r.suffix==='current'),keys=['svg','document'];
 for(const k of keys)if(fs.existsSync(out+capture[k]))assert.equal(sha(out+capture[k]),capture[k+'_sha256']);
 if(keys.every(k=>fs.existsSync(out+capture[k])))continue;
 console.log('REBUILD frozen '+row.name);assert.equal(sha(root+'/'+row.input),row.input_sha256);
 const r=R.render(JSON.parse(fs.readFileSync(root+'/'+row.input)),row.state);
 const outputs={svg:r.svg,document:JSON.stringify(r.document)};
 for(const k of keys){assert.equal(crypto.createHash('sha256').update(outputs[k]).digest('hex'),capture[k+'_sha256']);
  if(!fs.existsSync(out+capture[k]))fs.writeFileSync(out+capture[k],outputs[k]);}
}
console.log('Frozen baseline captures verified');
