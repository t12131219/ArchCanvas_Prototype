const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),C=global.SummaryConstraints;
const root=path.resolve(__dirname,'..'),cat=JSON.parse(fs.readFileSync(root+'/data/catalog.json'));
const old=vm.createContext({});vm.runInContext(fs.readFileSync(root+'/verification/performance/before/route-labels.js','utf8'),old);
const load=()=>C.initialize(JSON.parse(fs.readFileSync(root+'/'+cat.cases.find(c=>c.title==='Transformer'&&c.collection==='transformer_programmatic_guide'&&!c.historical).views.find(v=>v.key==='detailed').json)));
test('caption search keeps original placements and protects new glyph captions',()=>{let count=0,unchanged=0;
  for(const c of cat.cases.filter(c=>!c.historical))for(const v of c.views){if(!v.json)continue;const g=C.initialize(JSON.parse(fs.readFileSync(root+'/'+v.json))),occupied=[],actual=E.routeLabelPlacements(g);
    for(const a of g.routeLabels||[]){const expected=old.SummaryRouteLabels.place(g,a,E.labelPath(g,a),occupied);if(expected)occupied.push(expected.box);
      if(!g.nodes.some(n=>n.glyphPresentation)){assert.deepEqual(JSON.parse(JSON.stringify(actual.get(a.id))),JSON.parse(JSON.stringify(expected)),`${c.title}/${v.key}/${a.id}`);unchanged++;}
      else{const p=actual.get(a.id);assert.ok(p&&p.score<1e6,`${c.title}/${v.key}/${a.id}`);assert.ok(global.SummaryRouteLabels.project(E.labelPath(g,a),p.point).distance<1e-6);}
      count++;
    }
  }assert.ok(count>=236,'all original captions and source-derived additions are exercised');assert.ok(unchanged>0,'unchanged figures still match the prior caption search');
});
test('transaction context preserves positive and negative validation results',()=>{
  const g=load();for(const e of g.edges)assert.deepEqual(C.validate(g,e,e.route,C.validationContext(g)),C.validate(g,e,e.route));
  g.nodes.find(n=>!n.expanded&&!n.junction).semantic.kind='forged';const context=C.validationContext(g);
  for(const e of g.edges){const result=C.validate(g,e,e.route,context);assert.equal(result.ok,false);assert.deepEqual(result,C.validate(g,e,e.route));}
});
test('preview follows glyphs, descendants and paths without editing source evidence',()=>{
  const g=load(),before=E.clone(g),n=g.nodes.find(n=>n.expanded&&!n.parent),ids=E.movePreview(g,n.id,8,0);
  assert.ok(ids.size>1);for(const v of g.nodes){const prior=before.nodes.find(n=>n.id===v.id);assert.equal(v.x,prior.x+(ids.has(v.id)?8:0));assert.equal(v.y,prior.y);assert.deepEqual(v.semantic,prior.semantic);}
  assert.deepEqual(g.semanticBaseline,before.semanticBaseline);assert.deepEqual(g.edges.map(e=>e.binding),before.edges.map(e=>e.binding));
  for(const e of g.edges)if(ids.has(e.source)&&ids.has(e.target)){const prior=before.edges.find(v=>v.id===e.id);assert.deepEqual(e.route,prior.route.map(p=>({x:p.x+8,y:p.y})));}
});
test('preview respects ownership, overlap and canvas boundaries',()=>{
  const n={id:'child',x:30,y:30,w:20,h:20,parent:'frame',base:[30,30]},g={canvas:[200,200],nodes:[{id:'frame',x:10,y:10,w:100,h:100,expanded:true,base:[10,10]},n,{id:'sibling',x:65,y:30,w:20,h:20,parent:'frame',base:[65,30]}],edges:[]};
  E.movePreview(g,n.id,-100,100);assert.equal(n.x,12);assert.equal(n.y,88);
  E.movePreview(g,n.id,0,-58);const before=E.clone(n);assert.equal(E.movePreview(g,n.id,53,0).size,0);assert.deepEqual(n,before);
});
test('worker move uses the authoritative pre-gesture graph and rejects corrupted metadata',()=>{
  const source=load(),reference=E.clone(source),id='enc.self.sdpa.av';E.move(reference,id,100,0);
  const scope={importScripts:()=>{},SummaryEngine:E,SummaryConstraints:C,postMessage:value=>{scope.response=value;}};
  scope.self=scope;const context=vm.createContext(scope);vm.runInContext(fs.readFileSync(root+'/yworks_edge_router_lab/routing-worker.js','utf8'),context);
  scope.onmessage({data:{requestId:7,task:'move',graph:E.clone(source),id,dx:100,dy:0,options:{}}});assert.equal(scope.response.ok,true);assert.equal(scope.response.requestId,7);assert.deepEqual(scope.response.graph,reference);
  const bad=E.clone(source);bad.edges[0].binding.canonical_src='forged:out';scope.onmessage({data:{requestId:8,task:'move',graph:bad,id,dx:2,dy:0,options:{}}});assert.equal(scope.response.ok,false);assert.equal(scope.response.requestId,8);
});
