"""One-time conversion of the public BBBike Moscow PBF into browser-readable OSM tiles.
Run with a Python environment containing osmium. Source PBF is excluded from release ZIP.
"""
import osmium,json,math,pathlib,datetime,gzip
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'data'/'moscow-osm';OUT.mkdir(exist_ok=True)
B=[55.571,37.323,55.915,37.879];LAT=.02;LON=.04
buckets={};seen=set();factory=osmium.geom.GeoJSONFactory()
def wanted(t):
 return bool(t.get('building') and t.get('building')!='no') or t.get('amenity') in ('charging_station','parking','cafe','restaurant','fast_food') or t.get('railway') in ('subway_entrance','station') or t.get('highway') in ('bus_stop','motorway','trunk','primary','secondary','tertiary','residential','service','unclassified','living_street','pedestrian') or t.get('shop')=='mall' or t.get('power')=='substation' or t.get('natural')=='water' or t.get('waterway')=='riverbank'
def add(e):
 tags=e['tags'];keep=('building','amenity','railway','highway','shop','power','natural','name','ref','brand','operator','capacity','access','disused','public_transport')
 e['tags']={k:v for k,v in tags.items() if k in keep or k.startswith('socket:')}
 g=e.get('geometry',[]);p=e.get('center',e);south=min([q['lat'] for q in g]or[p['lat']]);north=max([q['lat'] for q in g]or[p['lat']]);west=min([q['lon'] for q in g]or[p['lon']]);east=max([q['lon'] for q in g]or[p['lon']])
 if north<B[0] or south>B[2] or east<B[1] or west>B[3]:return
 for y in range(max(0,math.floor((south-B[0])/LAT)),min(math.floor((B[2]-B[0])/LAT),math.floor((north-B[0])/LAT))+1):
  for x in range(max(0,math.floor((west-B[1])/LON)),min(math.floor((B[3]-B[1])/LON),math.floor((east-B[1])/LON))+1):buckets.setdefault(f'{y}-{x}',[]).append(e)
def geometry(nodes):
 return [{'lat':round(n.lat,7),'lon':round(n.lon,7)} for n in nodes if n.location.valid()]
def center(g):return {'lat':round((min(p['lat'] for p in g)+max(p['lat'] for p in g))/2,7),'lon':round((min(p['lon'] for p in g)+max(p['lon'] for p in g))/2,7)}
class Handler(osmium.SimpleHandler):
 def node(self,n):
  t=dict(n.tags)
  if wanted(t) and n.location.valid():add({'type':'node','id':n.id,'lat':n.lat,'lon':n.lon,'tags':t})
 def way(self,w):
  t=dict(w.tags)
  if not wanted(t):return
  # Closed water and building polygons are emitted via area(), including inner rings.
  if (t.get('building') or t.get('natural')=='water' or t.get('waterway')=='riverbank') and w.is_closed():return
  g=geometry(w.nodes)
  if len(g)<2:return
  add({'type':'way','id':w.id,'geometry':g,'center':center(g),'tags':t})
 def area(self,a):
  t=dict(a.tags)
  if not wanted(t):return
  if t.get('waterway')=='riverbank':t['natural']='water'
  try:polys=json.loads(factory.create_multipolygon(a))['coordinates']
  except:return
  for i,poly in enumerate(polys):
   g=[{'lat':round(p[1],7),'lon':round(p[0],7)} for p in poly[0]]
   if len(g)<4:continue
   e={'type':'way' if a.from_way() else 'relation','id':a.orig_id() if i==0 else str(a.orig_id())+'-part-'+str(i),'geometry':g,'center':center(g),'tags':t}
   if len(poly)>1:e['holes']=[[{'lat':round(p[1],7),'lon':round(p[0],7)} for p in ring] for ring in poly[1:]]
   add(e)
Handler().apply_file(str(ROOT/'source-data/Moscow.osm.pbf'),locations=True,idx='flex_mem')
count=0;size=0
for name,rows in buckets.items():
 # Deduplicate area/way outputs while retaining distinct pieces of multipolygons.
 rows=list({str(e['type'])+'/'+str(e['id']):e for e in rows}.values());count+=len(rows)
 text=json.dumps({'elements':rows},ensure_ascii=False,separators=(',',':'));gzip.open(OUT/(name+'.json.gz'),'wb',compresslevel=9).write(text.encode());size+=len(text.encode())
meta={'id':'moscow-bbbike-2026-10-10','bounds':B,'latStep':LAT,'lonStep':LON,'tiles':list(buckets),'provider':'OpenStreetMap / BBBike · Москва','retrievedAt':'2026-10-12','osmTimestamp':'2026-10-10','sourceUrl':'https://download.bbbike.org/osm/bbbike/Moscow/','sourceFile':'Moscow.osm.pbf','license':'ODbL 1.0','elementsIncludingTileDuplicates':count,'bytes':size}
(OUT/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));print(json.dumps(meta,ensure_ascii=False))
