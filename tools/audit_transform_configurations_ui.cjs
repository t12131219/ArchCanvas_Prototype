'use strict';
// Compare user-visible editor exports with a fresh render of the saved document.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/transform-configurations/current');
const R=require('./load_publication_renderer.cjs')(path.join(root,'semantic_studio'));
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const input=read('AxisPatch.json'),rows=[];
for(const name of ['summary','opened']){
 const saved=read('ui-AxisPatch-'+name+'.json');assert.deepEqual(saved.ir,input);
 const r=R.render(saved.ir,saved.state),file='ui-AxisPatch-'+name+'.svg';
 assert.equal(fs.readFileSync(path.join(out,file),'utf8'),r.svg,'actual editor SVG: '+name);
 assert(r.graph.publication.transform_configurations.rows.length>0);
 rows.push({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  annotated_nodes:r.graph.publication.transform_configurations.rows.length,state:saved.state,svg:file,svg_sha256:sha(file)});
}
assert(rows[1].nodes>rows[0].nodes,'summary must retain finer expansion');
assert.equal(fs.readFileSync(path.join(out,'ui-AxisPatch-reopened.svg'),'utf8'),fs.readFileSync(path.join(out,'ui-AxisPatch-summary.svg'),'utf8'));
const files=['AxisPatch.json','ui-AxisPatch-summary.json','ui-AxisPatch-summary.svg','ui-AxisPatch-opened.json','ui-AxisPatch-opened.svg','ui-AxisPatch-reopened.svg','ui-review.png'];
const report={schema:'transform-configurations-ui/1',passed:true,rows,input_unchanged:true,reopened_svg_byte_identical:true,
 files_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),
 scope:'Actual editor file chooser import, roles canvas, expand-all, document and SVG export, saved summary reopen; one small source fixture. No large-graph editor performance claim.'};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
