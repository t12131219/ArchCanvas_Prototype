'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../..');process.chdir(root);
const read=p=>JSON.parse(fs.readFileSync(p)),write=(p,v)=>fs.writeFileSync(path.join(__dirname,p),JSON.stringify(v,null,2)+'\n');
const files=['semantic_adapter','semantic_studio','yworks_edge_router_lab'].flatMap(d=>fs.readdirSync(d).filter(f=>/\.(py|js|html|css)$/.test(f)).map(f=>d+'/'+f));
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const before=hashes();
global.EdgeRouterLabRouting=require(root+'/yworks_edge_router_lab/router');
for(const f of ['physical-ports','junction-markers','route-labels','source-contracts','semantic-constraints','graph-engine','runtime-layout','recursive-graph'])require(root+'/yworks_edge_router_lab/'+f);
const G=require(root+'/yworks_edge_router_lab/generic-semantic'),N=SummaryEngine,ir=read(path.join(__dirname,'DETRVAE.json')),rows=[];
for(const mode of ['F0','F1','source']){
 let g=G.build(ir,mode==='F0'?SemanticCompositionLayout.frontier({mode:'source'},'overview'):G.initial(ir));
 if(mode==='source')g=G.operate(g,{kind:'all',open:true});
 const started=performance.now(),r=G.route(g),validation=N.validateView(g),doc=G.document(g),payload=G.read(doc),restored=G.restore(G.build(payload.ir,payload.state),payload.nativeLayout);
 const row={mode,visible:{nodes:g.nodes.length,edges:g.edges.length},route_ms:performance.now()-started,routing:r,source:validation.source,layout:validation.layout,invalid:validation.edges.filter(([,v])=>!v.ok),ir_preserved:JSON.stringify(g.generic.ir)===JSON.stringify(ir),saved_ir_preserved:JSON.stringify(payload.ir)===JSON.stringify(ir),layout_roundtrip:JSON.stringify(G.layoutSnapshot(restored))===JSON.stringify(G.layoutSnapshot(g)),canvas:g.canvas};
 if(mode==='source'){const by=new Map(ir.edges.map(e=>[e.id,e]));row.exact_bindings=g.edges.every(e=>Object.entries(by.get(e.id)||{}).every(([k,v])=>JSON.stringify(e.binding[k])===JSON.stringify(v)));}
 write('DETRVAE-'+mode+'-document.json',doc);rows.push(row);console.log(JSON.stringify({mode,nodes:g.nodes.length,edges:g.edges.length,source:validation.source.ok,layout:validation.layout.ok,invalid:row.invalid.length,roundtrip:row.layout_roundtrip}));
}
write('native-report.json',{renderer:G.VERSION,frozen:JSON.stringify(before)===JSON.stringify(hashes()),production_hashes:before,rows});
