"""Build two compact jury cases for reviewed video 02; no database changes."""
import argparse, csv, hashlib, json, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.services import sensors, witness

PACK = ROOT / 'demo-cases' / 'video-02'
VIDEO_HASH = 'f8b22b8e09b1136b236c2875fe51b6909119edd83e039b46dfd310c91158d399'
MAP = {'t':'timestamp_s','speed':'speed_kmh','accel_long':'accel_long_mps2'}
UNITS = {'t':'s','speed':'km/h','accel_long':'m/s2'}
HEADER = 'GENERATED DEMO ACCOUNT — fictional witness, not actual testimony.\n\n'

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')

def make_sensor(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as handle:
        out = csv.writer(handle)
        out.writerow(['timestamp_s','speed_kmh','accel_long_mps2','record_origin','vehicle_label'])
        for i in range(127):
            t = i / 10
            speed = 28 if t < 2.4 else max(0, 28 - (t-2.4)*28/1.4) if t < 3.8 else 0
            accel = 0 if t < 2.4 or t >= 3.8 else -(28/1.4)/3.6
            out.writerow([f'{t:.1f}', f'{speed:.3f}', f'{accel:.4f}', 'SIMULATED_DEMO', 'Motorcycle A'])
    result = sensors.analyze(path.read_bytes(), MAP, UNITS, clock='simulation')
    assert result['valid_rows'] == result['rows'] and not result['issue_counts']

def account(folder, label, statements):
    text = HEADER + ' '.join(item[0] for item in statements) + '\n'
    file = 'witnesses/W01.txt'
    (folder/'witnesses').mkdir(parents=True, exist_ok=True)
    (folder/file).write_text(text, encoding='utf-8')
    claims = []
    for quote, action, start, end in statements:
        located = witness.locate(text, quote, [(c['char_start'], c['char_end']) for c in claims])
        assert located
        claims.append({'quote':quote, 'char_start':located[0], 'char_end':located[1], 'actor_key':'A',
          'fields':{'subject':'Motorcycle A','action':action,'certainty':'reported_as_direct_observation',
                    'time_description':'approximate clip-relative interval','time_exactness':'approximate'},
          'time_anchor':{'source_key':'video','start_ms':start,'end_ms':end,'uncertainty_ms':400,
                         'basis':'Generated demo placement from clip-relative human review; not a real witness timestamp.'}})
    return {'key':'W01','label':label,'file':file,'synthetic':True,'claims':claims}

def build(video):
    assert hashlib.sha256(video.read_bytes()).hexdigest() == VIDEO_HASH, 'Unexpected video 02 bytes.'
    PACK.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(video, PACK/'video.mp4')
    make_sensor(PACK/'sensor_motorcycle.csv')
    common = {
      'schema_version':1,
      'source_video':{'file':'video.mp4','original_filename':video.name,'sha256':VIDEO_HASH,'duration_ms':12645.167,
                      'fps':30,'frame_count':395,'width':1296,'height':746,'synthetic':False},
      'case_designation':'mixed',
      'clock':{'reference':'video','offset_ms':0,'bound_ms':400,'basis':'Simulated sensor time zero is clip start.'},
      'actors':[{'key':'A','label':'Motorcycle A · involved in the visible fall','kind':'vehicle'}],
      'limitations':['The fall is visible around 2.8–3.5 s; exact contact, injury and fault are not established.',
                     'The single CSV and all witness text are generated demo evidence, not real measurements or testimony.',
                     'The latter portion includes a replay, so only the first occurrence is annotated.']}
    configs = [
      ('01-witness-matches','TD-V02-01','Video 02 · witness matches visible events',
       [('I saw the motorcycle and rider fall in the traffic ahead.','rider fall report',2800,3500)],0,0),
      ('02-witness-conflicts','TD-V02-02','Video 02 · witness conflicts with visible events',
       [('The motorcycle never fell during the recording. The rider stayed seated throughout.','denies rider fall',2800,4000),
        ('The motorcycle was moving at about 90 km/h before the incident.','speed estimate',1000,2400)],1,1)]
    cases=[]
    for directory, code, title, statements, speed_conflicts, denial_conflicts in configs:
        folder=PACK/directory; folder.mkdir(parents=True, exist_ok=True)
        witness_item=account(folder, 'Demo witness · matching account' if not denial_conflicts else 'Demo witness · conflicting account', statements)
        manifest={'id':code,'directory':directory,'title':title,'designation':'mixed','video':'../video.mp4','video_synthetic':False,
          'reviewed_fall':{'actor_key':'A','start_ms':2800,'end_ms':3500,'uncertainty_ms':400,
                           'note':'Human visual review: the motorcycle and rider fall during the first occurrence; contact and fault are not established.'},
          'sensors':[{'key':'A','actor_key':'A','file':'../sensor_motorcycle.csv','synthetic':True,'mapping':MAP,'units':UNITS,'clock':'simulation'}],
          'witnesses':[witness_item],
          'expected':{'speed_conflicts':speed_conflicts,'sensor_gaps':0,'video_denial_conflicts':denial_conflicts,
                      'demonstrates':'Matching generated account.' if not denial_conflicts else 'Generated denial conflicts with reviewed video; speed estimate conflicts with simulated sensor.'}}
        dump(folder/'case.json', manifest)
        cases.append({'id':code,'title':title,'manifest':f'{directory}/case.json'})
    common['cases']=cases
    common['collection_plan']={'total_videos':3,'cases_per_video':2,'total_cases':6,
      'pair_rule':'Same video and same single simulated sensor CSV; only witness account changes.'}
    dump(PACK/'manifest.json', common)
    with (PACK/'observed_timeline.csv').open('w',newline='',encoding='utf-8') as handle:
        out=csv.writer(handle); out.writerow(['start_s','end_s','classification','description'])
        out.writerows([(0,2.7,'direct_visual_review','Motorcycle travels ahead in dense traffic.'),
                       (2.8,3.5,'direct_visual_review','Motorcycle and rider fall; exact contact mechanism is uncertain.'),
                       (3.5,6.5,'direct_visual_review','Motorcycle remains down while nearby traffic slows.'),
                       (7,12.6,'replay','The clip replays the event; not treated as a second incident.')])
    print(json.dumps({'case_count':2,'cases':cases,'sensor_files':1}, indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('video',type=Path)
    build(parser.parse_args().video)
