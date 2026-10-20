'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),R=require('../semantic_studio/publication-renderer.js');
const out='verification/input-docks/current',read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hashes=()=>Object.fromEntries(fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')).map(f=>['semantic_studio/'+f,sha('semantic_studio/'+f)]));
const count=f=>(fs.readFileSync(out+'/'+f,'utf8').match(/data-node-id=/g)||[]).length;
if(process.argv.includes('--render')){
 const implementation=hashes(),doc=read(out+'/ui-transformer-opened.layout.json'),r=R.render(doc.ir,doc.state);
 fs.writeFileSync(out+'/cli-transformer-opened.svg',r.svg);fs.writeFileSync(out+'/cli-transformer-opened.layout.json',JSON.stringify(r.document));
 for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h);
 fs.writeFileSync(out+'/ui-reconstruction.json',JSON.stringify({implementation_sha256:implementation,producer_sha256:sha('tools/verify_input_dock_ui.cjs'),
  input_sha256:sha(out+'/ui-transformer-opened.layout.json'),svg_sha256:sha(out+'/cli-transformer-opened.svg'),document_sha256:sha(out+'/cli-transformer-opened.layout.json'),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality},null,2)+'\n');
 console.log(JSON.stringify({nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality.issues}));
}else{
 const report=read(out+'/render-report.json');for(const [f,h]of Object.entries(report.implementation_sha256))assert.equal(sha(f),h);
 const saved=read(out+'/ui-saved.layout.json'),r=R.render(saved.ir,saved.state);assert.equal(r.svg,fs.readFileSync(out+'/ui-opened.svg','utf8'));
 assert.deepEqual(saved.ir,read(out+'/BraidedInputs.json'));
 const reconstruction=read(out+'/ui-reconstruction.json');for(const [f,h]of Object.entries(reconstruction.implementation_sha256))assert.equal(sha(f),h);
 assert.equal(sha('tools/verify_input_dock_ui.cjs'),reconstruction.producer_sha256);
 assert.equal(sha(out+'/ui-transformer-opened.layout.json'),reconstruction.input_sha256);
 assert.deepEqual(read(out+'/ui-transformer-opened.layout.json').ir,read('verification/symbolic-values/current/transformer-current.json'));
 for(const [a,b]of [['ui-main.svg','BraidedInputs-current.svg'],['ui-refolded.svg','ui-main.svg'],['ui-transformer-main.svg','transformer-current.svg'],
  ['ui-transformer-opened.svg','cli-transformer-opened.svg'],['ui-transformer-refolded.svg','ui-transformer-main.svg']])assert.equal(sha(out+'/'+a),sha(out+'/'+b),a);
 const artifacts=['ui-main.svg','ui-opened.svg','ui-refolded.svg','ui-saved.layout.json','ui-opened.png',
  'ui-transformer-main.svg','ui-transformer-opened.svg','ui-transformer-refolded.svg','ui-transformer-opened-state.json','ui-transformer-opened.png','comparison-browser.png','ui-reconstruction.json'];
 const result={schema:'input-dock-ui/1',render_report_sha256:sha(out+'/render-report.json'),generic_sequence:[count('ui-main.svg'),count('ui-opened.svg'),41,count('ui-refolded.svg')],
  transformer_sequence:[count('ui-transformer-main.svg'),count('ui-transformer-opened.svg'),count('ui-transformer-refolded.svg')],
  generic_saved_reopened:true,canonical_ir_unchanged:true,cli_svg_equal:true,exact_refold_svg:true,
  artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(out+'/'+f)])),
  scope:'Actual file import, source input inspector, path expansion, generic save/reopen, Transformer return-region expansion and exact refold. DOM observations and actual SVG exports; no responsive latency claim.'};
 assert.deepEqual(result.generic_sequence,[38,41,41,38]);assert.deepEqual(result.transformer_sequence,[86,91,86]);
 fs.writeFileSync(out+'/ui-report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({generic_sequence:result.generic_sequence,transformer_sequence:result.transformer_sequence}));
}
