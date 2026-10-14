#!/usr/bin/env python3
"""Refresh current source figures only, with explicit identity invariants."""
import copy,json
import build_catalog as b

AREAS={'model_zoo_programmatic_guide','module_programmatic_guide','timeseries_programmatic_guide'}
def canonical(binding):
    value=copy.deepcopy({k:v for k,v in binding.items() if k not in ('points','explicit_sides','port_authority')})
    if value.get('endpoint_binding'):
        # Physical auxiliary slot numbers can change when route ordering
        # changes. The resolved IR node, tensor field and projection cannot.
        for k in ('src','dst'):value.pop(k,None)
        for k in ('rendered_src','rendered_dst'):value['endpoint_binding'].pop(k,None)
    return value
def main():
    catalog=json.loads((b.ROOT/'data/catalog.json').read_text())
    entries=b.copy_inputs();reports=[]
    for case in catalog['cases']:
        if case['historical']:continue
        for view in case['views']:
            if not view.get('json'):continue
            path=b.ROOT/view['json'];old=json.loads(path.read_text())
            if not old.get('layoutSource'):continue
            if case['collection'] not in AREAS and '/expanded_views/' not in old['layoutSource']:continue
            fresh=b.adapt(b.ROOT/old['layoutSource'],b.ROOT/old['source'])
            fresh.update(caseId=case['id'],viewKey=view['key'])
            for n in fresh['nodes']:
                if n.get('junction') and not n.get('parent'):
                    owners=[p for p in fresh['nodes'] if p['expanded'] and p['x']<n['x']<p['x']+p['w'] and p['y']<n['y']<p['y']+p['h']]
                    if owners:n['parent']=min(owners,key=lambda p:p['w']*p['h'])['id']
            previous={n['id']:n for n in old['nodes']};edges={e['id']:e for e in old['edges']}
            assert set(previous)=={n['id'] for n in fresh['nodes']},(case['title'],view['key'],'node identity changed')
            assert set(edges)=={e['id'] for e in fresh['edges']},(case['title'],view['key'],'edge identity changed')
            for n in fresh['nodes']:
                before=previous[n['id']]
                assert before.get('parent')==n.get('parent'),n['id']
                assert before.get('semantic',{})==n.get('semantic',{}) or not before.get('semantic') and '/expanded_views/' in old['layoutSource'],n['id']
                if not n.get('glyphPresentation'):assert [before[k] for k in ('x','y','w','h')]==[n[k] for k in ('x','y','w','h')],n['id']
            for e in fresh['edges']:assert canonical(edges[e['id']]['binding'])==canonical(e['binding']),(case['title'],e['id'],'canonical source relationship changed')
            assert old.get('irSha256')==fresh.get('irSha256') or not old.get('irSha256') and '/expanded_views/' in old['layoutSource'],case['title']
            b.route_markers(fresh);b.routing_policies(fresh);fresh['semanticBaseline']=b.semantic_baseline(fresh)
            b.dump(path,fresh)
            (b.ROOT/view['asset']).write_text('window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+json.dumps(case['id']+':'+view['key'])+']='+json.dumps(fresh,ensure_ascii=False,separators=(',',':'))+';\n')
            view.update(nodes=len(fresh['nodes']),edges=len(fresh['edges']),ir=fresh.get('irSource'))
            reports.append(dict(case=case['id'],title=case['title'],view=view['key'],glyphs=len([n for n in fresh['nodes'] if n.get('glyphPresentation')]),ir_preserved=old.get('irSha256')==fresh.get('irSha256'),canonical_edges_preserved=True))
    catalog['counts']['snapshotFiles']=len(entries)
    sizes={e['snapshot']:e['bytes'] for e in entries}
    for e in catalog['evidence']:
        if e['path'] in sizes:e['bytes']=sizes[e['path']]
    b.dump(b.ROOT/'data/catalog.json',catalog)
    (b.ROOT/'data/catalog.js').write_text('window.SummaryCatalog='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n')
    b.dump(b.ROOT/'verification/source-glyphs/refresh.json',reports)
    print(json.dumps(dict(views=len(reports),glyph_instances=sum(r['glyphs'] for r in reports),canonical_edges_preserved=True)))

if __name__=='__main__':main()
