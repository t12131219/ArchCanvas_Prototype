'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer'),structure=require('./diagram-structure.cjs');
const paper={font:16,lines:['Arbitrary <title>'],captions:['slot 0 ← x & y','source: file.py:12','unknown alternative retained']},p={w:300,h:120};
test('shared glyphs retain precise captions, escaping and boundary distinctions without mutating facts or geometry',()=>{
 for(const kind of ['composite','compute','interface','parameter','buffer','state','control','opaque','value-alias']){
  const n={id:'any',kind,label:'Attention',operator:'foreign',paper},before=JSON.stringify({n,p}),body=R.nodeBody(n,p);
  assert.ok(body.includes('slot 0 ← x &amp; y'));assert.ok(body.includes('&lt;title&gt;'));assert.ok(body.includes('unknown alternative retained'));
  assert.equal(JSON.stringify({n,p}),before);assert.equal(body.includes('stroke-dasharray'),kind==='opaque');
  if(kind==='control')assert.ok(body.includes('L300 60'));
 }
});
test('semantic colors follow actual operations under renaming, including ordinary models and retained paths',()=>{
 for(const n of [{kind:'compute',operator:'linear'},{kind:'compute',operator:'convolution'},{kind:'compute',operator:'softmax'},{kind:'compute',operator:'normalization'},{kind:'composite',semantic_type:'attention'},{kind:'composite',role_path_stage:{operations:[{operator:'embedding'}]}}]){
  assert.deepEqual(R.nodeAppearance({...n,label:'Original',id:'one'}),R.nodeAppearance({...n,label:'Entirely foreign',id:'two',source_class:'Other'}));
 }
 assert.notEqual(R.nodeAppearance({kind:'compute',operator:'linear'}).fill,R.nodeAppearance({kind:'compute',operator:'foreign',label:'Linear'}).fill);
});
test('historical vector comparison still detects edge, group placement, printed text and dimensions changes',()=>{
 const svg='<svg width="300"><style>old</style><g class="node" data-id="x" transform="translate(1,2)"><rect fill="red"/><text class="paper-title"><tspan>One</tspan></text></g><path d="M0 0L1 2"/></svg>';
 assert.equal(structure(svg),structure(svg.replace('red','blue').replace('old','new')));
 for(const [a,b] of [['M0 0L1 2','M0 0L1 3'],['translate(1,2)','translate(2,2)'],['One','Two'],['width="300"','width="301"']])assert.notEqual(structure(svg),structure(svg.replace(a,b)));
});
