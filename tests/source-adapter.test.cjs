const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),F=require('../yworks_edge_router_lab/recursive-graph.js'),A=require('../yworks_edge_router_lab/source-adapter.js'),C=globalThis.SummaryConstraints;
const base=path.resolve(__dirname,'..');
const bundle=JSON.parse(fs.readFileSync(base+'/verification/source-adapter/river-net.json'));
test('unfamiliar source traverses import, mixed expansion, moves, save/reopen and all-open source guards',async()=>{
 await A.verify(bundle);let g=F.build(F.create(A.sources(bundle)));assert.equal(F.route(g).failed,0);const authority=E.clone(g.recursive.authority),ir=g.irSha256;
 const local=g.nodes.find(n=>n.label==='LanternUnit');assert.ok(local);g=F.toggle(g,local.id,true);assert.equal(F.route(g).failed,0);
 const before=E.clone(g),leaf=g.nodes.find(n=>n.semantic.kind==='linear'&&n.parent===local.id);E.move(g,leaf.id,8,0);assert.equal(g.lastMove.blocked,false);F.captureMove(before,g,leaf.id);
 F.remember(g);g=JSON.parse(JSON.stringify(g));assert.equal(g.irSha256,ir);assert.deepEqual(g.recursive.authority,authority);
 g=F.toggle(g,local.id,false);assert.equal(F.route(g).failed,0);g=F.toggle(g,local.id,true);assert.equal(F.route(g).failed,0);
 g=F.all(g,true);assert.equal(F.route(g).failed,0);const checked=E.validateView(g);assert.ok(checked.source.ok&&checked.layout.ok&&checked.edges.every(([,v])=>v.ok));
 // An input forwarded into a nested source module must use its free facing
 // corridor. Check every such interface, rather than a model/edge name.
 const by=new Map(g.nodes.map(n=>[n.id,n])),interfaces=g.edges.filter(e=>by.get(e.source).semantic.kind==='input'&&by.get(e.target).semantic.kind==='input'&&by.get(e.source).parent!==by.get(e.target).parent);
 assert.ok(interfaces.length>=2);
 for(const e of interfaces){const a=e.route[0],b=e.route.at(-1),length=e.route.slice(1).reduce((v,p,i)=>v+Math.abs(p.x-e.route[i].x)+Math.abs(p.y-e.route[i].y),0);
  assert.ok(Math.abs(length-Math.abs(a.x-b.x)-Math.abs(a.y-b.y))<1e-5,'nested input should not take a reverse detour');
  assert.ok(e.route.length<=3,'a free nested input corridor needs at most one turn');
 }
 const bad=E.clone(g);bad.edges[0].binding.canonical_src='forged';assert.equal(C.validateSource(bad).ok,false);
 const html=E.clone(g);html.nodes[0].html+='<script>bad()</script>';assert.equal(C.validateSource(html).ok,false);
});
test('binary presentation chooses a free caption side and compact lanes generically',async()=>{
 await A.verify(bundle);const sources=A.sources(bundle),binary=sources.overview.nodes.filter(n=>n.glyphPresentation?.kind==='binary-circle');
 assert.ok(binary.length>0);
 for(const n of binary){assert.ok(['left','right','top','bottom'].includes(n.glyphPresentation.labelSide));assert.deepEqual(n.labelObstacles,[n.glyphPresentation.labelBox]);}
 const g=F.build(F.create(sources));assert.equal(F.route(g).failed,0);
 const validation=E.validateView(g);assert.ok(validation.source.ok&&validation.layout.ok&&validation.edges.every(([,v])=>v.ok));
 const root=g.nodes.find(n=>!n.parent);assert.ok(root.h<900,'source-adapter layout should release unused future-expansion bands');
 assert.equal(globalThis.EdgeRouterLabRouting.stats(g.edges).crossings,0);
});
test('source, evidence and IR tampering fail before editable markup is generated',async()=>{
 for(const change of [b=>b.files[0].text+='\n#changed',b=>b.evidence[Object.keys(b.evidence)[0]].expression='forged',b=>b.ir.nodes[0].label='forged',b=>b.files[0].path='../escape.py']){const b=E.clone(bundle);change(b);await assert.rejects(()=>A.verify(b));}
 const b=E.clone(bundle);b.ir.nodes[0].label='<img src=x onerror=alert(1)>';b.canonicalIR=JSON.stringify(b.ir);const sources=A.sources(b);assert.ok(!sources.overview.nodes[0].html.includes('<img'));
});
test('dynamic source remains one evidenced opaque region through expansion and visual editing',async()=>{
 const b=JSON.parse(fs.readFileSync(base+'/verification/source-adapter/weather-cell.json'));await A.verify(b);
 assert.equal(b.ir.nodes.filter(n=>n.kind==='opaque').length,1);assert.ok(!b.ir.nodes.some(n=>['add','multiply'].includes(n.kind)));
 let g=F.build(F.create(A.sources(b)));assert.equal(F.route(g).failed,0);g=F.all(g,true);assert.equal(F.route(g).failed,0);
 const region=g.nodes.find(n=>n.semantic.kind==='opaque'),before=E.clone(g);assert.ok(region.html.includes('stroke-dasharray'));
 E.move(g,region.id,8,0);assert.equal(g.lastMove.blocked,false);F.captureMove(before,g,region.id);F.remember(g);
 const reopened=JSON.parse(JSON.stringify(g)),check=E.validateView(reopened);assert.ok(check.source.ok&&check.layout.ok&&check.edges.every(([,v])=>v.ok));
 assert.equal(reopened.irSha256,b.irSha256);assert.ok(b.evidence[b.diagnostics[0].evidence].expression.includes('else:'));
});
