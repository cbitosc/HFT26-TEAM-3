"""Cross-source workflow regressions; isolated test database, no hosted model."""
from app.services.witness import local_candidates


def checked(response, code=200):
    assert response.status_code == code, response.text
    return response.json()


def case(client, title='Workflow'):
    return checked(client.post('/api/v1/cases', json={'title': title, 'designation': 'synthetic'}), 201)['id']


def statement(client, cid, label, text):
    w = checked(client.post(f'/api/v1/cases/{cid}/witnesses', json={'label': label}), 201)
    st = checked(client.post(f"/api/v1/witnesses/{w['id']}/statements", json={'text': text, 'synthetic': True}), 201)
    checked(client.post(f"/api/v1/statements/{st['id']}/extract-local"))
    return st


def test_local_quotes_keep_decimal_unicode_and_offsets():
    text = '🚗 Witness: The blue car was moving at 42.5 km/h.\nVehicle A entered the junction before Vehicle B.'
    claims = local_candidates(text)
    assert len(claims) == 2
    for c in claims:
        assert text[c['char_start']:c['char_end']] == c['source_text']
    assert '42.5 km/h' in claims[0]['source_text']
    assert claims[1]['normalized']['entry_order_labels'] == ['Vehicle A', 'Vehicle B']
    assert local_candidates('The sky was cloudy.') == []


def test_local_extraction_is_idempotent_without_external_policy(client):
    cid = case(client)
    st = statement(client, cid, 'Witness A', 'The blue car turned left before the collision.')
    assert checked(client.post(f"/api/v1/statements/{st['id']}/extract-local"))['claims_added'] == 0
    claims = checked(client.get(f"/api/v1/statements/{st['id']}/claims"))['items']
    assert len(claims) == 1
    assert claims[0]['normalized_interpretation']['code_derived_maneuver'] == 'left'
    assert claims[0]['normalized_interpretation']['interpreted_by'].startswith('local')
    assert checked(client.get(f"/api/v1/statements/{st['id']}"))['text_original'] == st['text_original']


def test_readiness_stale_snapshot_and_identity_boundaries(client):
    cid = case(client)
    assert not checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['can_build']
    st = statement(client, cid, 'Witness 1', 'The blue car stopped.')
    assert checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['can_build']
    built = checked(client.post(f'/api/v1/cases/{cid}/reconstruction/scenarios', json={'name':'First','baseline':True}),201)
    assert built['build']['events'] == 1
    assert not checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['needs_update']
    other = case(client, 'Other case')
    actor = checked(client.post(f'/api/v1/cases/{other}/actors',json={'label':'Vehicle A'}),201)
    claim = checked(client.get(f"/api/v1/statements/{st['id']}/claims"))['items'][0]
    assert client.post(f"/api/v1/actors/{actor['id']}/links",json={'ref_type':'claim','ref_id':claim['id'],'status':'confirmed'}).status_code == 422
    statement(client, cid, 'Witness 2', 'The red car braked.')
    assert checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['needs_update']
    checked(client.post(f'/api/v1/cases/{cid}/reconstruction/scenarios', json={'name':'Updated','baseline':True}),201)
    assert not checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['needs_update']
    assert len(checked(client.get(f'/api/v1/cases/{cid}/reconstruction/scenarios'))['items']) == 2


