"""
Оценка спроса на зарядку по району ЗИЛ/Даниловский из открытых данных.

Принцип: ПРОСТРАНСТВЕННОЕ РАСПРЕДЕЛЕНИЕ спроса считается из геоданных OSM,
УРОВЕНЬ спроса якорится на публично названные РСЗС цифры. Ни одно число
не подбирается обратным счётом под желаемую картинку.

Источник геометрии — data/zil.json из проекта EV-Option-Grid (выгрузка Overpass API,
© участники OpenStreetMap, ODbL). Файл читается только на чтение.
"""

import json
import math
from collections import defaultdict
from pathlib import Path

ZIL_JSON = Path.home() / "Desktop" / "EV-Option-Grid" / "data" / "zil.json"
OUT_JSON = Path(__file__).resolve().parent.parent / "data" / "demand_zil.json"

# --- Якорные величины из публичных заявлений заказчика (docs/00_key_numbers_reference.md) ---
# Москва: 131 быстрая ЭЗС, ~500 тыс. сессий и ~12,6 млн кВт·ч за всё время эксплуатации.
RSZS_MOSCOW_SESSIONS_ALLTIME = 500_000
RSZS_MOSCOW_KWH_ALLTIME = 12_600_000
KWH_PER_SESSION = RSZS_MOSCOW_KWH_ALLTIME / RSZS_MOSCOW_SESSIONS_ALLTIME  # = 25.2, выведено, не задано

# Средняя отдаваемая мощность за сессию на быстрой ЭЗС: номинал 150 кВт, но кривая заряда
# спадает после ~60-80% SOC. 55 кВт — консервативная середина; см. SENSITIVITY ниже.
AVG_DELIVERED_KW = 55.0
SESSION_MIN = KWH_PER_SESSION / AVG_DELIVERED_KW * 60.0  # ≈ 27.5 мин

TARGET_MEAN_UTILIZATION = 0.10  # «средняя загрузка по московским станциям ~10%» — слова РСЗС
DAYS_PER_MONTH = 30.4

# Прогноз парка EV в РФ из ответа РСЗС: 1 год ~50-60 тыс., 3 года ~150-200 тыс., 5 лет ~300-500 тыс.
FLEET_FORECAST = {"low": (50_000, 150_000, 300_000), "base": (55_000, 175_000, 400_000),
                  "high": (60_000, 200_000, 500_000)}
# Сеть тоже растёт: РСЗС законтрактовала +150 станций к нынешним 131 в Москве. Спрос НА СТАНЦИЮ
# растёт как рост парка, делённый на рост сети — ключевое отличие от текущей модели, где сеть
# не росла вообще и весь прирост парка доставался существующим станциям.
# Рост парка и рост сети — НЕЗАВИСИМЫЕ оси: сценарии по парку считаются при базовом росте сети,
# а чувствительность к росту сети показана отдельно.
NETWORK_GROWTH_BASE = (1.9, 2.8, 3.4)
NETWORK_GROWTH_VARIANTS = {"сеть растёт медленно": (1.6, 2.1, 2.4),
                           "базовый рост сети": NETWORK_GROWTH_BASE,
                           "сеть растёт быстро": (2.1, 3.6, 4.8)}

# --- Веса генерации спроса. Все — ЯВНЫЕ ДОПУЩЕНИЯ КОМАНДЫ, подлежат sensitivity-анализу. ---
# Единица: условный вес спроса на 1000 м² поэтажной площади либо на объект.
BUILDING_WEIGHT = {1: 1.00, 2: 0.85, 4: 0.35, 3: 0.20, 5: 0.0, 0: 0.10}
NEW_BUILD_BONUS = 1.6   # новая застройка (flags&1): выше доля EV в парке жильцов
MALL_WEIGHT = 900.0     # ТЦ как точка притяжения opportunity-зарядки
TRANSIT_HUB_WEIGHT = 700.0   # метро/МЦК: перехват, такси
ROAD_FLOW_WEIGHT = {0: 2.2, 1: 1.4, 2: 0.7, 3: 0.3}  # транзит по классу дороги, на 100 м длины

