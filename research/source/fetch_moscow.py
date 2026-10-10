"""Выгрузка открытых данных OpenStreetMap по Москве (Overpass API).

Заменяет вымышленный реестр из шести станций на реальную зарядную инфраструктуру города.
Данные © участники OpenStreetMap, ODbL. Сырые ответы кладутся в data/raw_moscow_*.json.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
BBOX = (55.57, 37.35, 55.91, 37.85)   # Москва в пределах МКАД с запасом
B = ",".join(map(str, BBOX))
UA = "rosatom-ezs-research/0.1 (student competition project)"
ENDPOINTS = ["https://overpass-api.de/api/interpreter",
             "https://overpass.kumi.systems/api/interpreter"]

QUERIES = {
    "charging": (f'nwr["amenity"="charging_station"]({B});', "out center tags;"),
    "substations": (f'nwr["power"="substation"]({B});', "out center tags;"),
    "transit": (f'nwr["station"="subway"]({B}); nwr["railway"="station"]({B});', "out center tags;"),
    "malls": (f'nwr["shop"="mall"]({B}); nwr["amenity"="marketplace"]({B});', "out center tags;"),
    "landuse_res": (f'way["landuse"~"^(residential|commercial|retail)$"]({B});', "out geom;"),
    "landuse_work": (f'way["landuse"~"^(industrial|education)$"]({B}); way["office"]({B});', "out geom;"),
}

# Дороги по всей Москве одним запросом не проходят (504) — режем bbox на плитки.
ROAD_CLASSES = "^(motorway|trunk|primary|secondary)$"


def fetch(name, body, out_clause, force=False):
    path = DATA / f"raw_moscow_{name}.json"
    if path.exists() and not force:
        els = json.loads(path.read_text(encoding="utf-8"))
        print(f"{name}: {len(els)} объектов (из кэша)")
        return els
    q = f"[out:json][timeout:300];({body});{out_clause}"
    last = None
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(
                    ep, data=urllib.parse.urlencode({"data": q}).encode(),
                    headers={"User-Agent": UA, "Accept": "application/json"})
                t0 = time.time()
                raw = urllib.request.urlopen(req, timeout=600).read()
                els = json.loads(raw)["elements"]
                print(f"{name}: {len(els)} объектов, {len(raw)/1e6:.1f} МБ, {time.time()-t0:.0f} с")
                path.write_text(json.dumps(els, ensure_ascii=False), encoding="utf-8")
                return els
            except Exception as e:                      # noqa: BLE001
                last = e
                print(f"{name}: повтор ({ep.split('/')[2]}): {type(e).__name__}")
                time.sleep(5)
    raise RuntimeError(f"{name}: не удалось выгрузить: {last}")


def fetch_roads_tiled(rows=2, cols=2):
    path = DATA / "raw_moscow_roads.json"
    if path.exists():
        els = json.loads(path.read_text(encoding="utf-8"))
        print(f"roads: {len(els)} объектов (из кэша)")
        return els
    s0, w0, n0, e0 = BBOX
    dlat, dlon = (n0 - s0) / rows, (e0 - w0) / cols
    out, seen = [], set()
    for i in range(rows):
        for j in range(cols):
            tb = f"{s0 + i*dlat},{w0 + j*dlon},{s0 + (i+1)*dlat},{w0 + (j+1)*dlon}"
            els = fetch(f"roads_tile_{i}{j}", f'way["highway"~"{ROAD_CLASSES}"]({tb});', "out geom;")
            for e in els:
                if e["id"] not in seen:
                    seen.add(e["id"])
                    out.append(e)
    path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"roads: {len(out)} уникальных участков собрано из плиток")
    return out


def main():
    DATA.mkdir(exist_ok=True)
    for name, (body, out_clause) in QUERIES.items():
        fetch(name, body, out_clause)
    fetch_roads_tiled()


if __name__ == "__main__":
    main()
