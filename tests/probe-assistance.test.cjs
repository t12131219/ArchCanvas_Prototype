'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const P=require('../yworks_edge_router_lab/generic-probe');
const ir=JSON.parse(fs.readFileSync('data/semantic/d6df94c94e8a5888.json'));

test('probe defaults preserve the exact entry configuration and leave inputs undeclared',()=>{
 const before=JSON.stringify(ir),d=P.defaults(ir);
 assert.equal(d.source,ir.entry.file);assert.equal(d.entry,ir.entry.class);
 assert.deepEqual(d.spec.constructor,ir.entry.constructor);assert.deepEqual(d.spec.cases[0].inputs,{});
 assert.equal(JSON.stringify(ir),before);
 assert.throws(()=>P.request(ir,'/env/bin/python',d.sourceRoot,JSON.stringify(d.spec),45),/输入样例/);
});
test('explicit CPU request preserves scalar branch inputs and mode scope',()=>{
 const spec={schema:'semantic-inputs/1',constructor:ir.entry.constructor,modes:['eval','train'],cases:[{id:'off',inputs:{x:{shape:[1,4]},flag:{value:false}}}]};
 const payload=P.request(ir,' /env/bin/python ',' /project ',JSON.stringify(spec),'30');
 assert.equal(payload.execute,true);assert.equal(payload.ir,ir);assert.deepEqual(payload.spec,spec);
 assert.equal(payload.interpreter,'/env/bin/python');assert.equal(payload.source_root,'/project');assert.equal(payload.timeout,30);
 assert.throws(()=>P.request(ir,'','/project',JSON.stringify(spec),30),/解释器/);
});
test('probe summary distinguishes observed associations from resolution and failed execution',()=>{
 const value={summary:{status:'unavailable',reason:'isolation unavailable',runs:[],boundaries:[{observations:[]}]}};
 assert.match(P.resultText(value),/unavailable/);assert.match(P.resultText(value),/isolation unavailable/);
 assert.match(P.resultText(value),/源码行关联不等于/);assert.match(P.resultText(value),/未执行路径仍未知/);
});