# Сегменты спроса и чувствительность к крюку (β в exp(-β·d), d в метрах).
# Такси — самая крутая кривая: простой = потерянная выручка.
SEGMENTS = {
    "private":   {"beta": 1.0 / 1200, "share_from": "residential"},
    "corporate": {"beta": 1.0 / 900,  "share_from": "commercial"},
    "transit":   {"beta": 1.0 / 600,  "share_from": "road"},
}

STATIONS = [
    {"id": "ZIL-01", "lat": 55.70483, "lon": 37.65729, "posts": 8, "old_sessions": 8420},
    {"id": "ZIL-02", "lat": 55.70787, "lon": 37.66034, "posts": 6, "old_sessions": 3650},
    {"id": "ZIL-03", "lat": 55.70886, "lon": 37.66273, "posts": 4, "old_sessions": 1350},
    {"id": "ZIL-04", "lat": 55.70686, "lon": 37.66297, "posts": 6, "old_sessions": 4650},
    {"id": "ZIL-05", "lat": 55.71727, "lon": 37.66271, "posts": 4, "old_sessions": 3300},
    {"id": "ZIL-06", "lat": 55.72312, "lon": 37.61682, "posts": 6, "old_sessions": 3100},
]

CELL = 200.0  # размер ячейки сетки спроса, м
EDGE_BUFFER_M = 400.0  # кандидатов у самой границы выгрузки не рассматриваем: у них
                       # искусственно мало конкурентов, потому что соседние районы не выгружены

# «Внешняя опция»: водитель может зарядиться вообще за пределами района. Без неё модель Хаффа
# делит фиксированный пирог между смоделированными точками, поэтому (а) спрос у края выгрузки
# не с кем делить и периферия выглядит золотой, (б) net_gain тождественно равен отнятому
# у конкурентов и обнуляется, если конкурентов убрать. Вес эквивалентен станции на 2 поста
# в 1,5 км — то есть «где-то ещё в городе».
OUTSIDE_OPTION_DISTANCE_M = 1500.0
OUTSIDE_OPTION_POSTS = 2


def load_geo():
    with open(ZIL_JSON, encoding="utf-8") as f:
        return json.load(f)


def project(lat, lon, meta):
    return (lon - meta["lon0"]) * meta["kx"], -(lat - meta["lat0"]) * meta["kz"]


def poly_area(flat):
    a = 0.0
    n = len(flat) // 2
    for i in range(n):
        j = (i + 1) % n
        a += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1]
    return abs(a / 2.0)


def poly_centroid(flat):
    n = len(flat) // 2
    return sum(flat[0::2]) / n, sum(flat[1::2]) / n


def build_demand_grid(geo):
    """Сетка спроса: вес по сегментам в каждой ячейке 200×200 м."""
    cells = defaultdict(lambda: {"private": 0.0, "corporate": 0.0, "transit": 0.0})

    def cell_key(x, z):
        return (int(math.floor(x / CELL)), int(math.floor(z / CELL)))

    for kind, height, flags, flat, _name in geo["buildings"]:
        w = BUILDING_WEIGHT.get(kind, 0.1)
        if w <= 0:
            continue
        floors = max(1, round(height / 3.1))
        floor_area = poly_area(flat) * floors
        weight = w * floor_area / 1000.0
        if kind == 1 and (flags & 1):
            weight *= NEW_BUILD_BONUS
        cx, cz = poly_centroid(flat)
        seg = "private" if kind == 1 else "corporate"
        cells[cell_key(cx, cz)][seg] += weight

    for mall in geo["poi"]["malls"]:
        cells[cell_key(mall["x"], mall["z"])]["corporate"] += MALL_WEIGHT

    for st in geo["poi"]["stations"]:
        cells[cell_key(st["x"], st["z"])]["transit"] += TRANSIT_HUB_WEIGHT

    for cls, _flags, flat, *_rest in geo["roads"]:
        w = ROAD_FLOW_WEIGHT.get(cls)
        if not w:
            continue
        for i in range(0, len(flat) - 2, 2):
            x0, z0, x1, z1 = flat[i], flat[i + 1], flat[i + 2], flat[i + 3]
            seg_len = math.hypot(x1 - x0, z1 - z0)
            cells[cell_key((x0 + x1) / 2, (z0 + z1) / 2)]["transit"] += w * seg_len / 100.0

    out = []
    for (ix, iz), segs in cells.items():
        if sum(segs.values()) <= 0:
            continue
        out.append({"x": (ix + 0.5) * CELL, "z": (iz + 0.5) * CELL, **segs})
    return out


