/* Publication is a derived, reversible presentation. Structural regions carry
 * no model-family claim. Exact canonical cuts, slots and unknowns survive. */
(function(root){
  'use strict';
  const A=root.SemanticArchitecture||(typeof require==='function'?require('./architecture.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('./architecture-layout.js'):null);
  const B=root.SemanticBranchRegions||(typeof require==='function'?require('./branch-regions.js'):null);
  const plans=new WeakMap(),copy=x=>JSON.parse(JSON.stringify(x));
  const flow=e=>['data','alias','interface-binding'].includes(e.kind);
  const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16);};
  function unique(base,used){let id=base;for(let i=1;used.has(id);i++)id=base+':'+i;return id;}
  const width=(s,font=16)=>Array.from(String(s)).reduce((a,c)=>a+font*(/[^\u0000-\u024f]/u.test(c)?1:/[ilI.,:;'!|]/.test(c)?.29:/[MW@#%]/.test(c)?.85:.57),0);
  function wrap(text,limit,font=16){
    const lines=[];let line='';
    // Use identifier word boundaries before falling back to character cuts.
    // Keep every character: this changes wrapping, never the source label.
    for(const token of String(text).split(/(\s+|(?<=[_.\/·→])|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z]))/u).filter(Boolean)){
      if(line&&width(line+token,font)>limit){lines.push(line.trim());line='';}
      for(const c of token){if(line&&width(line+c,font)>limit){lines.push(line.trim());line='';}line+=c;}
    }
    if(line.trim())lines.push(line.trim());return lines.length?lines:[''];
  }
  function index(plan){const nodes=new Map(plan.nodes.map(n=>[n.id,n])),children=new Map();for(const n of plan.nodes){if(!children.has(n.parent||null))children.set(n.parent||null,[]);children.get(n.parent||null).push(n.id);}return {nodes,children};}
  function relations(ir){const ins=new Map(),uses=new Map();for(const e of ir.edges){if(!ins.has(e.target))ins.set(e.target,[]);ins.get(e.target).push(e);if(!uses.has(e.source))uses.set(e.source,[]);uses.get(e.source).push(e);}return {ins,uses};}
  function literalArithmetic(n){
    // A bounded syntax recognizer, never eval: only integer literals, numeric
    // operators and parentheses. No names, calls, attributes or tensor reads.
    if(n.kind!=='compute'||n.evidence_status!=='static-only'||n.mutable||n.condition||n.runtime_evidence?.length||
      !['add','sub','mult','mul','div','floordiv','mod','pow'].includes(n.operator)||n.source?.length!==1)return false;
    const text=n.source[0].expression;if(typeof text!=='string'||text.length>160)return false;
    const tokens=text.match(/\d(?:_?\d)*|\/\/|\*\*|[()+*\/%\-]/g)||[];
    if(tokens.join('')!==text.replace(/\s/g,''))return false;
    let at=0,operations=0;
    function atom(depth){
      if(depth>16)return false;
      if(['+','-'].includes(tokens[at])){at++;return atom(depth+1);}
      if(/^\d(?:_?\d)*$/.test(tokens[at]||'')){at++;return true;}
      if(tokens[at]==='('){at++;if(!expression(depth+1)||tokens[at]!==')')return false;at++;return true;}
      return false;
    }
    function expression(depth){if(!atom(depth))return false;while(['+','-','*','/','//','%','**'].includes(tokens[at])){at++;operations++;if(!atom(depth))return false;}return true;}
    return expression(0)&&at===tokens.length&&operations>0;
  }
  function policy(ir,focus=null,inside=null){
    const {ins,uses}=relations(ir),by=new Map(ir.nodes.map(n=>[n.id,n])),bindings=new Map(),metadata=new Set();
    function configUse(e){
      const n=by.get(e.target),name=(n?.function_target||'').split('.').at(-1),port=e.target_port;
      if(n?.kind!=='compute')return false;
      if(['kw:dim','kw:keepdim','kw:keepdims','kw:size','kw:device','kw:dtype','kw:p','kw:negative_slope','kw:eps','kw:training','kw:align_corners'].includes(port))return true;
      if(['view','expand','transpose','permute','squeeze','unsqueeze'].includes(name))return port.startsWith('arg:');
      if(name==='reshape')return port!=='receiver'&&port!=='arg:0';
      if(['zeros','ones','rand','randn'].includes(name))return port.startsWith('arg:');
      return false;
    }
    for(const n of ir.nodes){const es=ins.get(n.id)||[],out=uses.get(n.id)||[];
      const one=es.length===1&&!es[0].condition&&flow(es[0]);
      const boundary=inside&&es.some(e=>!inside.has(e.source));
      // A focused alias fed from outside is a real local binding. Contracting
      // it to the out-of-scope producer strands both synthetic boundary ports.
      if(n.kind==='value-alias'&&!n.operator&&one&&!boundary)bindings.set(n.id,{...es[0],source_port:n.slot??es[0].source_port});
      if(n.kind==='interface'&&one&&!boundary&&n.parent!==focus&&(n.role==='input'||out.length))bindings.set(n.id,es[0]);
      const literalValue=Object.hasOwn(n,'value')&&n.value!==undefined&&!(n.value&&typeof n.value==='object'&&!Array.isArray(n.value));
      if(n.operator==='shape'||(['state','buffer'].includes(n.kind)&&(literalValue||out.length&&out.every(configUse))))metadata.add(n.id);
    }
    let changed=true;while(changed){changed=false;for(const [id,e]of bindings)if(metadata.has(e.source)&&!metadata.has(id)){metadata.add(id);changed=true;}}
    // Prove a closed literal-only dependency subgraph first. A plausible source
    // string cannot override an incoming tensor, state, condition or runtime edge.
    const pure=new Set(),staticEdge=e=>flow(e)&&e.source_port==='out'&&!e.condition&&['source-dependency','static-source'].includes(e.evidence);
    changed=true;while(changed){changed=false;for(const n of ir.nodes){
      if(pure.has(n.id)||n.evidence_status!=='static-only'||n.mutable||n.condition||n.runtime_evidence?.length)continue;
      const incoming=ins.get(n.id)||[],alias=n.kind==='value-alias'&&!n.operator&&n.slot==null&&incoming.length===1;
      if((literalArithmetic(n)||alias)&&incoming.every(e=>staticEdge(e)&&pure.has(e.source))){pure.add(n.id);changed=true;}
    }}
    // Only configuration consumers justify attachment. A returned scalar or a
    // coefficient in feature arithmetic keeps the entire value chain visible.
    const configurationOnly=new Set();changed=true;
    while(changed){changed=false;for(const id of pure){const out=uses.get(id)||[];
      if(!configurationOnly.has(id)&&out.length&&out.every(e=>staticEdge(e)&&(configUse(e)||configurationOnly.has(e.target)))){configurationOnly.add(id);changed=true;}
    }}
    const configurationArithmetic=[];
    for(const id of configurationOnly){metadata.add(id);const n=by.get(id);
      configurationArithmetic.push({node:id,kind:n.kind==='compute'?'literal-arithmetic':'literal-binding',
        proof_scope:'full-extracted-graph',basis:'integer-literal-syntax-and-configuration-only-uses',
        expression:n.source?.[0]?.expression||n.label,dependencies:(ins.get(id)||[]).map(copy),uses:(uses.get(id)||[]).map(copy),
        value_evaluation:'not-performed',source:copy(n.source||[])});
    }
    return {bindings,metadata,ins,uses,configurationArithmetic};
  }
  function value(id,port='out',bindings){const seen=new Set();while(bindings.has(id)&&!seen.has(id)){seen.add(id);const e=bindings.get(id);id=e.source;const outer=e.source_port??'out';port=outer==='out'?port:port==='out'?outer:outer+'.'+port;}return {id,port};}
  function descendants(id,children){const all=[],todo=[...(children.get(id)||[])];for(let i=0;i<todo.length;i++){all.push(todo[i]);todo.push(...children.get(todo[i])||[]);}return all;}
  function category(n){
    const op=A.operator(n)||'',type=n.semantic_type||'';
    if(n.kind==='opaque')return 'unknown';
    if(n.kind==='interface')return 'interface';
    if(n.kind==='control'||['conditional-region','loop-template'].includes(type))return 'control';
    if(type.startsWith('residual')||['add','mult','mul'].includes(op)||['gate','gated-sum'].includes(type))return 'algebra';
    if(['lstm','gru','rnn'].includes(op))return 'recurrent';
    if(op.includes('attention')||type.includes('attention'))return 'attention';
    if(op==='convolution'||type.includes('convolution')||type==='CNN block')return 'convolution';
    if(['parameter','buffer','state'].includes(n.kind))return 'resource';
    if(n.kind==='composite')return 'module';return 'operation';
  }
  const palette={module:['#f1f4fa','#62748c'],operation:['#edf4fc','#456c96'],convolution:['#e9f4ee','#4d7e67'],attention:['#eeedfa','#72659b'],recurrent:['#fff1e2','#a17b41'],algebra:['#f7eef7','#90678e'],control:['#fff7dc','#a48c3d'],unknown:['#fff4f0','#ac6857'],interface:['#ffffff','#7e8b9b'],resource:['#f7f6f2','#8a8474']};
  function configuration(n){
    if(n.kind==='compute'&&n.operator==='reshape'&&!n.mutable){
      const name=n.function_target?.split('.').at(-1),a=n.arguments?.args||[],k=n.arguments?.kwargs||{};
      let dims=['view','reshape'].includes(name)?k.shape:undefined;
      if(dims===undefined&&['view','reshape'].includes(name))dims=n.function_target?.startsWith('torch.')?a[1]:a.length===1&&Array.isArray(a[0])?a[0]:a;
      if(Array.isArray(dims)&&dims.length&&dims.length<=8&&dims.every(d=>Number.isSafeInteger(d)&&d>=-1))return 'shape '+dims.join(' × ');
    }
    if(!Object.hasOwn(n,'constructor'))return '';
    const c=n.constructor||{},a=c.args||[],k=c.kwargs||c,known=x=>x!==undefined&&!(x&&typeof x==='object'&&!Array.isArray(x)),fmt=x=>Array.isArray(x)?x.join('×'):String(x);
    if(['linear','convolution'].includes(n.operator)){
      const first=a[0]??k[n.operator==='linear'?'in_features':'in_channels'],last=a[1]??k[n.operator==='linear'?'out_features':'out_channels'];
      const kernel=a[2]??k.kernel_size;return [known(first)&&known(last)?`${fmt(first)} → ${fmt(last)}`:null,n.operator==='convolution'&&known(kernel)?`k=${fmt(kernel)}`:null].filter(Boolean).join(' · ');
    }
    if(['rnn','lstm','gru'].includes(n.operator)){
      const size=a[1]??k.hidden_size,layers=k.num_layers??a[2];return [known(size)?`hidden ${fmt(size)}`:null,known(layers)?`${fmt(layers)} layers`:null,k.bidirectional===true?'bidirectional':null].filter(Boolean).join(' · ');
    }
    return '';
  }
  function inventory(units,idx){
    const names={linear:'Linear',convolution:'Convolution',normalization:'Normalization',activation:'Activation',
      sigmoid:'Sigmoid',tanh:'Tanh',add:'Add',mult:'Multiply',mul:'Multiply',matmul:'MatMul',
      softmax:'Softmax',pooling:'Pooling',dropout:'Dropout',embedding:'Embedding',concat:'Concat',
      rnn:'RNN',lstm:'LSTM',gru:'GRU',structure:'Pack values',transpose:'Transpose',reshape:'Reshape'};
    const rules={'feed-forward':'Feed-forward',gate:'Sigmoid gate','gated-sum':'Gated sum','convolution-block':'Convolution block',
      residual:'Residual','residual-prenorm':'Residual · Pre-Norm','residual-postnorm':'Residual · Post-Norm',
      'scaled-attention-like':'Scaled attention-like'};
    const items=[...new Set(units)].map(id=>{
      const n=idx.nodes.get(id),op=A.operator(n);let term,origin;
      if(n.kind==='opaque'){term='Unresolved';origin='unresolved';}
      else if(n.presentation_only&&Object.hasOwn(rules,n.semantic_type)){term=rules[n.semantic_type];origin='local-rule';}
      else if(n.kind==='compute'&&Object.hasOwn(names,op)){
        term=names[op];origin='operator';
        // A known framework operation may retain its more specific registered
        // class name. Source/module labels never select an algorithm meaning.
        if(n.framework_type?.startsWith('torch.nn.'))term=n.framework_type.split('.').at(-1);
        else if(op==='activation'){
          const fn=n.function_target?.split('.').at(-1)?.toLowerCase();
          if(['relu','gelu','silu','elu','leaky_relu'].includes(fn))term=({relu:'ReLU',gelu:'GELU',silu:'SiLU',elu:'ELU',leaky_relu:'LeakyReLU'})[fn];
        }
      }else{term=n.kind==='composite'?'Module':n.kind==='control'?'Control':'Other operation';origin='structure';}
      if(n.mutable)term+=' (in-place)';
      return {id,label:n.label,term,origin,kind:n.kind,operator:op,mutable:!!n.mutable,evidence_status:n.evidence_status||'unspecified'};
    });
    const terms=[];
    for(const item of items){let term=terms.find(t=>t.label===item.term&&t.origin===item.origin);
      if(!term){term={label:item.term,origin:item.origin,count:0,units:[]};terms.push(term);}term.count++;term.units.push(item.id);
    }
    return {schema:'publication-unit-inventory/1',basis:'direct-semantic-units',multiplicity:'extracted-units',
      execution_order:'not-asserted',parameter_sharing:'not-asserted',tensor_equality:'not-asserted',units:items,terms};
  }
  function inventoryCaption(contents,opaque,budget,limit){
    const terms=contents.terms.filter(t=>t.origin!=='unresolved');
    if(!terms.some(t=>['operator','local-rule'].includes(t.origin)))return null;
    // Keep the existing text envelope and node dimensions. This is a selected
    // contents summary; the complete inventory and topology caption survive.
    for(let count=terms.length;count>0;count--){
      const shown=terms.slice(0,count);
      if(!shown.some(t=>['operator','local-rule'].includes(t.origin)))continue;
      const text=[...shown.map(t=>t.label+(t.count>1?' × '+t.count:'')),count<terms.length?'+'+(terms.length-count)+' kinds':null,opaque?opaque+' unresolved':null].filter(Boolean).join(' · ');
      const lines=wrap(text,limit,13);
      if(lines.length<=budget)return {text,lines,shown_terms:shown.map(t=>({label:t.label,origin:t.origin})),omitted_kinds:terms.length-count};
    }
    return null;
  }
  function decorate(n,idx){
    const ds=descendants(n.id,idx.children).map(id=>idx.nodes.get(id)),opaque=(n.kind==='opaque'?1:0)+ds.filter(n=>n.kind==='opaque').length;
    const cat=category(n),[fill,stroke]=palette[cat],type=n.semantic_type||n.operator||n.kind;
    const captionsByType={'source-module':'Module','source-function':'Function','sequential':'Sequential','structural-region':'Dependency region','interface':'','value-alias':'Value','structure':'','rnn':'RNN','lstm':'LSTM','gru':'GRU','gated-sum':'2 sigmoid-gated products','residual':'Residual path','residual-prenorm':'Residual · Pre-Norm','residual-postnorm':'Residual · Post-Norm'};
    let title=n.label,caption=configuration(n)||(Object.hasOwn(captionsByType,type)?captionsByType[type]:type);
    const sourceClass=n.module_path&&(n.source_class||n.source?.find(s=>s.symbol?.endsWith('.forward')&&s.expression?.startsWith('def forward('))?.symbol.slice(0,-8));
    if(sourceClass&&sourceClass!==title)caption=sourceClass+(caption&&caption!=='Module'?' · '+caption:'');
    if(n.operator==='structure')title=n.structure_kind==='dict'?'Pack mapping':'Pack values';
    if(n.kind==='compute'&&n.framework_type){const short=n.framework_type.split('.').at(-1);title=n.label.includes(' · ')?n.label.split(' · ')[0]+' · '+short:n.label;}
    if(['structural-region','branch-region','branch-path','branch-panel','dependency-band','dependency-panel','boundary-interface-group'].includes(n.semantic_type))caption=n.region_summary;
    if(n.boundary_caption)caption=n.boundary_caption;
    if(opaque&&n.kind!=='opaque')caption+=(caption?' · ':'')+opaque+' unresolved';
    if(n.kind==='opaque')caption='Unresolved operation';
    if(n.mutable)caption+=(caption?' · ':'')+'In-place update';
    const symbol=n.kind==='compute'&&!n.mutable&&(['add','mult','mul'].includes(n.operator)||/^aten\.(add|mul)\./.test(n.operator||''))?(n.operator==='add'||n.operator.startsWith('aten.add.')?'+':'×'):null;
    const maxWidth=n.kind==='interface'?126:184,font=n.kind==='interface'?15:16;
    const lines=wrap(title,n.kind==='composite'?maxWidth-20:maxWidth,font),captions=caption?wrap(caption,maxWidth,13):[];
    n.paper={title,caption,lines,captions,font,fill,stroke,category:cat,unknown_count:opaque,symbol,
      w:symbol?48:n.kind==='interface'?154:212,h:symbol?48:Math.max(n.kind==='interface'?44:64,22+lines.length*20+captions.length*16)};
    if(n.content_inventory){
      const summary=inventoryCaption(n.content_inventory,opaque,captions.length,maxWidth);
      if(summary){n.paper.caption=summary.text;n.paper.captions=summary.lines;n.paper.caption_scope='unit-inventory';n.paper.layout_caption_rows=captions.length;
        n.paper.inventory_summary={shown_terms:summary.shown_terms,omitted_kinds:summary.omitted_kinds};}
    }
    return n.paper;
  }
  function build(ir){
    const plan=A.build(ir);
    // A large residual enclosure can hide an entire hybrid network behind one
    // label. Keep its named source stages on the main frontier; the finding,
    // operand identity and actual skip edge remain, without an extra frame.
    for(const n of plan.nodes.slice())if(n.presentation_only&&n.semantic_type.startsWith('residual')&&plan.nodes.some(c=>c.parent===n.id&&c.kind==='composite'&&!c.presentation_only&&c.module_path)){
      for(const child of plan.nodes)if(child.parent===n.id)child.parent=n.parent;
      plan.nodes=plan.nodes.filter(c=>c.id!==n.id);
      const f=plan.findings.find(f=>f.id===n.finding);if(f){f.presentation='annotation';f.presentation_reason='Publication keeps named source stages visible; residual operand and skip edge are retained.';}
    }
    const idx=index(plan),by=idx.nodes,children=idx.children,pol=policy(ir),findings=plan.findings;
    function owner(id,parent){while(id!=null&&by.get(id)?.parent!==parent)id=by.get(id)?.parent;return id;}
    const original=new Set(ir.nodes.map(n=>n.id));
    function region(parent,members,type,label,summary,roles,proof){
      const id=unique('paper:'+type+':'+hash(parent+'|'+members.join('|')),by),closure=new Set(members.flatMap(id=>[id,...descendants(id,children)]));
      // Whole-value output aliases belong to the region producing them. Keep
      // their original slots and source records rather than exposing false
      // boundary inputs when a focused panel is later expanded.
      let changed=true;while(changed){changed=false;for(const child of children.get(parent)||[]){
        const binding=pol.bindings.get(child);
        if(!closure.has(child)&&by.get(child).kind==='value-alias'&&binding&&closure.has(binding.source)){
          members.push(child);closure.add(child);changed=true;
        }
      }}
      const canonical=[...closure].filter(id=>original.has(id)),inside=new Set(canonical);
      const group={id,kind:'composite',label,parent,source:members.flatMap(id=>by.get(id).source||[]).slice(0,32),source_parent:null,runtime_evidence:[],
        semantic_type:type,presentation_only:true,granularity:'composite',evidence_status:'static-only',canonical_members:canonical,
        boundary_ports:ir.edges.filter(e=>inside.has(e.source)!==inside.has(e.target)).map(copy),region_summary:summary,finding:id};
      findings.push({id,rule:type,label,members:members.slice(),roles,proof:proof||['Fork/join boundaries and separate paths in the extracted dependency graph. No execution concurrency or model-family semantics is inferred.'],evidence_scope:'presentation',presentation:'group',rule_version:'publication/2'});
      plan.nodes.push(group);by.set(id,group);children.set(id,members);
      for(const member of members)by.get(member).parent=id;
      children.set(parent,[...(children.get(parent)||[]).filter(id=>!closure.has(id)),id]);
      return id;
    }
    // Find inner diamonds first, then revisit the enclosing scope so nested
    // diamonds can compose. Input interfaces stay local during this analysis.
    // All existing module boundaries, canonical cuts and unknowns are retained.
    const scopes=plan.nodes.filter(n=>n.kind==='composite').map(n=>n.id);
    for(const parent of scopes)for(let iteration=0;iteration<32;iteration++){
      const kids=(children.get(parent)||[]).filter(id=>!pol.metadata.has(id)&&!pol.bindings.has(id)&&by.get(id).kind!=='parameter');
      // The general policy contracts local interfaces; restore them as real
      // fork/join anchors while considering this particular source scope.
      for(const id of children.get(parent)||[])if(by.get(id).kind==='interface'&&!kids.includes(id))kids.push(id);
      const active=new Set(kids),bindings=new Map(pol.bindings),adj=new Map(kids.map(id=>[id,new Set()])),barriers=new Set(),externalBoundary=new Set();
      for(const id of kids)if(by.get(id).kind==='interface')bindings.delete(id);
      for(const e of ir.edges){
        const resolved=value(e.source,e.source_port,bindings).id,a=owner(resolved,parent),b=owner(e.target,parent);
        if(e.condition||['control','state-write'].includes(e.kind)){if(active.has(a))barriers.add(a);if(active.has(b))barriers.add(b);}
        if(flow(e)&&!e.condition&&active.has(a)&&active.has(b)&&a!==b)adj.get(a).add(b);
        if(flow(e)&&!pol.metadata.has(resolved)&&by.get(resolved)?.kind!=='parameter'){
          if(a==null&&active.has(b))externalBoundary.add(b);
          if(b==null&&active.has(a))externalBoundary.add(a);
        }
      }
      const forbidden=id=>barriers.has(id)||[id,...descendants(id,children)].some(child=>{const n=by.get(child);return n.mutable||n.kind==='control'||n.condition||['conditional-region','loop-template'].includes(n.semantic_type);});
      const candidates=B.discover(kids,adj).filter(c=>![c.entry,c.exit,...c.members].some(forbidden)&&!c.members.some(id=>externalBoundary.has(id)));
      const candidate=candidates[0];if(!candidate)break;
      const paths=candidate.branches.map((members,i)=>region(parent,members.slice(),'branch-path','Path '+(i+1),members.slice(0,3).map(id=>by.get(id).label).join(' → ')+(members.length>3?' → …':''),{entry:candidate.entry,exit:candidate.exit,path_index:i}));
      // A wide fanout must not force all paths into a single unprintable row.
      // Build a reversible tree of at most three independent path summaries
      // per panel. The hierarchy is presentation only, with exact cuts at
      // every level; it adds no dependency between adjacent summaries.
      let panels=paths.map((id,i)=>({id,first:i+1,last:i+1,paths:[id]}));
      while(panels.length>3){
        const next=[],size=Math.min(3,Math.ceil(panels.length/Math.ceil(panels.length/3)));
        for(let i=0;i<panels.length;i+=size){
          const chunk=panels.slice(i,i+size);if(chunk.length===1){next.push(chunk[0]);continue;}
          const first=chunk[0].first,last=chunk.at(-1).last,members=chunk.flatMap(p=>p.paths);
          const id=region(parent,chunk.map(p=>p.id),'branch-panel',`Paths ${first}–${last}`,members.length+' separate dependency paths',
            {entry:candidate.entry,exit:candidate.exit,paths:members,path_range:[first,last],execution_parallelism:'not-asserted'});
          next.push({id,first,last,paths:members});
        }
        panels=next;
      }
      region(parent,panels.map(p=>p.id),'branch-region','Branches × '+paths.length,paths.length+' dependency paths',
        {entry:candidate.entry,exit:candidate.exit,paths,execution_parallelism:'not-asserted'});
    }
    // Interwoven DAGs have shared intermediate values and cross-links, so
    // they cannot be called separate branch paths. Partition broad frontiers
    // by longest dependency depth instead. Exact cross-band and skip edges
    // remain in the canonical cut; no serial algorithm or concurrency claim.
    for(const parent of scopes){
      // A loop body is a source template with carried values across its
      // boundary, not a closed feed-forward scope for depth grouping.
      if(by.get(parent).semantic_type==='loop-template')continue;
      const core=(children.get(parent)||[]).filter(id=>!pol.metadata.has(id)&&!pol.bindings.has(id)&&!['interface','parameter'].includes(by.get(id).kind));
      if(core.length<9)continue;
      const active=new Set(core),adj=new Map(core.map(id=>[id,new Set()])),degree=new Map(core.map(id=>[id,0])),depth=new Map(core.map(id=>[id,0]));
      for(const edge of ir.edges){
        const a=owner(value(edge.source,edge.source_port,pol.bindings).id,parent),b=owner(edge.target,parent);
        if(active.has(a)&&active.has(b)&&a!==b&&!adj.get(a).has(b)){adj.get(a).add(b);degree.set(b,degree.get(b)+1);}
      }
      const ready=core.filter(id=>!degree.get(id));
      for(let at=0;at<ready.length;at++)for(const to of adj.get(ready[at])){
        depth.set(to,Math.max(depth.get(to),depth.get(ready[at])+1));degree.set(to,degree.get(to)-1);if(!degree.get(to))ready.push(to);
      }
      if(ready.length!==core.length)continue; // Feedback keeps the SCC view.
      const bands=new Map();for(const id of core){const rank=depth.get(id);if(!bands.has(rank))bands.set(rank,[]);bands.get(rank).push(id);}
      if([...bands.values()].filter(ids=>ids.length>=3).length<2)continue;
      const proof=['Presentation grouping at the same longest dependency depth in an acyclic scope. All canonical cross-links, values and operands remain; no independent-path or model-family claim.'];
      for(const [rank,units]of [...bands].sort((a,b)=>a[0]-b[0])){
        if(units.length<2)continue;
        let panels=units.map((id,i)=>({id,first:i+1,last:i+1,units:[id]}));
        while(panels.length>3){
          const next=[];for(let i=0;i<panels.length;i+=3){
            const chunk=panels.slice(i,i+3);
            const first=chunk[0].first,last=chunk.at(-1).last,members=chunk.flatMap(p=>p.units);
            const id=region(parent,chunk.map(p=>p.id),'dependency-panel',first===last?`Unit ${first}`:`Units ${first}–${last}`,members.length+' units · dependency depth '+rank,
              {dependency_depth:rank,units:members,execution_parallelism:'not-asserted'},proof);
            next.push({id,first,last,units:members});
          }panels=next;
        }
        region(parent,panels.map(p=>p.id),'dependency-band','Dependency band '+(rank+1),units.length+' units · dependency depth '+rank,
          {dependency_depth:rank,units:units.slice(),execution_parallelism:'not-asserted'},proof);
      }
    }
    const queue=plan.nodes.filter(n=>n.kind==='composite').map(n=>n.id);
    for(let at=0;at<queue.length;at++){
      const parent=queue[at],core=(children.get(parent)||[]).filter(id=>{const n=by.get(id);return !pol.metadata.has(id)&&!pol.bindings.has(id)&&!['interface','parameter'].includes(n.kind);});
      if(core.length<=10)continue;
      const coreSet=new Set(core),adj=new Map(core.map(id=>[id,new Set()]));
      for(const e of ir.edges)if(flow(e)||e.kind==='control'){
        const a=owner(value(e.source,e.source_port,pol.bindings).id,parent),b=owner(e.target,parent);
        if(coreSet.has(a)&&coreSet.has(b)&&a!==b)adj.get(a).add(b);
      }
      const scc=L.components(core,adj),unit=new Map();scc.forEach((ids,i)=>ids.forEach(id=>unit.set(id,i)));
      const next=scc.map(()=>new Set()),degree=scc.map(()=>0),order=new Map(core.map((id,i)=>[id,i]));
      for(const [a,targets]of adj)for(const b of targets){const x=unit.get(a),y=unit.get(b);if(x!==y&&!next[x].has(y)){next[x].add(y);degree[y]++;}}
      const ready=scc.map((_,i)=>i).filter(i=>!degree[i]),sorted=[];
      while(ready.length){ready.sort((a,b)=>Math.min(...scc[a].map(id=>order.get(id)))-Math.min(...scc[b].map(id=>order.get(id))));const i=ready.shift();sorted.push(scc[i]);for(const j of next[i])if(!--degree[j])ready.push(j);}
      // Large SCCs can be split for presentation, retaining all feedback edges.
      // Acyclic units are contiguous in topological order, so their partition
      // cannot manufacture a cycle. Regions never assert a serial algorithm.
      for(let j=sorted.length-1;j>=0;j--)if(sorted[j].length>10){const ids=sorted[j],size=Math.ceil(ids.length/7);sorted.splice(j,1,...Array.from({length:Math.ceil(ids.length/size)},(_,i)=>ids.slice(i*size,(i+1)*size)));}
      const chunk=Math.max(2,Math.ceil(sorted.length/7));
      for(let i=0;i<sorted.length;i+=chunk){
        const members=sorted.slice(i,i+chunk).flat();if(members.length<2)continue;
        const id=unique('paper:region:'+hash(parent+'|'+members.join('|')),by),inside=members.flatMap(id=>[id,...descendants(id,children)]),canonical=inside.filter(id=>ir.nodes.some(n=>n.id===id));
        const names=members.slice(0,3).map(id=>by.get(id).label),label='Stage '+String(Math.floor(i/chunk)+1).padStart(2,'0');
        const sources=members.flatMap(id=>by.get(id).source||[]).slice(0,32);
        const memberSet=new Set(canonical);
        const group={id,kind:'composite',label,parent,source:sources,source_parent:null,runtime_evidence:[],semantic_type:'structural-region',presentation_only:true,granularity:'composite',evidence_status:'static-only',canonical_members:canonical,
          boundary_ports:ir.edges.filter(e=>memberSet.has(e.source)!==memberSet.has(e.target)).map(e=>copy(e)),region_summary:members.length+' units · '+names.join(' · ')+(members.length>3?' · +'+(members.length-3):''),finding:id};
        findings.push({id,rule:'structural-region',label,members,roles:{},proof:['Presentation partition of contiguous dependency-order units. No algorithm or model-family semantics is inferred.'],evidence_scope:'presentation',presentation:'group',rule_version:'publication/1'});
        plan.nodes.push(group);by.set(id,group);children.set(id,members);queue.push(id);
        for(const member of members)by.get(member).parent=id;
        children.set(parent,[...(children.get(parent)||[]).filter(id=>!members.includes(id)),id]);
      }
    }
    const final=index(plan);
    for(const n of plan.nodes)if(['dependency-band','dependency-panel'].includes(n.semantic_type)){
      const f=findings.find(f=>f.id===n.finding);
      if(f?.roles.units)n.content_inventory=inventory(f.roles.units,final);
    }
    for(const n of plan.nodes)decorate(n,final);
    plan.publication={schema:'archcanvas-publication-plan/1',structural_regions:plan.nodes.filter(n=>n.semantic_type==='structural-region').length};
    return plan;
  }
  function plan(ir){if(!plans.has(ir))plans.set(ir,build(ir));return plans.get(ir);}
  const wireLabel=edge=>edge.bundle_members.length+(edge.bundle_values===1?' uses':edge.bundle_values===edge.bundle_members.length?' values':' links');
  function presentEdges(edges,idx){
    const groups=new Map(),used=new Set(edges.map(e=>e.id));
    for(const edge of edges){
      const a=idx.nodes.get(edge.source),b=idx.nodes.get(edge.target);
      // Closed presentation panels and repeated uses of one boundary result
      // may use ribbons. Each operand and canonical edge remains a member.
      // Other module connections and conditional/state edges stay explicit.
      const sharedOutput=b?.boundary_value&&b.boundary_uses?.length>1;
      if(edge.condition||!flow(edge)||!sharedOutput&&![a,b].some(n=>['branch-panel','branch-region','dependency-band','dependency-panel'].includes(n?.semantic_type)))continue;
      const key=JSON.stringify([edge.source,edge.target,edge.kind,edge.evidence]);
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(edge);
    }
    const ribbons=new Map();
    for(const [key,members]of groups)if(members.length>1){
      const id=unique('paper:wire:'+hash(key+'|'+members.map(e=>e.id).join('|')),used);used.add(id);
      const values=new Set(members.map(e=>JSON.stringify([e.resolved_source,e.source_port]))).size,first=members[0];
      const ribbon={id,source:first.source,target:first.target,kind:'data-bundle',evidence:first.evidence,
        source_port:'bundle',target_port:'bundle',resolved_source:id,
        originals:members.flatMap(e=>e.originals),bundle_members:members.map(copy),
        bundle_values:values,tensor_equality:'not-asserted'};
      for(const member of members)ribbons.set(member.id,ribbon);
    }
    const emitted=new Set();return edges.flatMap(edge=>{const ribbon=ribbons.get(edge.id);if(!ribbon)return [edge];if(emitted.has(ribbon.id))return [];emitted.add(ribbon.id);return [ribbon];});
  }
  function focusPlan(ir,base,focus){
    const p={...base,nodes:base.nodes.slice(),findings:base.findings.slice()},idx=index(p),used=new Set(idx.nodes.keys()),inside=new Set([focus,...descendants(focus,idx.children)]),boundaryReps=new Map(),boundary=[],inputValues=new Map(),outputValues=new Map(),rels=relations(ir);
    const {metadata,bindings}=policy(ir,focus,inside);
    for(const e of ir.edges){const input=!inside.has(e.source)&&inside.has(e.target),output=inside.has(e.source)&&!inside.has(e.target);if(!input&&!output)continue;
      // An interface inside a closed child is not a panel-level terminal.
      // Reusing it leaves an edge pointing at a node with no visible geometry.
      const local=idx.nodes.get(input?e.target:e.source),external=idx.nodes.get(input?e.source:e.target),existing=local?.kind==='interface'&&local.parent===focus&&local.role===(input?'input':'output');
      if(metadata.has(e.source)||metadata.has(e.target)){
        boundary.push({...copy(e),direction:input?'input':'output',port_node:local.id,presentation:'attached-metadata'});continue;
      }
      // Match the compact projection's resource policy. These cuts are
      // attached to the consumer, never orphan synthetic data inputs.
      if(input&&external?.kind==='parameter'&&!(rels.ins.get(external.id)||[]).length&&(rels.uses.get(external.id)||[]).every(edge=>['data','parameter-read'].includes(edge.kind))){
        boundary.push({...copy(e),direction:'input',port_node:local.id,presentation:'attached-resource'});continue;
      }
      // Interface binding and data use can read the exact same value. The
      // value identity is shared; every original cut and use remains distinct.
      const resolved=value(e.source,e.source_port,bindings);
      const valueKey=input?JSON.stringify([e.source,e.source_port,flow(e)?'value':e.kind]):
        flow(e)&&!e.condition?JSON.stringify([resolved.id,resolved.port,e.kind,e.evidence]):null;
      const shared=!existing&&(input?inputValues.get(valueKey):valueKey&&outputValues.get(valueKey));
      let id=existing?local.id:shared||unique('paper:port:'+hash(focus+'|'+e.id),used);used.add(id);
      if(!existing&&!shared){const localBinding=input&&local?.kind==='value-alias';
        const n={id,parent:focus,kind:'interface',role:input?'input':'output',label:localBinding?local.label:!input&&external?.operator==='structure'?'slot '+e.target_port:external?.label||e.source_port,source:(localBinding?local.source:external?.source)||local?.source||[],evidence_status:external?.evidence_status||'static-only',runtime_evidence:[],boundary_edge:e.id,canonical_endpoint:input?e.source:e.target};
        if(!input&&valueKey)n.boundary_value={source:resolved.id,source_port:resolved.port,identity_scope:'extracted-graph',tensor_equality:'not-asserted'};
        if(!input)n.boundary_uses=[];
        decorate(n,index(p));p.nodes.push(n);
      }
      if(input&&!existing)inputValues.set(valueKey,id);
      if(!input&&!existing){
        const port=p.nodes.find(n=>n.id===id);port.boundary_uses.push(copy(e));
        if(valueKey)outputValues.set(valueKey,id);
      }
      boundaryReps.set(e.id,input?{source:id}:{target:id});boundary.push({...copy(e),direction:input?'input':'output',port_node:id});
    }
    // One extracted result can have several external consumers. Represent that
    // result once; all uses retain their targets and slots in the port and cuts.
    // Conditions, state edges, evidence and producer output slots never mix.
    for(const port of p.nodes.filter(n=>n.parent===focus&&n.boundary_uses?.length>1)){
      const source=idx.nodes.get(port.boundary_uses[0].source),origin=idx.nodes.get(port.boundary_value.source);
      port.label=source?.label||origin?.label||'Output';
      if(port.boundary_value.source_port!=='out')port.label+=' ['+port.boundary_value.source_port+']';
      port.boundary_caption=port.boundary_uses.length+' external uses';
      port.source=source?.source||origin?.source||port.source;
      delete port.canonical_endpoint;
      decorate(port,index(p));
    }
    // Repeated external operation names otherwise look like unrelated outputs.
    // A panel-local target reference and its exact operand distinguish
    // unshared terminals. Shared terminals retain every use in their cut list.
    const outputNames=new Map();
    for(const n of p.nodes.filter(n=>n.parent===focus&&n.boundary_edge&&n.role==='output'&&n.boundary_uses?.length<=1)){
      if(!outputNames.has(n.label))outputNames.set(n.label,[]);outputNames.get(n.label).push(n);
    }
    for(const ports of outputNames.values())if(ports.length>1){
      const targets=[...new Set(ports.map(n=>n.canonical_endpoint))];
      for(const port of ports){
        const cut=boundary.find(e=>e.id===port.boundary_edge);
        port.boundary_base_label=port.label;
        port.label+=' ['+(targets.indexOf(port.canonical_endpoint)+1)+']';
        port.boundary_caption='to '+cut.target_port;
        decorate(port,index(p));
      }
    }
    for(const direction of ['input','output']){
      const ports=p.nodes.filter(n=>n.parent===focus&&n.boundary_edge&&n.role===direction);
      if(ports.length<=6)continue;
      const id=unique('paper:ports:'+hash(focus+'|'+direction),used);used.add(id);
      const ids=new Set(ports.map(n=>n.id)),cuts=boundary.filter(e=>ids.has(e.port_node));
      const group={id,parent:focus,kind:'composite',label:direction==='input'?'External inputs':'External outputs',semantic_type:'boundary-interface-group',presentation_only:true,
        source:[],runtime_evidence:[],canonical_members:[],boundary_ports:cuts.map(e=>copy(e)),boundary_members:ports.map(n=>n.id),finding:id,evidence_status:'static-only'};
      // Bundle only the presentation of a large boundary. Every value keeps
      // its own synthetic node, canonical cut record and physical terminal.
      for(const port of ports)port.parent=id;
      const bindings=policy(ir).bindings;
      const values=new Set(cuts.map(e=>{const source=value(e.source,e.source_port,bindings);return JSON.stringify([source.id,source.port,flow(e)?'value':e.kind]);})).size;
      group.boundary_value_count=values;group.boundary_use_count=cuts.length;
      group.region_summary=values===cuts.length?values+' distinct values':values+' values · '+cuts.length+' uses';
      p.nodes.push(group);decorate(group,index(p));
      p.findings.push({id,rule:'boundary-interface-group',presentation:'group',evidence_scope:'presentation',members:ports.map(n=>n.id),proof:['Boundary values are grouped by direction only; all canonical edges and individual ports remain in the document.']});
    }
    return {plan:p,inside,boundaryReps,boundary};
  }
  function project(ir,state,E){
    const base=plan(ir),baseIdx=index(base),mode=state.mode||'source';
    if(mode==='runtime'&&!baseIdx.nodes.has('runtime-observations'))throw Error('当前 IR 没有 CPU 执行轨迹');
    const runtimeNode=id=>{while(id){if(id==='runtime-observations'||id.startsWith('runtime:'))return true;id=baseIdx.nodes.get(id)?.parent;}return false;};
    const allowed=id=>mode==='source'?!runtimeNode(id):mode==='runtime'?runtimeNode(id):true;
    const defaultRoots=mode==='runtime'&&baseIdx.nodes.has('runtime-observations')?['runtime-observations']:baseIdx.children.get(null)||[];
    const focus=baseIdx.nodes.has(state.paperFocus)&&allowed(state.paperFocus)?state.paperFocus:defaultRoots.find(allowed);
    const focused=focusPlan(ir,base,focus),idx=index(focused.plan),pol=policy(ir,focus,focused.inside),budget=Math.max(4,Math.min(28,Number(state.paperBudget)||12));
    // Input/output interfaces of a focused panel are real, named boundaries.
    for(const port of focused.boundary)if(!port.presentation)pol.bindings.delete(port.port_node);
    for(const cut of focused.boundary.filter(c=>c.direction==='input'&&!c.presentation)){
      const target=idx.nodes.get(cut.target),incoming=pol.ins.get(cut.target)||[];
      // Contract a proven local alias to this panel's input terminal, never
      // to the hidden external producer. Even a pure pass-through stays wired.
      if(target?.kind==='value-alias'&&!target.operator&&incoming.length===1&&!cut.condition&&flow(cut))
        pol.bindings.set(target.id,{...copy(cut),source:cut.port_node,source_port:target.slot??cut.source_port});
    }
    const eligible=id=>{const n=idx.nodes.get(id);return allowed(id)&&!pol.bindings.has(id)&&!pol.metadata.has(id)&&n.kind!=='parameter';};
    const options={roots:focus?[focus]:[],bindings:pol.bindings,metadata:pol.metadata,boundaryReps:focused.boundaryReps,presentEdges,
      layout:{rankStrategy:state.paperRankStrategy==='consumer'?'consumer':'earliest',foldSerial:state.foldSerial!==false,nodeSize:n=>({...n.paper,w:n.paper.w,h:n.paper.h}),rankColumns:3,rankColumnsFor:n=>['branch-region','branch-panel','dependency-band','dependency-panel'].includes(n?.semantic_type)?3:null,gapX:28,gapY:60,foldGapX:36,framePadding:24,frameHeader:n=>Math.max(66,24+n.paper.lines.length*20+(n.paper.layout_caption_rows??n.paper.captions.length)*16),maxWidth:700}};
    let open=state.paperAuto===false?(state.open||[]):focus?[focus]:[];
    if(state.paperAuto!==false&&focus){
      // Unwrap a single source wrapper when it improves the actual overview.
      for(let i=0;i<4;i++){
        const visible=[],todo=[focus];for(let j=0;j<todo.length;j++){const id=todo[j];if(!eligible(id))continue;visible.push(id);if(open.includes(id))todo.push(...idx.children.get(id)||[]);}
        const leaves=visible.filter(id=>!open.includes(id)),containers=leaves.filter(id=>(idx.children.get(id)||[]).some(eligible));
        const wrapper=id=>{const n=idx.nodes.get(id);return n.presentation_only&&n.semantic_type.startsWith('residual')&&descendants(id,idx.children).some(child=>idx.nodes.get(child)?.module_path);};
        const candidate=containers.filter(id=>{const kids=(idx.children.get(id)||[]).filter(eligible);return (containers.length===1||wrapper(id))&&leaves.length+kids.length-1<=budget;}).sort((a,b)=>{
          const score=id=>{const n=idx.nodes.get(id);return (n.semantic_type==='sequential'?10:0)+(n.semantic_type==='structural-region'?-10:0)-(idx.children.get(id)||[]).filter(eligible).length;};return score(b)-score(a);
        })[0];
        if(!candidate)break;
        // Keep named modules closed in the overview unless they are merely a
        // wrapper around the main pipeline or contain at most one operation.
        const n=idx.nodes.get(candidate),kids=(idx.children.get(candidate)||[]).filter(eligible);
        if(['boundary-interface-group','dependency-band','dependency-panel'].includes(n.semantic_type)||n.paper.unknown_count&&!wrapper(candidate)||n.semantic_type!=='sequential'&&!wrapper(candidate)&&kids.length>2)break;
        open=[...open,candidate];
      }
    }
    // A closed module owns its interface. Contracting that interface would
    // expose each internal consumer as another, misleading boundary arrow.
    for(const n of ir.nodes)if(n.kind==='interface'&&!open.includes(n.parent))pol.bindings.delete(n.id);
    let projected=E.project(ir,{...state,view:'architecture',details:false,open},focused.plan,options);
    const edgePairs=new Map(),labeledPairs=new Set();
    for(const e of projected.edges){const key=JSON.stringify([e.source,e.target]);edgePairs.set(key,(edgePairs.get(key)||0)+1);if(e.condition||e.bundle_members)labeledPairs.add(key);}
    const requestedLabelGap=Number(state.paperLabelGapY)||0;
    const labelGapY=Math.max(Math.min(160,Math.max(0,requestedLabelGap)),...[...labeledPairs].map(key=>edgePairs.get(key)>1?32+28*edgePairs.get(key):0));
    const wireGapX=Math.max(36,...projected.edges.filter(e=>e.bundle_members).map(e=>Math.ceil(width(wireLabel(e),13)+28)));
    if(labelGapY>options.layout.gapY||wireGapX>options.layout.foldGapX){options.layout.gapY=Math.max(labelGapY,options.layout.gapY);options.layout.foldGapX=wireGapX;projected=E.project(ir,{...state,view:'architecture',details:false,open},focused.plan,options);}
    const widthMm=Math.max(80,Math.min(400,Number(state.paperWidthMm)||180));
    // Compare a bounded set of topology layouts at the requested print size.
    // The objective is readable physical scale, independent of module names.
    const fit=g=>{const ps=[...g.positions.values()];if(!ps.length)return 0;const w=Math.max(...ps.map(p=>p.x+p.w))-Math.min(...ps.map(p=>p.x))+56,h=Math.max(...ps.map(p=>p.y+p.h))-Math.min(...ps.map(p=>p.y))+56;return Math.min(widthMm/w,(state.paperFitPage===false?Infinity:240)/h);};
    let best=fit(projected);
    if(state.paperAuto!==false&&best*13*72/25.4<8.5&&!Object.keys(state.offsets||{}).length){
      const baseline=options.layout;
      for(const alternative of [
        {rankColumns:3,gapY:44,maxWidth:700,foldMinRanks:4,foldGain:.98,foldMaxColumns:2},
        {rankColumns:2,gapY:44,maxWidth:850,foldMinRanks:4,foldGain:.98,foldMaxParallel:2},
        {rankColumns:3,gapY:44,maxWidth:1000,foldMinRanks:4,foldGain:.98,foldMaxParallel:3},
        {rankColumns:3,gapY:44,maxWidth:800,foldMinRanks:4,foldGain:.98,foldMaxParallel:2,foldBoundaryRanks:true},
        {rankColumns:2,gapY:40,maxWidth:700,foldSerial:false},
        {rankColumns:3,gapY:32,maxWidth:700,foldSerial:false}
      ]){
        const candidate=E.project(ir,{...state,view:'architecture',details:false,open},focused.plan,{...options,layout:{...baseline,...alternative,gapY:Math.max(labelGapY,alternative.gapY)}}),score=fit(candidate);
        if(score>best*1.01){projected=candidate;best=score;}
      }
    }
    const ps=[...projected.positions.values()];
    if(ps.length){const x=Math.min(...ps.map(p=>p.x))-28,y=Math.min(...ps.map(p=>p.y))-28;projected.bounds={x,y,w:Math.max(...ps.map(p=>p.x+p.w))+28-x,h:Math.max(...ps.map(p=>p.y+p.h))+28-y};}
    projected.publication={schema:'archcanvas-publication/1',focus,auto:state.paperAuto!==false,open,budget,boundary:focused.boundary,
      wire_bundles:projected.edges.filter(e=>e.bundle_members).map(e=>({id:e.id,members:e.bundle_members.map(m=>m.id),values:e.bundle_values,tensor_equality:'not-asserted'})),
      configuration_arithmetic:pol.configurationArithmetic.filter(row=>allowed(row.node)),
      paper_width_mm:Math.max(80,Math.min(400,Number(state.paperWidthMm)||180)),fit_page:state.paperFitPage!==false,min_font_pt:8,unknowns:projected.nodes.filter(n=>!projected.positions.get(n.id).expanded).reduce((s,n)=>s+n.paper.unknown_count,0)};
    for(const cut of focused.boundary){let id=cut.port_node;while(id&&!projected.positions.has(id))id=idx.nodes.get(id)?.parent;cut.visible_node=id||null;}
    for(const cut of focused.boundary.filter(c=>c.presentation==='attached-metadata'&&c.visible_node)){
      if([...projected.annotations.values()].some(notes=>notes.some(note=>note.edge.id===cut.id)))continue;
      const id=cut.visible_node;if(!projected.annotations.has(id))projected.annotations.set(id,[]);
      projected.annotations.get(id).push({edge:copy(cut),resource:idx.nodes.get(pol.metadata.has(cut.source)?cut.source:cut.target),annotation_kind:'configuration-boundary'});
    }
    const original=new Map(ir.nodes.map(n=>[n.id,n]));
    const portRoles=(node,port,input)=>{
      if(!node||node.kind==='opaque')return null;
      const op=A.operator(node);
      if(['rnn','gru','lstm'].includes(op)){
        if(input)return port==='arg:0'?'xₜ':port==='arg:1'||port==='kw:hx'?(op==='lstm'?'(h₀, c₀)':'h₀'):null;
        return op==='lstm'?({'0':'sequence','1':'(hₙ, cₙ)','1.0':'hₙ','1.1':'cₙ'})[port]:({'0':'sequence','1':'hₙ'})[port];
      }
      if(op==='top-k'&&!input)return ({'0':'values','1':'indices'})[port];
      return null;
    };
    for(const edge of projected.edges){
      edge.paper_labels=[];
      if(edge.bundle_members){
        const uses=idx.nodes.get(edge.target)?.boundary_uses;
        // The shared result terminal already states this exact use count.
        // Avoid a duplicate label in its short input channel.
        if(!uses||uses.length!==edge.bundle_members.length||!uses.every(use=>edge.bundle_members.some(m=>m.id===use.id)))
          edge.paper_labels.push({text:wireLabel(edge),evidence:'Presentation bundle; individual canonical dependencies are retained in bundle_members.'});
        continue;
      }
      const from=portRoles(original.get(edge.resolved_source),edge.source_port,false),to=portRoles(original.get(edge.canonical_target),edge.target_port,true);
      if(from||to)edge.paper_labels.push({text:[from,to].filter(Boolean).join(' → '),evidence:'torch.nn / torch.topk interface contract'});
      if(edge.condition)edge.paper_labels.push({text:String(edge.condition.outcome),evidence:'source branch condition'});
    }
    for(const f of base.findings.filter(f=>f.rule==='scaled-attention-like')){
      const score=original.get(f.roles.scores),softmax=original.get(f.roles.normalization),operands=(pol.ins.get(score?.id)||[]).filter(flow),dim=softmax?.arguments?.kwargs?.dim??softmax?.arguments?.args?.[1];
      if(operands.length!==2||dim!==-1)continue;
      const left=value(operands.find(e=>e.target_port==='arg:0')?.source,'out',pol.bindings),right=value(operands.find(e=>e.target_port==='arg:1')?.source,'out',pol.bindings),transpose=original.get(right.id);
      const dims=transpose?.arguments?.args;
      if(A.operator(transpose)!=='transpose'||!transpose.function_target?.endsWith('.transpose')||!Array.isArray(dims)||dims.length!==2||!dims.includes(-1)||!dims.includes(-2))continue;
      for(const edge of projected.edges){
        let label=null;if(edge.canonical_target===score.id&&edge.target_port==='arg:0')label='Q';
        if(edge.canonical_target===transpose.id&&edge.target_port==='receiver')label='K';
        if(edge.canonical_target===f.roles.output&&edge.target_port==='arg:1')label='V';
        if(label)edge.paper_labels.push({text:label,evidence:'matmul operand order, final-axis key transpose and softmax(dim=-1)',finding:f.id});
      }
    }
    // An alias such as width must still expose the original arithmetic in the
    // consumer's inspector. Preserve the whole proven chain, not just its name.
    const proofs=new Map(pol.configurationArithmetic.map(row=>[row.node,row])),proofCache=new Map();
    function proofFor(id){if(!proofCache.has(id)){
      const rows=[],seen=new Set(),todo=[id];for(let i=0;i<todo.length;i++){const row=proofs.get(todo[i]);if(!row||seen.has(row.node))continue;seen.add(row.node);rows.push(row);todo.push(...row.dependencies.map(e=>e.source));}
      proofCache.set(id,rows);
    }return proofCache.get(id);}
    for(const notes of projected.annotations.values())for(const note of notes)if(proofs.has(note.resource?.id))note.configuration_proof=proofFor(note.resource.id);
    projected.architecture=focused.plan;return projected;
  }
  const api={plan,project,wrap,width,decorate,configuration,category,palette};root.SemanticPublication=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