def test_mixed_evidence_clock_identity_order_assessment_and_trace(client, bus_video):
    """YOLO/tracking on a generated street-photo pan plus simulated witnesses/sensors; not an accident accuracy benchmark."""
    cid = case(client)
    client.settings.max_video_mb = 20
    video = checked(client.post(f'/api/v1/cases/{cid}/evidence', files={'file':('street.mp4',bus_video.read_bytes(),'video/mp4')},data={'kind':'cctv','synthetic':'true'}),201)['evidence']
    stage_jobs = checked(client.get(f'/api/v1/cases/{cid}/jobs'))['items']
    assert all(j['status'] in ('completed','partially_completed') for j in stage_jobs), stage_jobs
    tracks = checked(client.get(f"/api/v1/evidence/{video['id']}/tracks"))['items']
    assert tracks
    sensor = checked(client.post(f'/api/v1/cases/{cid}/evidence',files={'file':('sensor.csv',b't,speed\n0,12\n1,8\n2,2\n3,0\n','text/csv')},data={'kind':'sensor_csv','synthetic':'true'}),201)['evidence']
    mapped = checked(client.post(f'/api/v1/cases/{cid}/sensors', json={'evidence_id':sensor['id'],'mapping':{'t':'t','speed':'speed'},'units':{'t':'s','speed':'m/s'},'clock':'simulation'}),201)
    checked(client.post(f'/api/v1/cases/{cid}/sync-points',json={'a':{'evidence_id':video['id'],'time_ms':0},'b':{'evidence_id':sensor['id'],'time_ms':0},'marking_error_ms':200,'note':'Simulated log explicitly shares this clip clock'}),201)
    a = checked(client.post(f'/api/v1/cases/{cid}/actors',json={'label':'Vehicle A'}),201)
    b = checked(client.post(f'/api/v1/cases/{cid}/actors',json={'label':'Vehicle B'}),201)
    for typ,rid in [('track',tracks[0]['id']),('sensor_source',mapped['sensor_source_id'])]:
        checked(client.post(f"/api/v1/actors/{a['id']}/links",json={'ref_type':typ,'ref_id':rid,'status':'confirmed','basis':{'note':'Synthetic workflow identity'}}),201)
    ids=[]
    for actor,label,quote in [(a,'Witness A','Vehicle A entered the junction before Vehicle B.'),(b,'Witness B','Vehicle B entered the junction before Vehicle A.')]:
        st=statement(client,cid,label,quote)
        cl=checked(client.get(f"/api/v1/statements/{st['id']}/claims"))['items'][0]
        checked(client.post(f"/api/v1/actors/{actor['id']}/links",json={'ref_type':'claim','ref_id':cl['id'],'status':'confirmed'}),201)
        checked(client.put(f"/api/v1/claims/{cl['id']}/time-anchor",json={'evidence_id':video['id'],'start_ms':0,'end_ms':2800,'uncertainty_ms':500,'basis':'Synthetic test interval; not a real witness timestamp'}))
        ids.append(st['id'])
    built=checked(client.post(f'/api/v1/cases/{cid}/reconstruction/scenarios',json={'name':'Mixed workflow','baseline':True}),201)
    cons=checked(client.get(f'/api/v1/cases/{cid}/contradictions'))['items']
    assert any(c['rule_id']=='CON-ORDER-01' for c in cons)
    for sid in ids:
        claim=checked(client.get(f'/api/v1/statements/{sid}/claims'))['items'][0]
        assert claim['contradiction_status']=='potential_conflict' and claim['assessment_refs']
        assert claim['scenario_id']==built['id']
    timeline=checked(client.get(f'/api/v1/cases/{cid}/timeline'))
    events=[e for lane in timeline['lanes'].values() for e in lane]
    assert {'sensor','witness','video_cctv'} <= {e['source_type'] for e in events}
    assert all(e['source_id'] or e['category']=='inference' for e in events)
    assert all(e['uncertainty_ms']>=500 for e in events if e['category']=='witness_claim')
    assert not checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['needs_update']


def test_review_exclusion_and_time_anchor_validation(client):
    cid=case(client)
    st=statement(client,cid,'Witness','The blue car braked.')
    claim=checked(client.get(f"/api/v1/statements/{st['id']}/claims"))['items'][0]
    checked(client.patch(f"/api/v1/claims/{claim['id']}/review",json={'status':'excluded','note':'Extractor grouped the wrong action'}))
    assert not checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['can_build']
    checked(client.patch(f"/api/v1/claims/{claim['id']}/review",json={'status':'included','note':'Reviewed against original quote'}))
    assert checked(client.get(f'/api/v1/cases/{cid}/reconstruction/readiness'))['can_build']
    bad={'evidence_id':st['evidence_id'],'start_ms':0,'end_ms':1000,'uncertainty_ms':500,'basis':'Not a media source'}
    assert client.put(f"/api/v1/claims/{claim['id']}/time-anchor",json=bad).status_code==422
    bad['end_ms']=-1
    assert client.put(f"/api/v1/claims/{claim['id']}/time-anchor",json=bad).status_code==422


