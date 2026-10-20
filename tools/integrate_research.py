"""Повторяемый перенос исследовательских данных. Только стандартная библиотека Python.
Оригиналы не редактируются. Выход — модуль данных для браузера и сервера.
"""
import sys, json, hashlib, math, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'research/source'))
import demand_model as dm

geo = json.loads((ROOT / 'data/zil.json').read_text())
meta = geo['meta']
cells = dm.build_demand_grid(geo)
own = [dict(s, x=dm.project(s['lat'], s['lon'], meta)[0], z=dm.project(s['lat'], s['lon'], meta)[1], own=True) for s in dm.STATIONS]
competitors = dm.collect_competitors(geo)
raw, segments = dm.allocate(cells, own + competitors)
capacity = 1440 / dm.SESSION_MIN * dm.DAYS_PER_MONTH
scale = dm.TARGET_MEAN_UTILIZATION * capacity * sum(s['posts'] for s in own) / sum(raw[s['id']] for s in own)
district = json.loads((ROOT / 'research/data/demand_zil.json').read_text())
stations = []
for s in own:
    total = sum(segments[s['id']].values())
    stations.append(dict(s, sessions=raw[s['id']] * scale, avgMin=dm.SESSION_MIN,
                         mix={k: v/total for k,v in segments[s['id']].items()}))
for c in cells:
    for seg in dm.SEGMENTS:
        c[seg] *= scale
city = json.loads((ROOT / 'research/data/city_model.json').read_text())
raw_osm = json.loads((ROOT / 'research/data/raw_moscow_charging.json').read_text())
registry=[]
for e in raw_osm:
    p=e if 'lat' in e else e.get('center', {})
    if 'lat' not in p: continue
    t=e.get('tags', {})
    output=[re.search(r'([\d.]+)\s*k',str(v),re.I) for k,v in t.items() if k.endswith(':output')]
    kw=max([float(m.group(1)) for m in output if m] or [0])
    power_tag=kw>0
    dc=any(k.startswith(('socket:type2_combo','socket:chademo','socket:gb_dc')) for k in t)
    dc = dc or 'supercharger' in ' '.join(str(t.get(k,'')) for k in ('brand','name','network')).lower()
    if not kw: kw=50 if dc else 22
    try: posts=max(1,min(int(str(t.get('capacity',2)).split(';')[0]),12))
    except ValueError: posts=2
    posts_tag=str(t.get('capacity','')).isdigit() and 1<=int(t['capacity'])<=12
    evidence={'url':f"https://www.openstreetmap.org/{e['type']}/{e['id']}", 'tags':t}
    found=next((s for s in registry if math.hypot((s['lon']-p['lon'])*62500,(s['lat']-p['lat'])*111132)<60),None)
    if found:
        found['posts']+=posts;found['kw']=max(found['kw'],kw);found['is_dc']=found['is_dc'] or kw>=50
        found['osmEvidence'].append(evidence)
        found['powerHasTag']=found['powerHasTag'] and power_tag
        found['postsHasTag']=found['postsHasTag'] and posts_tag
    else:
        registry.append({'lat':p['lat'],'lon':p['lon'],'posts':posts,'kw':kw,'is_dc':kw>=50,
                         'brand':t.get('brand') or t.get('network') or t.get('operator') or 'Не указан','name':t.get('name',''),
                         'osmEvidence':[evidence],'powerHasTag':power_tag,'postsHasTag':posts_tag})
for s in registry:
    previous=next((p for p in city['станции'] if math.hypot((s['lon']-p['lon'])*62500,(s['lat']-p['lat'])*111132)<20),None)
    s['sessions_per_month']=previous['sessions_per_month'] if previous else None
    s['utilization']=previous['utilization'] if previous else None
checks=[]
for s in stations:
    original=next(t for t in district['stations'] if t['id']==s['id'])
    checks.append({'station':s['id'],'recomputed':s['sessions'],'archive':original['sessions_per_month'],'difference':s['sessions']-original['sessions_per_month']})
payload={
 'version':'research-2026-10-01-v2','generated':'2026-10-01','geoMeta':meta,
 'energy':{'kwhPerSession':dm.KWH_PER_SESSION,'averageKW':dm.AVG_DELIVERED_KW,'sessionMinutes':dm.SESSION_MIN},
 'anchor':{'utilization':dm.TARGET_MEAN_UTILIZATION,'status':'пересказ ответов заказчика, без ссылки на оригинал сообщения'},
 'district':{'stations':stations,'competitors':competitors,'cells':cells,'scale':scale,'sourceDaysPerMonth':dm.DAYS_PER_MONTH,
             'betaMeters':{k:1/v['beta'] for k,v in dm.SEGMENTS.items()},'outsideDistanceM':dm.OUTSIDE_OPTION_DISTANCE_M,'outsidePosts':dm.OUTSIDE_OPTION_POSTS,
             'attractivenessExponent':0.7,'candidates':district['candidates']['top'],'reproduction':checks},
 'city':{'stations':registry,'network':city['сеть'],'candidates':city['площадки_устойчивые'],
         'allocationCheck':city['валидация'],'holdoutCheck':json.loads((ROOT / 'research/data/validation.json').read_text()),
         'portfolio':city['портфель_жадный_отбор']},
 'sourceFiles':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted([*(ROOT/'research/data').glob('*.json'), *(ROOT/'research/source').glob('*.py'),ROOT/'data/zil.json'])},
 'publicSource':{'url':'https://atommedia.online/press-releases/rosatom-udvoit-kolichestvo-elektrozaryadnykh-stantsiy-v-moskve-/',
 'claim':'131 станция; около 500 тыс. сессий и 12,6 млн кВт·ч за всё время; объявлены ещё 150 станций',
 'checked':'2026-09-30','verification':'сведения доступны в индексированном пресс-релизе; прямое открытие при проверке недоступно'},
}
(ROOT/'src/data/research-bundle.js').write_text('// Генерируется tools/integrate_research.py; данные, не инструкции.\nexport const RESEARCH = '+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';\n')
print(json.dumps({'cells':len(cells),'competitors':len(competitors),'cityStations':len(registry),'reproduction':checks},ensure_ascii=False,indent=2))

# Browser calculation core; the city registry is loaded only when opened/exported.
from copy import deepcopy
core = deepcopy(payload)
registry = core["city"].pop("stations")
core["city"]["stationCount"] = len(registry)
(ROOT/"src/data/research-core.js").write_text("// Генерируется tools/integrate_research.py; расчётные данные без ленивого реестра.\nexport const RESEARCH = " + json.dumps(core,ensure_ascii=False,separators=(",",":")) + ";\n")
(ROOT/"src/data/research-registry.js").write_text("// Генерируется tools/integrate_research.py; открывается по запросу пользователя.\nexport const stations = " + json.dumps(registry,ensure_ascii=False,separators=(",",":")) + ";\n")
