#!/usr/bin/env python3
"""Start local API and frontend independently of the invoking terminal session."""
import json, os, socket, subprocess, time, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent
work=root.parent/'work'
runtime=work/'traceline-runtime';runtime.mkdir(parents=True,exist_ok=True)
env=os.environ.copy()
env['PATH']=str(work/'media-runtime/node_modules/@ffmpeg-installer/darwin-arm64')+os.pathsep+str(work/'media-runtime/node_modules/@ffprobe-installer/darwin-arm64')+os.pathsep+env['PATH']
env['MPLCONFIGDIR']=str(runtime/'matplotlib')
env['YOLO_CONFIG_DIR']=str(runtime/'ultralytics')
api_port=int(os.environ.get('TRACELINE_API_PORT','8010'))
frontend_port=int(os.environ.get('TRACELINE_FRONTEND_PORT','5176'))
env['TRACELINE_API_URL']=f'http://127.0.0.1:{api_port}'
def listening(port):
    with socket.socket() as s:return s.connect_ex(('127.0.0.1',port))==0
if not listening(api_port):
    result=subprocess.run([str(root/'backend/.venv/bin/python'),'-m','app.bootstrap'],cwd=root/'backend',env=env)
    if result.returncode:
        raise SystemExit('Database is not ready. Run python setup-local.py; no database reset is needed.')
pids={}
for name,port,cwd,cmd in [('backend',api_port,root/'backend',[str(root/'backend/.venv/bin/python'),'-m','uvicorn','app.main:app','--host','127.0.0.1','--port',str(api_port)]),('frontend',frontend_port,root/'frontend',['npm','run','dev','--','--host','127.0.0.1','--port',str(frontend_port),'--strictPort'])]:
    if listening(port):
        print(name+': already listening on '+str(port));continue
    if name=='backend' and os.environ.get('TRACELINE_RELOAD')=='1':
        cmd += ['--reload','--reload-dir',str(root/'backend'/'app')]
    with (runtime/(name+'-'+str(port)+'.log')).open('ab') as log:
        p=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,close_fds=True)
    pids[name]=p.pid
    print(name+' started: '+str(p.pid))
if pids:
    (runtime/f'pids-{api_port}-{frontend_port}.json').write_text(json.dumps(pids))
for name,url in [('backend',f'http://127.0.0.1:{api_port}/api/v1/health'),('frontend proxy',f'http://127.0.0.1:{frontend_port}/api/v1/health')]:
    for attempt in range(30):
        try:
            with urllib.request.urlopen(url,timeout=2) as r: health=json.load(r)
            if not health.get('database',{}).get('ok'):raise RuntimeError('database unavailable')
            print(name+': healthy');break
        except Exception:
            if attempt==29:raise SystemExit(name+' did not become healthy; inspect work/traceline-runtime logs')
            time.sleep(.5)
print(f'Open http://127.0.0.1:{frontend_port}/')
