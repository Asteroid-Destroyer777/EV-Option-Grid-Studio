"""Build lightweight editorial SVGs from the project's existing OSM geometry."""
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
d=json.loads((ROOT/'data/zil.json').read_text())
A=ROOT/'assets';A.mkdir(exist_ok=True)
def coords(flat, iso=False, height=0):
    points=[]
    for x,z in zip(flat[::2],flat[1::2]):
        if iso: u=500+(x-z)*.105;v=350+(x+z)*.055-height*.75
        else: u=400+x*.155;v=400+z*.155
        points.append((u,v))
    return points

def path(pts):return 'M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in pts)+'Z'
def poly(flat,fill,stroke='',iso=False,height=0):
    return f'<path d="{path(coords(flat,iso,height))}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width=".5"' if stroke else '')+'/>'

for iso,name in [(False,'zil-map.svg'),(True,'zil-isometric.svg')]:
    out=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {1000 if iso else 800} {680 if iso else 800}"><title>ЗИЛ · исходная геометрия OpenStreetMap</title><desc>© участники OpenStreetMap, ODbL. Редакционная схема, не расчётный результат.</desc>']
    if iso:out.append('<path d="M70 350L500 115L930 350L500 585Z" fill="#262e37" stroke="#576676"/>')
    for w in d['water']:out.append(poly(w['o'],'#283d53' if iso else '#2b3540',iso=iso))
    roads=[]
    for r in d['roads']:
        if r[0]>3 or len(r[2])<4:continue
        pts=coords(r[2],iso)
        roads.append('M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in pts))
    out.append('<path d="'+' '.join(roads)+'" fill="none" stroke="#53616e" stroke-width="1.1" opacity=".75"/>')
    buildings=[]
    for b in d['buildings']:
        flat=b[3];cx=sum(flat[::2])/(len(flat)//2);cz=sum(flat[1::2])/(len(flat)//2)
        if abs(cx)> (1450 if iso else 1800) or abs(cz)> (1450 if iso else 1800):continue
        # Ignore micro footprints for a smaller SVG and a readable map.
        area=abs(sum(flat[2*i]*flat[2*((i+1)%(len(flat)//2))+1]-flat[2*((i+1)%(len(flat)//2))]*flat[2*i+1] for i in range(len(flat)//2)))/2
        if area < (850 if iso else 350):continue
        buildings.append((cx+cz,b))
    for _,b in sorted(buildings):
        flat=b[3];h=min(80,b[1]) if iso else 0
        if iso:
            base=coords(flat,True);top=coords(flat,True,h)
            for i in range(len(base)-1):
                out.append(f'<path d="{path([base[i],base[i+1],top[i+1],top[i]])}" fill="#475463" stroke="#35414e" stroke-width=".3"/>')
        out.append(poly(flat,'#91a1b2' if iso else '#52606e','#b6c3d1' if iso else '#6e7d8b',iso,h))
    if iso:
        for lat,lon in [(55.70483,37.65729),(55.70787,37.66034),(55.70886,37.66273),(55.70686,37.66297),(55.71727,37.66271)]:
            x=(lon-d['meta']['lon0'])*d['meta']['kx'];z=(d['meta']['lat0']-lat)*d['meta']['kz'];u,v=coords([x,z],True)[0]
            out.append(f'<path d="M{u:.1f},{v:.1f}v-38" stroke="#8da0ff" stroke-width="1.5"/><circle cx="{u:.1f}" cy="{v-38:.1f}" r="6" fill="#d3daff" stroke="#6579ff" stroke-width="3"/>')
    out.append('</svg>');(A/name).write_text(''.join(out))
    print(name,len(buildings),len(''.join(out)))
(A/'mark.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#6579ff"/><path d="M17 5L8 18h7l-1 9L25 13h-8z" fill="#eeeee7"/></svg>')
