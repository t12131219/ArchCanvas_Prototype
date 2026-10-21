/* Revisit detail opportunities previously hidden by optimistic local receipts. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),folder='verification/exact-expression/current',out=root+'/'+folder;
const {renderer:R,diagrams:D}=require('./load_publication_renderer.cjs')(root+'/semantic_studio',{diagramSet:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(root+'/'+f));
const small=read(folder+'/small-report.json'),rows=[],recoveries=[];
const hashes={...small.implementation_sha256,'tools/audit_exact_recovery.cjs':sha(__filename)};
for(const [f,h]of Object.entries(small.implementation_sha256))assert.equal(sha(root+'/'+f),h);
function restore(name){
 const row=small.rows.find(r=>r.name===name),doc=read(folder+'/'+row.document),by=new Map(doc.architecture.nodes.map(n=>[n.id,n]));
 assert.equal(sha(out+'/'+row.document),row.document_sha256);
 return {row,doc,graph:{architecture:doc.architecture,nodes:doc.layout.nodes.map(p=>by.get(p.id)),positions:new Map(doc.layout.nodes.map(p=>[p.id,p])),publication:doc.publication,
  expression_goals:doc.expression_goals,expression_coverage:doc.expression_coverage,representatives:doc.layout.representatives}};
}
for(const c of small.comparisons){
 const before=restore(c.before),current=restore(c.after),old=D.plan(before.doc.ir,before,before.doc.state),plan=D.plan(current.doc.ir,current,current.doc.state);
 const extra=plan.candidates.filter(c=>!old.candidates.some(r=>r.id===c.id));assert.equal(extra.length,1);
 const request=extra[0];console.log('START '+c.name);const result=R.render(current.doc.ir,request.state),name=c.name+'-recovery',svg=name+'.svg',document=name+'.layout.json';
 fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input:current.row.input,input_sha256:current.row.input_sha256,state:result.document.state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),
  nodes:result.graph.nodes.length,edges:result.graph.edges.length,quality:result.prepared.quality});
 const coverage=D.coverage(current.doc.ir,plan,[{id:'local',result}]);
 const expressed=request.goals.filter(id=>coverage.some(r=>r.goal===id&&r.status==='fulfilled'));
 recoveries.push({name:c.name,source:c.after,before_candidates:old.candidates.length,after_candidates:plan.candidates.length,request,capture:name,expressed_goals:expressed,
  qualified:D.acceptable(result),scope:'A newly available exact local alternative; not automatically inserted in the fixed three-panel Transformer set.'});
 console.log(JSON.stringify({name:c.name,qualified:D.acceptable(result),requested:request.goals.length,expressed:expressed.length}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h);
fs.writeFileSync(out+'/recovery-report.json',JSON.stringify({schema:'exact-expression-recovery/1',implementation_sha256:hashes,baseline:small.baseline,rows,recoveries,goal_complete:false},null,2)+'\n');
