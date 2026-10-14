#!/usr/bin/env python3
"""Refresh additive route metadata from source while retaining routed geometry."""
import copy
import json
import build_catalog as b

def main():
    catalog=json.loads((b.ROOT/'data/catalog.json').read_text())
    views=markers=0
    for case in catalog['cases']:
        for view in case['views']:
            if not view.get('json'):continue
            target=b.ROOT/view['json'];current=json.loads(target.read_text())
            if current.get('layoutSource'):fresh=b.adapt(b.ROOT/current['layoutSource'],b.ROOT/current['source'])
            elif case['id']=='pytorch-original':fresh=b.original_transformer()
            else:fresh=b.visual_svg(b.ROOT/current['source'])
            for n in fresh['nodes']:
                if current.get('layoutSource') and n.get('junction') and not n.get('parent'):
                    owners=[v for v in fresh['nodes'] if v.get('expanded') and v['x']<n['x']<v['x']+v['w'] and v['y']<n['y']<v['y']+v['h']]
                    if owners:n['parent']=min(owners,key=lambda v:v['w']*v['h'])['id']
            b.route_markers(fresh);b.routing_policies(fresh)
            assert {n['id'] for n in current['nodes']}=={n['id'] for n in fresh['nodes']},case['id']
            assert {e['id'] for e in current['edges']}=={e['id'] for e in fresh['edges']},case['id']
            nodes={n['id']:n for n in fresh['nodes']};edges={e['id']:e for e in fresh['edges']}
            for n in current['nodes']:
                original=nodes[n['id']]
                assert n.get('semantic',{})==original.get('semantic',{}) and n.get('parent')==original.get('parent'),(case['id'],view['key'],n['id'],n.get('parent'),original.get('parent'))
                n['html']=original['html'];n['labelObstacles']=original.get('labelObstacles',[])
            for e in current['edges']:
                original=edges[e['id']]
                assert e['binding']==original['binding'],e['id']
                e['portPolicy']=copy.deepcopy(original['portPolicy'])
                if e.get('contract'):e['contract']['sharedStem']=copy.deepcopy(original['portPolicy']['source']['sharedStem'])
            current['junctionMarkers']=fresh['junctionMarkers'];current['extras']=fresh['extras']
            current['attachments']=fresh.get('attachments',[])
            current['routeLabels']=fresh.get('routeLabels',[])
            if 'sourceInterfaces' in fresh:current['sourceInterfaces']=fresh['sourceInterfaces']
            current['semanticBaseline']=b.semantic_baseline(current)
            b.dump(target,current)
            (b.ROOT/view['asset']).write_text('window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+json.dumps(case['id']+':'+view['key'])+']='+json.dumps(current,ensure_ascii=False,separators=(',',':'))+';\n')
            views+=1;markers+=len(current['junctionMarkers'])
    print(json.dumps({'views':views,'registeredJunctions':markers,'preserved':'node positions, routes, model source/IR and bindings'}))

if __name__=='__main__':main()
