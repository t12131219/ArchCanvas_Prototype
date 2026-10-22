"""Audit real compact SVGs against source-checked ordinary evidence SVGs."""
import ast
import json
import re
import xml.etree.ElementTree as ET
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
import audit_local_svg as summaries
from check_stage_routes import geometry
ROOT = content.ROOT
OUT = ROOT/'verification/call-boundaries/current'
read, sha = content.read, content.sha


def reports():
    return [read(OUT/f) for f in ['small-report.json','Transformer-F0-report.json','Transformer-F0-boundary-report.json',*[f'Transformer-F1-{i}-report.json' for i in range(3)]]]


def boundary(doc, node, shape):
    p = node['local_pipeline']; canonical = {n['id']:n for n in doc['ir']['nodes']}
    operations = [dict(node=o['node'],label=o['label']) for o in p['operations']]
    assert p['result_operation'] == operations[-1]['node']
    reads = []
    for r in p['source_reads']:
        actual = operands.syntax_for(doc['ir'], canonical[r['node']])
        assert isinstance(actual, ast.Attribute) and isinstance(actual.value, ast.Name) and actual.value.id == 'self'
        assert ast.unparse(actual) == r['expression']
        reads.append(dict(node=r['node'],expression=r['expression']))
    identity = p.get('owner_identity')
    identity_text = f"{identity['label']} · source call {identity['invocation']}/{identity['count']}" if identity else None
    title = 'Source: '+canonical[node['id']]['label']
    captions = [f'{len(operations)} operations · folded','Result: '+operations[-1]['label'],
                f"{len(reads)} source read"+('' if len(reads)==1 else 's'),*([identity_text] if identity else [])]
    expected = dict(schema='source-call-boundary/1',node=node['id'],label=canonical[node['id']]['label'],
                    operations=operations,result=operations[-1],source_reads=reads,cuts=p['cuts'],identity=identity_text,
                    printed_title=title,printed_captions=captions,
                    scope='Source call, result operation, read occurrences and routed boundary only. Internal dependency structure and operands are folded; no purity, value equality, execution or model-family assertion.')
    assert node['paper']['call_boundary'] == expected == json.loads(shape.get('data-call-boundary'))
    text = ''.join(''.join(c.itertext()) for c in shape if c.tag.endswith('text'))
    norm = lambda s: re.sub(r'\s','',s)
    assert norm(text) == norm(title+''.join(captions))
    tooltip = ''.join(shape.find('{http://www.w3.org/2000/svg}title').itertext())
    assert expected['scope'] in tooltip
    for b in p['bindings']: assert f"{b['edge']}: {b['producer']} [{b['source_port']}] → {b['target']} [{b['target_port']}]" in tooltip
    for r in p['source_reads']:
        for e in r['edges']: assert f"Source read {e['id']}: {r['expression']} ({r['node']}) → {e['target']} [{e['target_port']}]" in tooltip
    check, = [c for c in doc['summary_coverage'] if c['node']==node['id']]
    assert check['status']=='unfulfilled' and check['form']=='call-boundary' and check['boundary_status']=='fulfilled'
    assert not check['detailed_relationships_fulfilled'] and check['missing_operation_nodes'] and check['missing_internal_paths']


