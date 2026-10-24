/* Catalog presentation policy. Semantic recognition and layout never select
 * a model by name: a profile only supplies an audited initial document state. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const C=root.SemanticCompositionLayout||(typeof require==='function'?require('./composition-layout.js'):null);
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  function validate(ir,profile){
    if(!profile)return;
    if(profile.schema!=='semantic-presentation/1'||profile.ir_digest!==ir.ir_digest||
      typeof profile.revision!=='string'||!profile.revision||!object(profile.default_state))
      throw Error('展示配置与当前 IR 不匹配，请重新读取模型目录。');
  }
  function storageKey(ir,profile){
    validate(ir,profile);
    // Leave earlier browser states intact. They must not silently replace a
    // newly published, reviewed frontier on first opening this presentation.
    return 'summary-semantic:architecture-v2:'+ir.ir_digest+':'+(profile?.revision||'certified-details-1');
  }
  function initialState(ir,profile,saved,stored){
    validate(ir,profile);
    const roots=ir.nodes.filter(n=>!n.parent).map(n=>n.id);
    const selected=object(saved)?saved:object(stored)?stored:profile?.default_state;
    if(!selected)return C.certifiedDetails(ir,C.frontier({mode:'source'},'detail'));
    const state=E.clone(selected);
    return {view:'publication',mode:'source',...state,
      open:Array.isArray(state.open)?state.open:roots,
      offsets:object(state.offsets)?state.offsets:{}};
  }
  function defaultModel(catalog,requested){
    return catalog.models.find(m=>m.id===requested)||
      catalog.models.find(m=>m.id===catalog.default_model)||catalog.models[0];
  }
  const api={validate,storageKey,initialState,defaultModel};
  root.SemanticPresentationProfile=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
