"""Named places and railway stations from the same public OSM PBF; presentation only."""
import osmium,json,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
rows=[]
class Labels(osmium.SimpleHandler):
 def node(self,n):
  t=dict(n.tags)
  if not n.location.valid() or not t.get('name'):return
  if t.get('place') in ('city','town','village','suburb','quarter','neighbourhood') or t.get('railway') in ('station','halt'):
   if 55.571<=n.location.lat<=55.915 and 37.323<=n.location.lon<=37.879:
    rows.append({'id':n.id,'lat':n.location.lat,'lon':n.location.lon,'name':t.get('name:ru',t['name']),'place':t.get('place'),'railway':t.get('railway'),'subway':t.get('station')=='subway' or t.get('subway')=='yes'})
Labels().apply_file(str(root/'source-data/Moscow.osm.pbf'))
(root/'data/moscow-map-labels.json').write_text(json.dumps({'source':'OpenStreetMap / BBBike · 10.10.2026','license':'ODbL 1.0','elements':rows},ensure_ascii=False,separators=(',',':')))
print('Saved named places and stations:',len(rows))
