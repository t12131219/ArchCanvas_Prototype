'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),out=root+'/verification/measured-frontiers/current',R=require('./load_publication_renderer.cjs')(root+'/semantic_studio'),E=require('./load_publication_renderer.cjs')(root+'/semantic_studio',{engine:true});
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(out+'/'+f)).digest('hex');
const saved=read('ui-saved.json'),folded=read('ui-folded-state.json'),raw=read('ui-raw-state.json');
for(const d of [saved,folded,raw])assert.deepEqual(d.ir,saved.ir);
const a=R.render(saved.ir,saved.state),b=R.render(folded.ir,folded.state),project=E.project(raw.ir,raw.state);
for(const f of ['ui-planned.svg','ui-reopened.svg','ui-returned.svg'])assert.equal(fs.readFileSync(out+'/'+f,'utf8'),a.svg);
assert.equal(fs.readFileSync(out+'/ui-folded.svg','utf8'),b.svg);
assert.equal(fs.readFileSync(out+'/CrossedBranches-current.svg','utf8'),a.svg);
assert.equal(fs.readFileSync(out+'/CrossedBranches-folded.svg','utf8'),b.svg);
assert.deepEqual([...project.positions.keys()].sort(),saved.ir.nodes.map(n=>n.id).sort());
assert.deepEqual(Array.from(project.edges,e=>e.id).sort(),saved.ir.edges.map(e=>e.id).sort());
assert.deepEqual([a.graph.nodes.length,a.graph.nodes.length,b.graph.nodes.length,project.nodes.length,a.graph.nodes.length],[15,15,10,15,15]);
const rawRoutes=project.edges.map(e=>({id:e.id,source:e.source,target:e.target,route:E.route(e,project.positions)}));
fs.writeFileSync(out+'/ui-raw-projection.json',JSON.stringify({nodes:[...project.positions.values()],edges:rawRoutes}));
const adaptive=read('ui-adaptive-import.json'),adaptiveFigure=R.render(adaptive.ir,adaptive.state);
assert.equal(fs.readFileSync(out+'/ui-adaptive.svg','utf8'),adaptiveFigure.svg);
// The renderer runs in a frozen VM realm; compare serialized data, not prototypes.
assert.deepEqual(JSON.parse(JSON.stringify(adaptiveFigure.document.publication.adaptive_frontier.selected)),
 JSON.parse(JSON.stringify(require('../semantic_studio/adaptive-frontier.js').metrics(adaptiveFigure))));
const files=['ui-adaptive.svg','ui-adaptive.png','ui-planned.svg','ui-reopened.svg','ui-returned.svg','ui-folded.svg','ui-raw.svg','ui-saved.json','ui-folded-state.json','ui-raw-state.json','ui-returned.png','ui-raw-projection.json'];
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({schema:'measured-frontier-ui/1',sequence:[a.graph.nodes.length,a.graph.nodes.length,b.graph.nodes.length,project.nodes.length,a.graph.nodes.length],svg_byte_identical:true,
 canonical_nodes:raw.ir.nodes.length,canonical_edges:raw.ir.edges.length,raw_ids_complete:true,files_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),passed:true},null,2));
console.log('UI saved, folded, raw and restored states verified');
