'use strict';
const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const R=require('./load_publication_renderer.cjs')('./semantic_studio');
const out='verification/composition-rounds/current/',round=Number(process.argv[2]),sha=s=>crypto.createHash('sha256').update(fs.readFileSync(s)).digest('hex');
const row=JSON.parse(fs.readFileSync('verification/call-boundaries/current/Transformer-F0-report.json')).rows[0];
const ir=JSON.parse(fs.readFileSync(row.input)),raw=JSON.stringify(ir),state={...row.results[1].state,paperComposition:'architecture',...(round>=4?{paperDirection:'up'}:{})};
const r=R.render(ir,state);assert.equal(raw,JSON.stringify(ir));
const svg='round'+round+'.svg',document='round'+round+'.layout.json';fs.writeFileSync(out+svg,r.svg);fs.writeFileSync(out+document,JSON.stringify(r.document));
const hashes=Object.fromEntries(fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')).map(f=>['semantic_studio/'+f,sha('semantic_studio/'+f)]));
const report={round,input:row.input,input_sha256:sha(row.input),state,svg,document,svg_sha256:sha(out+svg),document_sha256:sha(out+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
 quality:r.prepared.quality,implementation_sha256:hashes,goal_complete:false};
fs.writeFileSync(out+'round'+round+'-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({round,nodes:report.nodes,edges:report.edges,...r.prepared.quality}));
