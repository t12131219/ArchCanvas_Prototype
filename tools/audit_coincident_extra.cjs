'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/coincident-ports/current',out=root+'/'+folder,read=f=>JSON.parse(fs.readFileSync(root+'/'+f));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),load=require('./load_publication_renderer.cjs');
const R=load(root+'/semantic_studio'),B=load('/tmp/archcanvas-coincident-ports-before-e9e6b8a'),report=read(folder+'/small-report.json'),rows=[],comparisons=[];
for(const [f,h]of Object.entries(report.implementation_sha256))assert.equal(sha(root+'/'+f),h);
const specs=[{name:'MixedChoices',input:'verification/consumer-arguments/current/MixedChoices.json'},
 {name:'EscapingChain',input:folder+'/EscapingChain.json',extra:{paperEmptyBandCompaction:false}}];
for(const spec of specs){const ir=read(spec.input),state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id),...spec.extra};
 const a=B.render(ir,state),b=R.render(ir,state);assert.equal(R.render(ir,{...state,paperCoincidentPorts:false}).svg,a.svg);
 if(spec.name==='EscapingChain'){assert.ok(b.prepared.routing.coincident_port_refinement.attempts.every(t=>!t.accepted));assert.equal(b.svg,a.svg);assert.equal(JSON.stringify(b.prepared.routes),JSON.stringify(a.prepared.routes));}
 const comparison={name:spec.name};
 for(const [role,result]of [['before',a],['current',b]]){const name=spec.name+'-'+role,svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input:spec.input,input_sha256:sha(root+'/'+spec.input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:result.graph.nodes.length,edges:result.graph.edges.length,quality:result.prepared.quality});comparison[role==='before'?'before':'after']=name;
 }
 comparisons.push(comparison);console.log(JSON.stringify({name:spec.name,before:a.prepared.quality.line_geometry.crossings,after:b.prepared.quality.line_geometry.crossings,wire_before:a.prepared.quality.wire_length,wire_after:b.prepared.quality.wire_length}));
}
fs.writeFileSync(out+'/extra-report.json',JSON.stringify({schema:'coincident-ports/1',implementation_sha256:report.implementation_sha256,baseline:report.baseline,rows,comparisons,producer_sha256:sha(__filename),goal_complete:false},null,2)+'\n');