def merge_duplicate_points(points, radius=60.0):
    """Склейка точек одного физического объекта: в OSM одна площадка часто размечена
    несколькими узлами (встречаются пары в 4-9 м). Без склейки привлекательность
    конкурента считается по каждому узлу и их тяга завышается."""
    merged = []
    for p in points:
        for m in merged:
            if math.hypot(m["x"] - p["x"], m["z"] - p["z"]) < radius:
                m["posts"] += p["posts"]
                m["merged"] += 1
                break
        else:
            merged.append({**p, "merged": 1})
    return merged


def collect_competitors(geo):
    """Реальные ЭЗС конкурентов из OSM — их отсутствие в текущей модели завышает наш спрос."""
    out = []
    for i, c in enumerate(geo["poi"]["charging"]):
        try:
            posts = int(str(c.get("cap") or "2").split(";")[0])
        except ValueError:
            posts = 2
        out.append({"id": f"OSM-{i:02d}", "x": c["x"], "z": c["z"],
                    "posts": max(1, min(posts, 12)), "op": c.get("op") or "неизвестен",
                    "own": False})
    return merge_duplicate_points(out)


def allocate(cells, sites):
    """Модель Хаффа: доля спроса ячейки, достающаяся станции, ∝ привлекательность × exp(-β·d)."""
    totals = {s["id"]: 0.0 for s in sites}
    per_segment = {s["id"]: defaultdict(float) for s in sites}
    for cell in cells:
        for seg, cfg in SEGMENTS.items():
            demand = cell[seg]
            if demand <= 0:
                continue
            beta = cfg["beta"]
            weights = []
            for s in sites:
                d = math.hypot(s["x"] - cell["x"], s["z"] - cell["z"])
                attract = s["posts"] ** 0.7   # убывающая отдача от числа постов
                weights.append(attract * math.exp(-beta * d))
            outside = (OUTSIDE_OPTION_POSTS ** 0.7) * math.exp(-beta * OUTSIDE_OPTION_DISTANCE_M)
            tot = sum(weights) + outside
            if tot <= 0:
                continue
            for s, w in zip(sites, weights):
                share = demand * w / tot
                totals[s["id"]] += share
                per_segment[s["id"]][seg] += share
    return totals, per_segment


def accessible_cells(geo, cells):
    """Кандидатом может быть только ячейка с подъездом: дорога класса ≤4 в пределах 120 м."""
    road_pts = []
    for cls, _flags, flat, *_rest in geo["roads"]:
        if cls > 4:
            continue
        for i in range(0, len(flat), 2):
            road_pts.append((flat[i], flat[i + 1]))
    meta = geo["meta"]
    out = []
    for c in cells:
        if (abs(c["x"]) > meta["halfW"] - EDGE_BUFFER_M
                or abs(c["z"]) > meta["halfH"] - EDGE_BUFFER_M):
            continue
        for rx, rz in road_pts:
            if math.hypot(rx - c["x"], rz - c["z"]) < 120:
                out.append(c)
                break
    return out


