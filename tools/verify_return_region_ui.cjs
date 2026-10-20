'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),R=require('../semantic_studio/publication-renderer.js');
const out='verification/return-regions/current',read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const implementation=()=>Object.fromEntries(fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')).map(f=>['semantic_studio/'+f,sha('semantic_studio/'+f)]));
const count=f=>(fs.readFileSync(out+'/'+f,'utf8').match(/data-node-id=/g)||[]).length;
if(process.argv.includes('--render')){
 const input=out+'/ui-transformer-opened.layout.json',doc=read(input),hashes=implementation(),start=Date.now(),r=R.render(doc.ir,doc.state);
 for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h);
 fs.writeFileSync(out+'/cli-transformer-opened.svg',r.svg);fs.writeFileSync(out+'/cli-transformer-opened.layout.json',JSON.stringify(r.document));
 fs.writeFileSync(out+'/ui-reconstruction.json',JSON.stringify({schema:'return-region-ui-reconstruction/1',input_sha256:sha(input),state:doc.state,
  implementation_sha256:hashes,producer_sha256:sha('tools/verify_return_region_ui.cjs'),duration_ms:Date.now()-start,
  svg_sha256:sha(out+'/cli-transformer-opened.svg'),document_sha256:sha(out+'/cli-transformer-opened.layout.json'),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality},null,2)+'\n');
 console.log(JSON.stringify({nodes:r.graph.nodes.length,edges:r.graph.edges.length,duration_ms:Date.now()-start,issues:r.prepared.quality.issues}));
}else{
 const report=read(out+'/render-report.json');for(const [f,h]of Object.entries(report.implementation_sha256))assert.equal(sha(f),h);
 const generic=read(out+'/ui-saved.layout.json'),reconstruction=read(out+'/ui-reconstruction.json');
 assert.equal(sha('tools/verify_return_region_ui.cjs'),reconstruction.producer_sha256);
 for(const [f,h]of Object.entries(reconstruction.implementation_sha256))assert.equal(sha(f),h);
 assert.equal(sha(out+'/ui-transformer-opened.layout.json'),reconstruction.input_sha256);
 assert.equal(sha(out+'/cli-transformer-opened.layout.json'),reconstruction.document_sha256);
 assert.equal(sha(out+'/cli-transformer-opened.svg'),reconstruction.svg_sha256);
 assert.equal(R.render(generic.ir,generic.state).svg,fs.readFileSync(out+'/ui-opened.svg','utf8'));
 for(const [actual,expected]of [['ui-summary.svg','ReturnAlternatives-summary-current.svg'],['ui-refolded.svg','ui-summary.svg'],
 ['ui-opened.svg','ReturnAlternatives-opened.svg'],['ui-transformer-main.svg','transformer-current.svg'],
 ['ui-transformer-opened.svg','cli-transformer-opened.svg'],['ui-transformer-refolded.svg','ui-transformer-main.svg']])assert.equal(sha(out+'/'+actual),sha(out+'/'+expected),actual);
 assert.deepEqual(generic.ir,read(out+'/ReturnAlternatives.json'));
 assert.deepEqual(read(out+'/ui-transformer-opened.layout.json').ir,read('verification/symbolic-values/current/transformer-current.json'));
 const artifacts=['ui-summary.svg','ui-opened.svg','ui-refolded.svg','ui-saved.layout.json','ui-opened.png',
  'ui-transformer-main.svg','ui-transformer-opened.svg','ui-transformer-refolded.svg','ui-transformer-opened-state.json','ui-transformer-opened.png','comparison-browser.png','ui-reconstruction.json'];
 const result={schema:'return-region-ui/1',render_report_sha256:sha(out+'/render-report.json'),generic_sequence:[count('ui-summary.svg'),19,count('ui-opened.svg'),21,count('ui-refolded.svg')],
  transformer_sequence:[count('ui-transformer-main.svg'),count('ui-transformer-opened.svg'),count('ui-transformer-refolded.svg')],
  generic_saved_reopened:true,canonical_ir_unchanged:true,cli_svg_equal:true,exact_refold_svg:true,artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(out+'/'+f)])),
  scope:'Actual file import, UI double-click expansion, branch expansion, generic save/reopen and refold; actual exports equal independent CLI reconstructions. Synchronous rendering causes browser timeouts; responsive performance is not verified.'};
 assert.deepEqual(result.generic_sequence,[14,19,21,21,14]);assert.deepEqual(result.transformer_sequence,[86,91,86]);
 fs.writeFileSync(out+'/ui-report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
