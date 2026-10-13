import urllib.request,urllib.parse,json,time,subprocess
from pathlib import Path
b='55.725,37.58,55.765,37.675'
q=f'''[out:json][timeout:40];(nwr["amenity"="charging_station"]({b});nwr["railway"="subway_entrance"]({b});nwr["railway"="station"]({b});nwr["amenity"="parking"]({b});nwr["shop"="mall"]({b});nwr["amenity"~"cafe|restaurant|supermarket"]({b});nwr["power"="substation"]({b});way["building"]({b});nwr["natural"="water"]({b});way["highway"~"primary|secondary|tertiary|residential|service"]({b}););out center geom 30001;'''
for endpoint in ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']:
 try:
  req=urllib.request.Request(endpoint,data=urllib.parse.urlencode({'data':q}).encode(),headers={'User-Agent':'EV-Option-Grid research prototype','Content-Type':'application/x-www-form-urlencoded'})
  r=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','55',endpoint,'--data-urlencode','data='+q],capture_output=True,check=True);d=json.loads(r.stdout)
  if d.get('remark'):raise ValueError(d['remark'])
  d['provenance']={'provider':'OpenStreetMap / Overpass','endpoint':endpoint,'retrievedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'query':q,'license':'ODbL','bounds':[55.725,37.58,55.765,37.675]}
  Path('data/district-zil-osm.json').write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
  print('SNAPSHOT',len(d['elements']),'objects',d['osm3s']);break
 except Exception as e:print(endpoint,str(e))
else:raise SystemExit(1)
