"""Load a reviewed jury evidence pack through the real API. Existing cases are never deleted."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import httpx

ROOT=Path(__file__).resolve().parents[2]
ACTIVE={'pending','validating','processing'}


def ok(response):
    if response.status_code not in (200,201,202):
        raise RuntimeError(f'{response.request.method} {response.request.url.path}: {response.status_code} {response.text[:300]}')
    return response.json()


def wait(client, case_id, timeout=1200):
    start=time.monotonic()
    while time.monotonic()-start < timeout:
        jobs=ok(client.get(f'cases/{case_id}/jobs'))['items']
        active=[j for j in jobs if j['status'] in ACTIVE]
        if not active:
            failed=[j for j in jobs if j['status']=='failed']
            if failed:
                raise RuntimeError(f"Processing failed for {case_id}: {failed[0]['stage']}. Retry the failed stage on Evidence before continuing.")
            return
        time.sleep(.5)
    raise TimeoutError(f'Processing still running for {case_id}; no data was deleted.')


def load(api, package):
    common=json.loads((package/'manifest.json').read_text(encoding='utf-8'))
    source=common['source_video'];video=package/source['file']
    if hashlib.sha256(video.read_bytes()).hexdigest()!=source['sha256']:
        raise ValueError('Video hash differs from the reviewed source.')
    if len(common['cases']) > 10:
        raise ValueError('A jury pack may contain at most ten cases.')
    output=[]
    with httpx.Client(base_url=api.rstrip('/')+'/',timeout=120,headers={'X-Actor':'jury-demo-loader'},trust_env=False) as client:
        existing={c['code']:c for c in ok(client.get('cases?limit=200'))['items']}
        # Relative paths below must stay under /api/v1, including when a caller supplies a base URL path.
        def request(method,path,**kwargs):
            return ok(client.request(method,path.lstrip('/'),**kwargs))
        for entry in common['cases']:
            manifest=package/entry['manifest'];m=json.loads(manifest.read_text(encoding='utf-8'));folder=manifest.parent
            if m['id'] in existing:
                old=existing[m['id']]
                if not request('GET',f"cases/{old['id']}/reconstruction/scenarios")['items']:
                    raise RuntimeError(f"{m['id']} exists without a completed reconstruction. Inspect this partial import instead of duplicating it.")
                print(f"{m['id']}: already loaded; skipped")
                output.append({'code':m['id'],'id':old['id'],'skipped':True});continue
            case=request('POST','cases',json={'title':m['title'],'code':m['id'],'designation':'mixed',
                 'description':'Jury demonstration: original user-supplied footage with generated witness accounts and simulated sensors. No measured speed or fault determination.'})
            cid=case['id'];print(f"{m['id']}: importing evidence",flush=True)
            actors={a['key']:request('POST',f'cases/{cid}/actors',json={k:a[k] for k in ('label','kind')})['id'] for a in common['actors']}
            with video.open('rb') as f:
                uploaded=request('POST',f'cases/{cid}/evidence',files={'file':(source['original_filename'],f,'video/mp4')},data={'kind':'cctv','synthetic':'false'})
            vid=uploaded['evidence']['id']
            request('PATCH',f'evidence/{vid}/source',json={'display_name':f"{m['id'][:6].replace('-', ' ')} · original footage",'camera_role':'cctv'})
            # No video actor link is fabricated. Those tracks remain available for investigator review.
            for sensor in m['sensors']:
                with (folder/sensor['file']).open('rb') as f:
                    e=request('POST',f'cases/{cid}/evidence',files={'file':(f"SIMULATED_vehicle_{sensor['key']}.csv",f,'text/csv')},data={'kind':'sensor_csv','synthetic':'true'})['evidence']
                wait(client,cid)
                request('POST',f'cases/{cid}/sensors',json={k:sensor[k] for k in ('mapping','units','clock')}|{'evidence_id':e['id'],'actor_id':actors[sensor['actor_key']]})
                request('POST',f'cases/{cid}/sync-edges',json={'a_evidence':vid,'b_evidence':e['id'],'offset_ms':common['clock']['offset_ms'],
                        'bound_ms':common['clock']['bound_ms'],'basis':'simulation_clock','note':common['clock']['basis']})
            wait(client,cid)
            if m.get('reviewed_fall'):
                obs=m['reviewed_fall']
                request('POST',f'evidence/{vid}/reviewed-fall',json={k:v for k,v in obs.items() if k!='actor_key'}|{'actor_id':actors[obs['actor_key']]})
            for w in m['witnesses']:
                wid=request('POST',f'cases/{cid}/witnesses',json={'label':w['label'],'notes':'GENERATED_DEMO; fictional account for controlled testing.'})['id']
                st=request('POST',f'witnesses/{wid}/statements',json={'text':(folder/w['file']).read_text(encoding='utf-8'),'synthetic':True})
                for c in w['claims']:
                    claim=request('POST',f"statements/{st['id']}/claims",json={k:c[k] for k in ('char_start','char_end')}|c['fields'])
                    if c['actor_key']:
                        request('POST',f"actors/{actors[c['actor_key']]}/links",json={'ref_type':'claim','ref_id':claim['id'],'status':'confirmed',
                                'basis':{'method':'fixture declaration','note':'Generated witness and simulated sensor refer to the same fictional demo entity; not an automatic video identity decision.'}})
                    if c['time_anchor']:
                        request('PUT',f"claims/{claim['id']}/time-anchor",json={k:v for k,v in c['time_anchor'].items() if k!='source_key'}|{'evidence_id':vid})
            wait(client,cid)
            scn=request('POST',f'cases/{cid}/reconstruction/scenarios',json={'name':'Jury demo baseline','baseline':True})
            conflicts=request('GET',f'cases/{cid}/contradictions')['items'];gaps=request('GET',f'cases/{cid}/gaps')['items']
            counts={'speed_conflicts':sum(c['rule_id']=='CON-QTY-01' for c in conflicts),'sensor_gaps':sum(g['gap_type']=='sensor_missing_interval' for g in gaps),'video_denial_conflicts':sum(c['rule_id']=='CON-FALL-DENIAL-01' for c in conflicts)}
            if counts != {k:m['expected'][k] for k in counts}:
                raise RuntimeError(f"{m['id']} imported but expected rule checks differ: {counts}. Inspect evidence; no output was overwritten.")
            output.append({'code':m['id'],'id':cid,'scenario_id':scn['id'],'verified':counts})
            print(f"{m['id']}: ready — {counts}",flush=True)
    return output


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api',default='http://127.0.0.1:8010/api/v1')
    parser.add_argument('--package',type=Path,default=ROOT/'demo-cases/video-01')
    args=parser.parse_args()
    print(json.dumps(load(args.api,args.package),indent=2))