if __name__ == '__main__':
    captures=reports(); hashes=captures[0]['implementation_sha256']
    for file,h in hashes.items(): assert sha(ROOT/file)==h, file
    extraction=read(OUT/'extraction.json');assert not extraction['runtime_executed']
    assert sha(ROOT/extraction['source'])==extraction['source_sha256']
    for r in extraction['rows']:assert sha(ROOT/r['input'])==r['sha256']
    content.OUT=operands.OUT=OUT
    # Every compact pipeline must equal one independently source/partition/
    # binding/identity-checked pipeline from an actual ordinary evidence SVG.
    verified={}; rows=[]
    for report in captures:
        assert report['implementation_sha256']==hashes
        for row in report['rows']:
            assert sha(ROOT/row['input'])==row['input_sha256']
            docs=[];direct=[];counts=[]
            for c in row['results']:
                d,goals,_=content.inspect(c,row['name']+'-'+c['suffix'],sequences.check_operation,require_quality=False)
                assert d['ir']==read(ROOT/row['input']); operands.check_svg_bindings(c,d)
                svg=ET.parse(OUT/c['svg']).getroot(); nodes={n.get('data-node-id'):n for n in svg.iter() if n.get('data-node-id')}
                planned={n['id']:n for n in d['architecture']['nodes']}
                compact={id for id,n in planned.items() if id in nodes and n['paper'].get('call_boundary')}
                receipt=d['publication'].get('local_pipelines')
                plain={**d,'publication':{**d['publication'],'local_pipelines':{**receipt,'rows':[r for r in receipt['rows'] if r['node'] not in compact]}}} if receipt else d
                summaries.audit_pipeline_summaries(plain,{'local_pipelines':plain['publication'].get('local_pipelines')},nodes)
                summaries.audit_contract_stages(d,{'contract_stages':d['publication'].get('contract_stages')},nodes)
                for r in receipt['rows'] if receipt else []:
                    p=planned[r['node']]['local_pipeline']; key=(row['input_sha256'],r['node'])
                    if r['node'] in compact:
                        assert key in verified and p==verified[key], ('no independently checked ordinary source proof',key)
                        boundary(d,planned[r['node']],nodes[r['node']])
                    elif not compact:verified[key]=p
                q=c['quality'];assert q==d['diagnostics']['publication']
                assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
                assert not q['line_geometry']['unrelated_contacts']
                assert not [p for p in q['line_geometry']['overlapping_paths'] if not p['same_value']]
                assert geometry(d['layout']['edges'])==q['line_geometry']['crossings']
                docs.append(d);direct.append(goals);counts.append(len(compact))
            a,b=docs
            assert a['ir']==b['ir'];assert direct[0]<=direct[1]
            if row['comparison']=='same-state-regression':assert row['results'][0]['svg_sha256']==row['results'][1]['svg_sha256']
            elif row['comparison']=='evidence-vs-boundary':
                assert counts[1]>0 and not counts[0]
                for key in ['publication','expression_goals','summary_goals']:assert a[key]==b[key],(row['name'],key)
                for key in ['node_accounting','edge_accounting','representatives','frame_ownership']:assert a['layout'].get(key)==b['layout'].get(key)
                assert [{k:v for k,v in e.items() if k!='route'} for e in a['layout']['edges']]==[{k:v for k,v in e.items() if k!='route'} for e in b['layout']['edges']]
                assert {n['id'] for n in a['layout']['nodes']}=={n['id'] for n in b['layout']['nodes']}
                for n in a['architecture']['nodes']:
                    if n.get('local_pipeline'): assert n['local_pipeline']==next(o for o in b['architecture']['nodes'] if o['id']==n['id'])['local_pipeline']
            else:
                assert counts[0] and not counts[1] and len(b['layout']['nodes'])>len(a['layout']['nodes'])
                for n in a['architecture']['nodes']:
                    if n.get('paper',{}).get('call_boundary'):
                        c,=[c for c in b['summary_coverage'] if c['node']==n['id']]
                        assert c['status']=='fulfilled' and c['form']=='operation-paths'
            rows.append(dict(name=row['name'],comparison=row['comparison'],boundary_counts=counts,
                             dimensions=[[c['quality']['native_width_px'],c['quality']['native_height_px']] for c in row['results']],
                             wire=[c['quality']['wire_length'] for c in row['results']],crossings=[c['quality']['line_geometry']['crossings'] for c in row['results']]))
    result=dict(schema='call-boundaries-independent/1',passed=True,formal_svgs=len(rows)*2,implementation_sha256=hashes,rows=rows,goal_complete=False)
    assert result['formal_svgs']==36
    (OUT/'independent-checks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(rows))
