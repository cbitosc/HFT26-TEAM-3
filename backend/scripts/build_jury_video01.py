"""Rebuild the first jury evidence pack from its original clip; no database changes."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.services import sensors, witness, engine_rules

PACK = ROOT / 'demo-cases' / 'video-01'
VIDEO_HASH = 'a6b243e4ac04291faf5fc954b7756a78dd2b4d0872f3a6bdfdc6a6c85755f410'
MAP = {'t':'timestamp_s','speed':'speed_kmh','accel_long':'accel_long_mps2'}
UNITS = {'t':'s','speed':'km/h','accel_long':'m/s2'}
PROFILES = {'A':[(0,30),(13.9,30),(14.4,18),(15.2,0),(22.6,0)], 'B':[(0,36),(13.4,36),(15.1,2),(15.6,0),(22.6,0)]}
HEADER = 'GENERATED DEMO ACCOUNT — fictional witness, not actual testimony.\n\n'
FALL = 'I saw the motorcycle and rider fall onto the road. I could not determine whether any vehicles touched.'
SPEED_A = 'Vehicle A was moving at about 30 km/h before the rider fell.'
SPEED_B = 'Vehicle B was moving at about 36 km/h before the rider fell.'
HIGH_A = 'Vehicle A was moving at about 85 km/h before the rider fell.'
HIGH_B = 'Vehicle B was moving at about 75 km/h before the rider fell.'


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')


def profile(actor, t):
    points = PROFILES[actor]
    for (a,x),(b,y) in zip(points,points[1:]):
        if a <= t < b:
            slope=(y-x)/(b-a)
            return x+slope*(t-a), slope/3.6
    return points[-1][1], 0.0


def sensor_file(path, actor, gap=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f)
        writer.writerow(['timestamp_s','speed_kmh','accel_long_mps2','record_origin','vehicle_label'])
        for i in range(227):
            if gap and 138 <= i <= 154:
                continue
            t=i/10
            speed,accel=profile(actor,t)
            writer.writerow([f'{t:.1f}',f'{speed:.3f}',f'{accel:.4f}','SIMULATED_DEMO',f'Vehicle {actor}'])
    parsed=sensors.analyze(path.read_bytes(),MAP,UNITS,clock='simulation')
    assert parsed['valid_rows']==parsed['rows']
    assert not parsed['issue_counts'], parsed['issue_counts']
    return parsed


def account(folder, number, label, parts):
    # Parts: (verbatim sentence, actor key or None, source-relative range or None, action).
    text=HEADER+' '.join(p[0] for p in parts)+'\n'
    name=f'witnesses/W{number:02}.txt'
    (folder/'witnesses').mkdir(exist_ok=True)
    (folder/name).write_text(text,encoding='utf-8')
    claims=[]
    for quote,actor,window,action in parts:
        located=witness.locate(text,quote,[(c['char_start'],c['char_end']) for c in claims])
        assert located is not None
        start,end=located
        claims.append({'quote':quote,'char_start':start,'char_end':end,'actor_key':actor,
                       'fields':{'subject':f'Vehicle {actor}' if actor else None,'action':action,'certainty':'reported_as_direct_observation',
                                 'time_description':'before the rider fell' if 'before the rider fell' in quote else 'approximate visual-review interval' if window else 'not reliably placed',
                                 'time_exactness':'approximate' if window else 'none'},
                       'time_anchor':{'source_key':'video','start_ms':window[0]*1000,'end_ms':window[1]*1000,'uncertainty_ms':500,
                                      'basis':'Generated demo placement based on approximate clip-relative visual review; not a real witness timestamp.'} if window else None})
    return {'key':f'W{number:02}','label':label,'file':name,'synthetic':True,'claims':claims}


def validate_rules(manifest, analyses):
    events=[];speeds={};labels={};cover={}
    for actor,analysis in analyses.items():
        eid=f'sensor_{actor}';labels[eid]=f'SIMULATED sensor {actor}'
        speeds[actor]=[(r['time_ms'],r['si']['speed']) for r in analysis['records']]
        cover[eid]=(0,22600,'demo_clock')
        for i,e in enumerate(analysis['events']):
            events.append({'id':f'{actor}_{i}','category':e['category'],'event_type':e['event_type'],'actor_id':actor,'group':'demo_clock',
                           't_start':e['t_start_ms'],'t_end':e['t_end_ms'],'unc':e['uncertainty_ms'],'evidence_id':eid,'source_type':'sensor','camera_kind':'sensor',
                           'observations':e['observations'],'source_ref':e['source_ref'],'title':e['event_type'],'tracks':[],'synthetic':True})
    for w in manifest['witnesses']:
        text=(PACK/manifest['directory']/w['file']).read_text(encoding='utf-8')
        for i,c in enumerate(w['claims']):
            assert text[c['char_start']:c['char_end']]==c['quote']
            a=c['time_anchor'];et=witness.event_type_hint(witness.ClaimCandidate(source_text=c['quote'],action=c['fields']['action'])) or 'witness_statement'
            events.append({'id':f"{w['key']}_{i}",'category':'witness_claim','event_type':et,'actor_id':c['actor_key'],'group':'demo_clock' if a else None,
                           't_start':a['start_ms'] if a else None,'t_end':a['end_ms'] if a else None,'unc':500,'evidence_id':w['key'],
                           'source_type':'witness','camera_kind':'witness','observations':{'quote':c['quote'],'subject':c['fields']['subject']},
                           'witness_label':w['label'],'source_ref':{},'title':c['quote'],'tracks':[],'synthetic':True})
    result=engine_rules.correlate(events,{'actors':{k:{'label':f'Vehicle {k}'} for k in ('A','B')},'evidence_labels':labels,'speeds':speeds,'sensor_cover':cover})
    qty=[c for c in result['contradictions'] if c['rule_id']=='CON-QTY-01']
    gaps=[e for e in events if e['event_type']=='sensor_gap']
    assert len(qty)==manifest['expected']['speed_conflicts'], (manifest['id'],qty)
    assert len(gaps)==manifest['expected']['sensor_gaps'], (manifest['id'],gaps)
    return {'valid_sensor_rows':{k:a['valid_rows'] for k,a in analyses.items()},'sensor_events':{k:[e['event_type'] for e in a['events']] for k,a in analyses.items()},
            'validated_speed_conflicts':len(qty),'validated_sensor_gaps':len(gaps),'scope':'Sensor/claim rules only. Live video detections can produce additional uncertain findings; no video model outcome was injected.'}


def build(video):
    assert hashlib.sha256(video.read_bytes()).hexdigest()==VIDEO_HASH, 'This generator is specific to the reviewed first video.'
    PACK.mkdir(parents=True,exist_ok=True)
    target=PACK/'video.mp4'
    if video.resolve()!=target.resolve(): shutil.copyfile(video,target)
    common={'schema_version':1,'source_video':{'file':'video.mp4','original_filename':'WhatsApp Video 2026-10-31 at 12.01.55 AM.mp4','sha256':VIDEO_HASH,
             'duration_ms':22666.667,'fps':30,'frame_count':680,'width':1346,'height':712,'synthetic':False},
            'case_designation':'mixed','clock':{'reference':'video','offset_ms':0,'bound_ms':500,'basis':'Simulation time zero explicitly defined as clip start; not recovered hardware timestamps.'},
            'actors':[{'key':'A','label':'Vehicle A · motorcycle involved in the visible fall','kind':'vehicle'},
                      {'key':'B','label':'Vehicle B · silver/white MPV beside the fallen motorcycle','kind':'vehicle'}],
            'limitations':['No calibrated distance or measured speed is available. All sensor values and witness accounts are generated demo assumptions.',
                           'The motorcycle/rider fall is visible around 14.4–14.9 s. The view does not conclusively establish vehicle-to-vehicle contact or fault.',
                           'Actor labels are demo identities, not automatic re-identification guarantees. Video tracks require review before confirmation.',
                           'No GPS, injury assessment, traffic-light state, or real collision flag is invented.']}
    scenarios=[('01-witness-matches','TD-V01-01','Video 01 · witness matches visible events',0,False),
               ('02-witness-conflicts','TD-V01-02','Video 01 · witness conflicts with visible events',2,False)]
    records=[]
    for directory,cid,title,count,gap in scenarios:
        folder=PACK/directory;folder.mkdir(exist_ok=True)
        analyses={actor:sensor_file(folder/f'sensors/vehicle_{actor}.csv',actor,gap and actor=='A') for actor in ('A','B')}
        if count:
            denial='The motorcycle never fell during the recording. The rider stayed seated on it throughout.'
            accounts=[account(folder,1,'Demo witness 1 · contradicts visible fall',[(denial,'A',(14.4,18.5),'denies rider fall'),(HIGH_A,'A',(12,13.5),'speed estimate')]),
                      account(folder,2,'Demo witness 2 · conflicting speed account',[(HIGH_B,'B',(12,13.5),'speed estimate')])]
            dump(folder/'video_mismatch_review.json', {'claim':denial,'contradicted_by':{'video':'../video.mp4','start_s':14.4,'end_s':18.5,
                 'observation':'The motorcycle/rider falls, followed by the rider getting up near the motorcycle.'},
                 'classification':'Human visual-review comparison, not an automatic video-model finding.',
                 'automatic_check':'The two numeric speed conflicts are separately checked against the unchanged simulated CSVs.'})
        else:
            aftermath='The rider later got up and stood beside the fallen motorcycle while other traffic continued to pass.'
            accounts=[account(folder,1,'Demo witness 1 · visible fall account',[(FALL,'A',(14.4,14.9),'rider fall report')]),
                      account(folder,2,'Demo witness 2 · visible aftermath account',[(aftermath,'A',(16,22.6),'rider aftermath report')])]
        manifest={'id':cid,'directory':directory,'title':title,'designation':'mixed','video':'../video.mp4','video_synthetic':False,'reviewed_fall':{'actor_key':'A','start_ms':14400,'end_ms':14900,'uncertainty_ms':500,'note':'Human visual review: the motorcycle and rider fall onto the road in this interval. Physical contact with another vehicle is not established.'},
                  'sensors':[{'key':actor,'actor_key':actor,'file':f'sensors/vehicle_{actor}.csv','synthetic':True,'mapping':MAP,'units':UNITS,'clock':'simulation'} for actor in ('A','B')],
                  'witnesses':accounts,'expected':{'speed_conflicts':count,'sensor_gaps':1 if gap else 0,'video_denial_conflicts':1 if count else 0,
                  'demonstrates':'Generated witness denies the visible rider fall. Two additional speed claims conflict with unchanged simulated CSVs. Visual fall denial requires human review; numeric conflicts are rule-checked.' if count else 'Generated accounts describe the visible fall and later aftermath without inventing measured speeds or contact. No numeric speed conflict is expected.'}}
        dump(folder/'case.json',manifest)
        validation=validate_rules(manifest,analyses);dump(folder/'validation.json',validation)
        with (folder/'witness_records.csv').open('w',newline='',encoding='utf-8') as f:
            writer=csv.writer(f);writer.writerow(['witness_id','label','record_origin','statement_file','statement_text'])
            for w in accounts:writer.writerow([w['key'],w['label'],'GENERATED_DEMO',w['file'],(folder/w['file']).read_text(encoding='utf-8')])
        records.append({'id':cid,'title':title,'manifest':f'{directory}/case.json','validation':validation})
    common['cases']=records;common['collection_plan']={'total_videos':3,'cases_per_video':2,'total_cases':6,'pair_rule':'Same video and byte-identical simulated sensors; only witness accounts change.'};dump(PACK/'manifest.json',common)
    for actor in ('A','B'):
        assert (PACK/scenarios[0][0]/f'sensors/vehicle_{actor}.csv').read_bytes()==(PACK/scenarios[1][0]/f'sensors/vehicle_{actor}.csv').read_bytes()
    timeline=[(0,13.9,'direct_visual_review','Traffic moves towards the foreground; several vehicles can obscure the motorcycle.'),
              (14.0,14.5,'direct_visual_review','Motorcycle is close to other vehicles; view is partly occluded.'),
              (14.4,14.9,'direct_visual_review','Motorcycle/rider falls onto the road; exact contact mechanism is uncertain.'),
              (15.0,15.7,'direct_visual_review','Motorcycle is on its side and rider is down beside it; MPV is nearby.'),
              (16.0,18.5,'direct_visual_review','Rider gets up near the motorcycle.'),
              (18.5,22.6,'direct_visual_review','Rider remains near the motorcycle as traffic passes.')]
    with (PACK/'observed_timeline.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f);writer.writerow(['start_s','end_s','classification','description']);writer.writerows(timeline)
    print(json.dumps({'case_count':len(records),'cases':records},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('video',type=Path);args=parser.parse_args();build(args.video)