def score_candidates(demand_cells, positions, sites, scale, capacity_per_post, new_posts=2):
    """Что перехватит новая станция в каждой точке и у кого именно она это отнимет.

    demand_cells — ВСЕ ячейки спроса (на них же калиброван scale);
    positions — только те, где физически можно поставить станцию.
    Раньше сюда передавался один и тот же урезанный список, из-за чего спрос
    кандидатов занижался на 17% массы и ломалось ранжирование.
    """
    cells = demand_cells
    own_ids = {s["id"] for s in sites if s.get("own")}
    base_totals, _ = allocate(cells, sites)
    base_own = {i: base_totals[i] for i in own_ids}
    out = []
    for cand in positions:
        trial = sites + [{"id": "CAND", "x": cand["x"], "z": cand["z"], "posts": new_posts, "own": True}]
        totals, _ = allocate(cells, trial)
        captured = totals["CAND"] * scale
        cannibalized = sum(max(0.0, base_own[i] - totals[i]) for i in own_ids) * scale
        cap = capacity_per_post * new_posts
        out.append({
            "x": round(cand["x"], 1), "z": round(cand["z"], 1),
            "sessions_per_month": round(captured),
            "utilization": round(captured / cap, 4),
            "cannibalized_from_own": round(cannibalized),
            "net_gain": round(captured - cannibalized),
        })
    out.sort(key=lambda r: -r["net_gain"])
    return out


def spread_out(candidates, min_dist=500.0, limit=15):
    """Жадный отбор непересекающихся площадок: соседние ячейки — это одна и та же точка,
    в списке для заказчика нужны РАЗНЫЕ варианты, а не 15 копий лучшего пятачка."""
    picked = []
    for c in candidates:
        if all(math.hypot(c["x"] - p["x"], c["z"] - p["z"]) >= min_dist for p in picked):
            picked.append(c)
        if len(picked) >= limit:
            break
    return picked


def label_site(geo, x, z, radius=600.0):
    """Человекочитаемая привязка площадки: ближайшие именованные объекты и чужие ЭЗС."""
    near = []
    for _cat, outer, _holes, name in geo["land"]:
        if not name:
            continue
        n = len(outer) // 2
        cx, cz = sum(outer[0::2]) / n, sum(outer[1::2]) / n
        d = math.hypot(cx - x, cz - z)
        if d < radius:
            near.append((d, name))
    for key in ("malls", "stations"):
        for p in geo["poi"][key]:
            if not p.get("name"):
                continue
            d = math.hypot(p["x"] - x, p["z"] - z)
            if d < radius:
                near.append((d, f"{p['name']} ({'ТЦ' if key == 'malls' else 'станция'})"))
    near.sort()
    nearest_rival = min(
        (math.hypot(c["x"] - x, c["z"] - z) for c in geo["poi"]["charging"]), default=None)
    return {
        "landmarks": [f"{n} — {d:.0f} м" for d, n in near[:5]],
        "nearest_competitor_m": round(nearest_rival) if nearest_rival is not None else None,
    }


def crosscheck_anchor(capacity_per_post):
    """ОДНОСТОРОННЯЯ проверка на правдоподобие, а НЕ валидация якоря.

    Из «500 тыс. сессий за всё время» выводится средняя загрузка за историю сети.
    Она обязана быть НИЖЕ текущей (сеть и загрузка росли) — это всё, что тест проверяет.
    Он не способен отличить якорь 10% от 20%, поэтому вердикт не хардкодится, а показывается
    сетка по правдоподобным значениям срока работы и размера сети.
    """
    grid = {}
    for months in (30, 42, 54):
        for stations in (55, 75, 100):
            for posts in (2, 3):
                v = RSZS_MOSCOW_SESSIONS_ALLTIME / months / stations / posts / capacity_per_post
                grid[f"{months} мес × {stations} станций × {posts} поста"] = round(v, 4)
    lo, hi = min(grid.values()), max(grid.values())
    return {
        "alltime_utilization_range": [lo, hi],
        "current_stated_utilization": TARGET_MEAN_UTILIZATION,
        "grid": grid,
        "what_this_proves": "только то, что средняя за историю ниже заявленных сегодня 10% "
                            f"при любых правдоподобных допущениях (диапазон {lo:.1%}–{hi:.1%}). "
                            "Тест односторонний: якорь 20% он бы тоже не отверг.",
        "what_this_does_not_prove": "что якорь 10% верен. Это допущение, взятое со слов заказчика.",
    }


