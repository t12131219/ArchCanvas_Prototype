/* Replay only the unrouted semantic projection. Never import the joint planner
 * or turn a possible goal into a coverage claim. Python checks the decisions. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/joint-preflights/current',read=f=>JSON.parse(fs.readFileSync(f));
const report=read(out+'/render-report.json'),E=require('./load_publication_renderer.cjs')(root+'/semantic_studio',{engine:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
for(const[f,h]of Object.entries(report.implementation_sha256))assert.equal(sha(root+'/'+f),h);
const results=[];
for(const s of report.sets.filter(s=>s.preflights)){
 const ir=read(root+'/'+s.input),before=JSON.stringify(ir),cache=new Map(),records=[];
 for(const p of s.preflights){
  const key=JSON.stringify(p.state);let g=cache.get(key);if(!g){g=E.project(ir,{...p.state,view:'publication'});cache.set(key,g);}
  const nodes=g.nodes.map(n=>n.id),edges=[...new Set(g.edges.flatMap(e=>(e.bundle_members||[e]).flatMap(m=>[m.id,...m.originals||[]])))];
  const c=p.opportunity,roles=g.publication.role_frontier;
  const request=c.kind==='roles'?roles?.detail_requests?.find(r=>r.node===c.node):c.kind==='role-path'?roles?.path_requests?.find(r=>r.node===c.node&&r.certificate===c.certificate&&JSON.stringify(r.role)===JSON.stringify(c.role)):null;
  records.push({request:p.request,state:p.state,comparison_round:p.comparison_round,projected_nodes:nodes,projected_edges:edges,role_request:request||null});
 }
 assert.equal(cache.size,s.projected_trials);assert.equal(JSON.stringify(ir),before);
 results.push({name:s.name,records,projected_trials:cache.size});
}
fs.writeFileSync(out+'/projection-report.json',JSON.stringify({schema:'joint-preflight-projection-replay/1',render_report_sha256:sha(out+'/render-report.json'),auditor_sha256:sha(__filename),results,passed:true},null,2)+'\n');
console.log(JSON.stringify({sets:results.length,projections:results.reduce((n,r)=>n+r.projected_trials,0),passed:true}));
