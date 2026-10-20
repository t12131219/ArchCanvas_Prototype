const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../semantic_studio/publication-renderer.js');
const root=path.resolve(__dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(root,'verification/local-relations/current/structural-repeats',name+'.json')));
const sequence=ir=>ir.nodes.find(n=>n.repeat_contract);
test('different source classes select a structure-backed representative with exact positions',()=>{
  const ir=read('EquivalentSteps'),canonical=JSON.stringify(ir),s=sequence(ir),out=R.render(ir,{paperFocus:s.id,paperRepresentative:true,paperGranularity:'modules'});
  assert.equal(out.graph.publication.representative.index,0);
  assert.deepEqual(out.graph.publication.representative.structural_group.indices,[0,1,2]);
  assert.match(out.svg,/source positions/);assert.match(out.svg,/structure only/);
  assert.ok(out.graph.publication.boundary.some(e=>e.direction==='input'));
  assert.ok(out.graph.publication.boundary.some(e=>e.direction==='output'));
  assert.equal(JSON.stringify(ir),canonical);assert.equal(R.render(out.document.ir,out.document.state).svg,out.svg);
});
test('heterogeneous representatives require an explicit group and retain the exceptional position',()=>{
  const ir=read('MixedSteps'),s=sequence(ir),whole=R.render(ir,{paperFocus:s.id,paperRepresentative:true});
  assert.equal(whole.graph.publication.focus,s.id);assert.equal(whole.graph.publication.representative,null);
  const first=R.render(ir,{paperFocus:s.id,paperRepresentative:true,paperRepresentativeGroup:0,paperGranularity:'modules'});
  const exception=R.render(ir,{paperFocus:s.id,paperRepresentative:true,paperRepresentativeGroup:1,paperGranularity:'modules'});
  assert.deepEqual(first.graph.publication.representative.structural_group.indices,[0,1,3]);
  assert.deepEqual(exception.graph.publication.representative.structural_group.indices,[2]);
  assert.equal(exception.graph.publication.representative.index,2);
  assert.notEqual(first.graph.publication.focus,exception.graph.publication.focus);
  const add=exception.graph.nodes.find(n=>n.operator==='add');
  assert.ok(add.paper.captions.join(' ').includes('right operand: 2'));
});
test('unresolved same-class elements cannot become representatives',()=>{
  const ir=read('UnknownSteps'),s=sequence(ir);
  for(const group of [0,1])assert.equal(R.render(ir,{paperFocus:s.id,paperRepresentative:true,paperRepresentativeGroup:group}).graph.publication.representative,null);
  assert.match(R.render(ir,{paperFocus:s.id}).svg,/unclassified elements/);
});
test('constructor-only legacy homogeneous flags cannot authorize a representative',()=>{
  const ir=read('EquivalentSteps'),s=sequence(ir);delete s.repeat_contract.structure;s.repeat_contract.homogeneous=true;
  const out=R.render(ir,{paperFocus:s.id,paperRepresentative:true});
  assert.equal(out.graph.publication.representative,null);assert.match(out.svg,/Structure unverified/);
});
test('representative selection never deletes canonical nodes or edges',()=>{
  const ir=read('MixedSteps'),s=sequence(ir);
  for(const group of [0,1]){
    const out=R.render(ir,{paperFocus:s.id,paperRepresentative:true,paperRepresentativeGroup:group});
    for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
      const ids=Object.values(out.graph[key]).flat();assert.equal(new Set(ids).size,ids.length);
      assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());
    }
  }
});