def test_ambiguous_collision_anchors_are_not_guessed():
    from app.services.reconstruct import _place_claim
    anchors=[{'t_start':1000,'group':'g1','unc':100},{'t_start':9000,'group':'g1','unc':100}]
    assert _place_claim({},anchors,'just before the collision') is None


def test_local_negations_and_uncertain_wording_remain_testimony():
    c=local_candidates('The blue car did not hit the pedestrian.')[0]
    assert c['normalized']['event_type_hint']=='witness_statement'
    assert local_candidates('Maybe the blue car braked.')[0]['certainty']=='hedged'


def test_entry_order_requires_same_clock_scope_and_distinct_witnesses():
    from copy import deepcopy
    from app.services.engine_rules import correlate
    ctx={'actors':{'a':{'label':'Vehicle A (blue car)'},'b':{'label':'Vehicle B (white car)'}},'speeds':{},'sensor_cover':{},'evidence_labels':{}}
    def claim(id, actor, labels, witness):
        return {'id':id,'category':'witness_claim','event_type':'entry_order_claim','actor_id':actor,'group':'g','t_start':0,'t_end':3000,'unc':100,
                'source_type':'witness','camera_kind':'witness','evidence_id':id,'witness_label':witness,
                'observations':{'entry_order_labels':labels,'entry_order_scope':'junction','witness_id':witness,'quote':'entry order'}}
    first=claim('c1','a',['Vehicle A','Vehicle B'],'W1')
    second=claim('c2','b',['Vehicle B','Vehicle A'],'W2')
    assert any(c['rule_id']=='CON-ORDER-01' for c in correlate([first,second],ctx)['contradictions'])
    for patch in [{'group':'other'},{'actor_id':None},{'t_start':None}, {'observations':{**second['observations'],'entry_order_scope':'scene'}}, {'observations':{**second['observations'],'witness_id':'W1'}}]:
        changed=deepcopy(second);changed.update(patch)
        assert not correlate([first,changed],ctx)['contradictions']


def test_fall_denial_needs_reviewed_video_same_identity_and_time():
    from copy import deepcopy
    from app.services.engine_rules import correlate
    from app.services.witness import fall_report
    assert fall_report('The motorcycle never fell during the recording.') == 'denied'
    assert fall_report('I did not see whether the motorcycle fell.') is None
    ctx={'actors':{'a':{'label':'Motorcycle A'}},'speeds':{},'sensor_cover':{},'evidence_labels':{}}
    claim={'id':'claim','category':'witness_claim','event_type':'witness_statement','actor_id':'a','group':'g','t_start':14400,'t_end':18500,'unc':500,
           'source_type':'witness','camera_kind':'witness','evidence_id':'statement','witness_label':'Demo witness',
           'observations':{'quote':'The motorcycle never fell.','fall_report':'denied'}}
    video={'id':'review','category':'direct_observation','event_type':'rider_fall_observed','actor_id':'a','group':'g','t_start':14400,'t_end':14900,'unc':500,
           'source_type':'video_cctv','camera_kind':'cctv','evidence_id':'video','observations':{'reviewed_by':'reviewer'},'source_ref':{'frames':[432,447]}}
    assert correlate([claim,video],ctx)['contradictions'][0]['rule_id']=='CON-FALL-DENIAL-01'
    for patch in [{'actor_id':None},{'group':'other'},{'t_start':20000,'t_end':22000},{'observations':{}}]:
        changed=deepcopy(video);changed.update(patch)
        assert not correlate([claim,changed],ctx)['contradictions']
