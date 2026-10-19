#!/usr/bin/env node
/* Reconstruct files captured from the actual browser export dialogs. This does
 * not drive the browser or stand in for the interaction observations. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/publication');
const R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const responsive=read('inspector-responsive-report.json');
for(const [file,digest] of Object.entries(responsive.implementation_sha256))
  assert.equal(hash(path.join(root,file)),digest,'stale responsive review: '+file);
assert.deepEqual(responsive.checks.map(c=>c.viewport),[1280,1088]);
for(const check of responsive.checks){
  assert.equal(check.overlap,0,'model list overlaps inspector');
  assert.equal(check.scroll_width,check.client_width,'document overflows horizontally');
  assert.deepEqual(check.terms.map(t=>t.text),['Tanh × 1tanh','ReLU × 1relu','Unresolved × 1unfamiliar_kernel']);
  for(const term of check.terms){assert.ok(term.x>=0&&term.x+term.width<=check.client_width);assert.ok(term.height>0);}
}
assert.equal(responsive.checks[1].model_position,'static');
const implementation=['semantic_studio/app.js','semantic_studio/architecture.js','semantic_studio/architecture-layout.js',
  'semantic_studio/semantic-engine.js','semantic_studio/branch-regions.js','semantic_studio/publication.js',
  'semantic_studio/publication-renderer.js','tools/verify_publication_ui_exports.cjs'];
for(const name of ['TextCNN','WovenFusion','GraphNet','DenseLayer','DenseBlock','GatedMixture','GatedMixture-sum']){
  const docName=name+'-ui.layout.json',svgName=name+'-ui.svg',document=read(docName);
  assert.equal(document.schema,'semantic-canvas/1');
  const rendered=R.render(document.ir,document.state),svg=fs.readFileSync(path.join(out,svgName),'utf8');
  assert.equal(rendered.svg,svg,name+' export reconstruction differs');
  assert.deepEqual(rendered.prepared.quality.issues,[]);
  const checks=name==='TextCNN'?[
    'Imported CLI layout document visibly restores the saved loop-template focus in the module selector.',
    'Clicking the convolution input shows the local variable and TextCNN.forward source line 18.',
    'Current contact repair removes four unrelated contacts while retaining four crossings and exact operands.',
    'UI SVG and semantic-canvas dialog contents saved; reconstruction is byte-identical.'
  ]:name==='WovenFusion'?[
    'Actual overview inventory inspection lists Linear × 3 with p0/p1/p2, and Tanh/ReLU plus one unresolved unit without a model-family claim.',
    'Mouse click on shared result b0 lists e00021 operand 0 and e00032 operand 2.',
    'Mouse click on an actual ribbon segment lists the same two original dependencies and operand slots.',
    'UI SVG and semantic-canvas dialog contents saved; reconstruction is byte-identical.'
  ]:name==='GraphNet'?[
    'Imported GraphNet layout document visibly restores Dependency band 2, at 10.66pt and 180 by 160.9mm.',
    'Mouse click on an actual ribbon segment lists self.V uses e00002 to unsqueeze and e00004 to expand, both receiver operands.',
    'UI SVG and semantic-canvas dialog contents saved; reconstruction retains three crossings and zero unrelated contacts after unsafe rerouting is rejected.'
  ]:name==='DenseLayer'?[
    'Imported DenseLayer layout document visibly restores Dependency band 1 at 10.66pt and 180 by 132mm.',
    'UI SVG and semantic-canvas dialog contents saved; byte-identical reconstruction retains zero crossings and zero unrelated contacts after accepted rerouting.'
  ]:name==='DenseBlock'?[
    'Imported DenseBlock overview retains the actual loop and unresolved carried values at 11.93pt and 180 by 231.2mm.',
    'Current SVG visibly separates the previous ambiguous contact. UI SVG and semantic-canvas contents saved and reconstructed byte-identically.',
    'The separately recorded tradeoff increases crossings from one to two while removing the final two contacts, with identical nodes and operand identities.'
  ]:name==='GatedMixture'?[
    'Actual imported overview shows EncoderLayer, RNN, two projections, a gated sum and the unresolved external kernel.',
    'UI and CLI share prepareFigure: row-gap retry places all three previously missing recurrent labels, with four crossings and zero unrelated contacts.',
    'Actual SVG and semantic-canvas dialog contents reconstruct byte-identically.'
  ]:[
    'Module focus visibly restores Gated sum, with two nested Sigmoid gate groups and one sum operator.',
    'Selecting the extra product output shows slot 2 and the original return tuple at gated_composition.py line 23.',
    'The finding retains two explicit operand records; state update, normalized weights and model family remain unasserted. Actual UI export reconstructs byte-identically.'
  ];
  if(name==='TextCNN'){
    const original=read('TextCNN-loop.layout.json');
    assert.equal(document.state.paperFocus,original.state.paperFocus);
    assert.deepEqual(document.ir,original.ir);
    assert.equal(rendered.prepared.routing.selected,'neighbors-header-long');
    assert.equal(rendered.prepared.quality.line_geometry.crossings,4);
    assert.equal(rendered.prepared.routing.refinement.before_contacts,4);
    assert.equal(rendered.prepared.routing.refinement.after_contacts,0);
    assert.equal(rendered.prepared.quality.line_geometry.unrelated_contacts.length,0);
    assert.ok(rendered.prepared.routing.refinement.accepted.some(a=>a.phase==='contacts'&&a.stub_length===12));
  }
  if(name==='GraphNet'){
    const original=read('GraphNet-panel.layout.json');
    assert.equal(document.state.paperFocus,original.state.paperFocus);assert.deepEqual(document.ir,original.ir);
    assert.equal(rendered.prepared.routing.refinement.accepted.length,0);
    assert.equal(rendered.prepared.routing.refinement.before_crossings,3);
    assert.equal(rendered.prepared.routing.refinement.after_crossings,3);
    assert.equal(rendered.prepared.quality.line_geometry.unrelated_contacts.length,0);
  }
  if(name==='WovenFusion'){
    const n=rendered.graph.idx.nodes.get(document.state.paperFocus),c=n.content_inventory;
    assert.equal(c.multiplicity,'extracted-units');assert.equal(c.execution_order,'not-asserted');assert.equal(c.parameter_sharing,'not-asserted');
    assert.deepEqual(c.terms.map(t=>[t.label,t.count]),[['Tanh',1],['ReLU',1],['Unresolved',1]]);
    assert.equal(n.paper.caption,'Tanh · ReLU · 1 unresolved');
    assert.match(rendered.svg,/unfamiliar_kernel/);
  }
  if(name==='DenseLayer'){
    const original=read('DenseLayer-detour.layout.json');
    assert.equal(document.state.paperFocus,original.state.paperFocus);assert.deepEqual(document.ir,original.ir);
    assert.ok(rendered.prepared.routing.refinement.accepted.length>0);
    assert.equal(rendered.prepared.routing.refinement.before_crossings,4);
    assert.equal(rendered.prepared.routing.refinement.after_crossings,0);
    assert.equal(rendered.prepared.quality.line_geometry.unrelated_contacts.length,0);
  }
  if(name==='DenseBlock'){
    const original=read('DenseBlock-overview.layout.json');
    assert.equal(document.state.paperFocus,original.state.paperFocus);assert.deepEqual(document.ir,original.ir);
    const f=rendered.prepared.routing.refinement,tradeoffs=f.accepted.filter(a=>a.tradeoff==='contacts-to-crossings');
    assert.equal(tradeoffs.length,1);assert.equal(tradeoffs[0].phase,'separation');
    assert.deepEqual(tradeoffs[0].crossings,[1,2]);assert.deepEqual(tradeoffs[0].contacts,[2,0]);
    assert.equal(rendered.prepared.quality.line_geometry.crossings,2);
    assert.equal(rendered.prepared.quality.line_geometry.unrelated_contacts.length,0);
  }
  if(name.startsWith('GatedMixture')){
    const original=read(name+'.layout.json');assert.deepEqual(document.ir,original.ir);assert.equal(document.state.paperFocus??null,original.state.paperFocus??null);
    const finding=rendered.graph.architecture.findings.find(f=>f.rule==='gated-sum');assert.equal(finding.presentation,'group');
    assert.equal(finding.roles.state_update,'not-asserted');assert.equal(finding.roles.weight_normalization,'not-asserted');assert.equal(finding.roles.model_family,'not-asserted');
    assert.equal(finding.roles.terms.length,2);assert.equal(rendered.prepared.quality.line_geometry.unrelated_contacts.length,0);
    if(name==='GatedMixture'){
      assert.equal(rendered.graph.publication.unknowns,1);assert.match(svg,/unfamiliar_kernel/);
      assert.equal(rendered.prepared.routing.layout_refinement.before_unplaced_labels,3);
      assert.equal(rendered.prepared.routing.layout_refinement.after_unplaced_labels,0);
      assert.equal(rendered.prepared.quality.line_geometry.crossings,4);
    }else{
      assert.equal(document.state.paperFocus,finding.id);assert.equal(rendered.graph.publication.unknowns,0);
      assert.equal(rendered.graph.nodes.filter(n=>n.semantic_type==='gate').length,2);
    }
  }
  const reportFile=path.join(out,name+'-ui-report.json');
  const old=fs.existsSync(reportFile)?read(name+'-ui-report.json'):{};
  const report={schema:'publication-ui-roundtrip/2',entry:name,
    svg:svgName,document:docName,svg_characters:svg.length,svg_sha256:hash(path.join(out,svgName)),
    document_sha256:hash(path.join(out,docName)),byte_identical:true,focus:document.state.paperFocus,
    quality:rendered.prepared.quality,routing:rendered.prepared.routing,checks,
    historical_checks:old.historical_checks||old.checks||[],
    scope:'Export dialog content and reconstruction verified; operating-system download was not exercised. Browser interactions were performed separately, not by this reconstruction tool.',
    implementation_sha256:Object.fromEntries(implementation.map(file=>[file,hash(path.join(root,file))]))};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({entry:name,byte_identical:true,focus:report.focus,routing:report.routing.selected}));
}