def main():
    geo = load_geo()
    meta = geo["meta"]

    own = []
    for s in STATIONS:
        x, z = project(s["lat"], s["lon"], meta)
        own.append({**s, "x": x, "z": z, "own": True})
    competitors = collect_competitors(geo)
    sites = own + competitors

    cells = build_demand_grid(geo)
    raw, per_seg = allocate(cells, sites)

    # Физически состоятельная ёмкость поста: сколько сессий влезает в месяц при 100% занятости.
    capacity_per_post = (24 * 60 / SESSION_MIN) * DAYS_PER_MONTH
    own_posts = sum(s["posts"] for s in own)
    own_raw = sum(raw[s["id"]] for s in own)

    # Калибровка УРОВНЯ: масштабируем так, чтобы средневзвешенная по постам загрузка
    # наших станций равнялась публичной средней загрузке РСЗС по Москве (~10%).
    target_sessions = TARGET_MEAN_UTILIZATION * capacity_per_post * own_posts
    scale = target_sessions / own_raw

    results = []
    for s in own:
        sessions = raw[s["id"]] * scale
        cap = capacity_per_post * s["posts"]
        seg_total = sum(per_seg[s["id"]].values()) or 1.0
        results.append({
            "id": s["id"], "posts": s["posts"],
            "sessions_per_month": round(sessions),
            "capacity_per_month": round(cap),
            "utilization": round(sessions / cap, 4),
            "mix": {k: round(v / seg_total, 3) for k, v in sorted(per_seg[s["id"]].items())},
            "old_sessions_per_month": s["old_sessions"],
            "old_utilization_if_48min": round(s["old_sessions"] / ((1440 / 48) * DAYS_PER_MONTH * s["posts"]), 4),
        })

    cand_cells = accessible_cells(geo, cells)
    candidates = score_candidates(cells, cand_cells, sites, scale, capacity_per_post)
    for c in candidates:
        c["lat"] = round(meta["lat0"] - c["z"] / meta["kz"], 5)
        c["lon"] = round(meta["lon0"] + c["x"] / meta["kx"], 5)
    shortlist = spread_out(candidates)
    for c in shortlist:
        c.update(label_site(geo, c["x"], c["z"]))

    comp_raw = sum(raw[c["id"]] for c in competitors)
    def per_station_index(fleet, netw):
        return {"2027": 1.0,
                "2030": round((fleet[1] / fleet[0]) / netw[1] * netw[0], 3),
                "2035": round((fleet[2] / fleet[0]) / netw[2] * netw[0], 3)}

    scenarios = {name: per_station_index(FLEET_FORECAST[name], NETWORK_GROWTH_BASE)
                 for name in ("low", "base", "high")}
    network_sensitivity = {label: per_station_index(FLEET_FORECAST["base"], netw)
                           for label, netw in NETWORK_GROWTH_VARIANTS.items()}

    out = {
        "generated_for": "EV-Option Grid — замена синтетического спроса на оценку из открытых данных",
        "geometry_source": meta.get("source"),
        "method": "Huff / gravity allocation по сетке 200 м; конкуренция с реальными ЭЗС из OSM",
        "derived_constants": {
            "kwh_per_session": {"value": round(KWH_PER_SESSION, 2), "provenance": "derived",
                                "note": "12,6 млн кВт·ч / 500 тыс. сессий — публичные цифры РСЗС по Москве"},
            "session_minutes": {"value": round(SESSION_MIN, 1), "provenance": "derived",
                                "note": f"{KWH_PER_SESSION:.1f} кВт·ч при средней отдаче {AVG_DELIVERED_KW:.0f} кВт"},
            "capacity_sessions_per_post_month": {"value": round(capacity_per_post), "provenance": "derived",
                                                 "note": "24ч/сессию × 30,4 дня — физический потолок при 100% занятости"},
            "calibration_anchor": {"value": TARGET_MEAN_UTILIZATION, "provenance": "rszs",
                                   "note": "средняя загрузка московских ЭЗС РСЗС ~10% (ответ в чате соревнования)"},
        },
        "assumptions_team": {
            "avg_delivered_kw": AVG_DELIVERED_KW,
            "building_weights": BUILDING_WEIGHT,
            "new_build_bonus": NEW_BUILD_BONUS,
            "mall_weight": MALL_WEIGHT, "transit_hub_weight": TRANSIT_HUB_WEIGHT,
            "road_flow_weight": ROAD_FLOW_WEIGHT,
            "segment_beta_m": {k: round(1 / v["beta"]) for k, v in SEGMENTS.items()},
            "fleet_forecast_source": "rszs: ответ в чате — 1 год ~50-60 тыс., 3 года ~150-200 тыс., 5 лет ~300-500 тыс.",
            "network_growth_index_base": NETWORK_GROWTH_BASE,
            "network_growth_note": "САМОЕ СЛАБОЕ ДОПУЩЕНИЕ: рост числа станций в Москве. Опора — "
                                   "законтрактованные +150 станций к нынешним 131. Требует sensitivity-анализа.",
            "note": "веса заданы командой, не откалиброваны на сессионных данных (их нет без NDA)",
        },
        "competition": {
            "osm_charging_sites": len(competitors),
            "operators": sorted({c["op"] for c in competitors}),
            "share_of_district_demand_to_competitors": round(comp_raw / (comp_raw + own_raw), 3),
            "note": "в текущей модели EV-Option Grid конкуренция отсутствует, весь спрос достаётся нашим 6 станциям",
        },
        "anchor_crosscheck": crosscheck_anchor(capacity_per_post),
        "demand_cells": len(cells),
        "stations": results,
        "candidates": {
            "note": "новая станция на 2 поста в каждой доступной ячейке; net_gain = перехват минус "
                    "каннибализация собственной сети. Это и есть «список площадок с баллами».",
            "evaluated": len(candidates),
            "shortlist_min_distance_m": 500,
            "top": shortlist,
            "all": candidates,
        },
        "growth_index_per_station": {
            "note": "рост парка EV (прогноз РСЗС) делённый на рост сети — спрос НА СТАНЦИЮ, а не суммарный",
            "scenarios_by_fleet": scenarios,
            "sensitivity_to_network_growth": network_sensitivity,
            "key_finding": "прирост парка НЕ переходит в прирост спроса на станцию один к одному: "
                           "при быстром строительстве сети тот же парк делится на большее число станций",
        },
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"ячеек спроса: {len(cells)}   конкурентов из OSM: {len(competitors)}")
    print(f"kWh/сессию (выведено): {KWH_PER_SESSION:.1f}   длительность сессии: {SESSION_MIN:.1f} мин")
    print(f"потолок поста: {capacity_per_post:.0f} сессий/мес при 100% занятости\n")
    print(f"{'станция':8} {'постов':>6} {'сессий/мес':>11} {'загрузка':>9} {'было':>8} {'было, загр.':>12}")
    for r in results:
        print(f"{r['id']:8} {r['posts']:>6} {r['sessions_per_month']:>11} {r['utilization']*100:>8.1f}% "
              f"{r['old_sessions_per_month']:>8} {r['old_utilization_if_48min']*100:>11.1f}%")
    print(f"\nдоля спроса района, уходящая конкурентам: {out['competition']['share_of_district_demand_to_competitors']*100:.1f}%")
    print(f"операторы рядом: {', '.join(out['competition']['operators'])}")

    cc = out["anchor_crosscheck"]
    lo, hi = cc["alltime_utilization_range"]
    print(f"\nпроверка якоря (ОДНОСТОРОННЯЯ): загрузка за историю сети {lo:.1%}–{hi:.1%} при разных "
          f"допущениях, против заявленных сегодня {cc['current_stated_utilization']:.0%}.")
    print("  доказывает только, что средняя за историю ниже текущей; якорь 20% тест бы тоже не отверг")

    print(f"\nплощадок-кандидатов оценено: {len(candidates)}. Топ-5 по чистому приросту:")
    print(f"{'#':>2} {'x':>8} {'z':>8} {'сессий/мес':>11} {'загрузка':>9} {'канниб.':>9} {'чистый':>8}")
    for i, c in enumerate(shortlist[:5], 1):
        print(f"{i:>2} {c['x']:>8.0f} {c['z']:>8.0f} {c['sessions_per_month']:>11} "
              f"{c['utilization']*100:>8.1f}% {c['cannibalized_from_own']:>9} {c['net_gain']:>8}")
    print(f"\nзаписано: {OUT_JSON}")


if __name__ == "__main__":
    main()
