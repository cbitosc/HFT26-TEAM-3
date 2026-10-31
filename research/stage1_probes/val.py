import sys, json
from ultralytics import YOLO
m = YOLO(sys.argv[1])
print('names', m.names, 'task', m.task)
out = {}
for split in ['val', 'test']:
    r = m.val(data='acc.yaml', split=split, imgsz=640, device='mps', verbose=False, plots=False, project='runs', name=split, exist_ok=True)
    out[split] = {'precision': round(float(r.box.mp), 3), 'recall': round(float(r.box.mr), 3),
                  'mAP50': round(float(r.box.map50), 3), 'mAP50_95': round(float(r.box.map), 3),
                  'ms_inference_per_img': round(r.speed['inference'], 1)}
    print(split, out[split])
# false positives on a scene without an accident
p = m.predict(sys.argv[2], conf=0.25, device='mps', verbose=False)[0]
out['no_accident_scene_bus_jpg_detections'] = len(p.boxes)
print('bus.jpg detections at conf 0.25:', len(p.boxes))
json.dump(out, open('acc_val_results.json', 'w'), indent=2)
