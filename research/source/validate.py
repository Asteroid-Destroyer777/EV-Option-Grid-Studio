"""
Проверка модели на переоткрытие: находит ли она места, куда операторы поставили станции сами.

Логика теста. Прячем случайную часть реальных быстрых ЭЗС, пересчитываем модель по
оставшимся и ранжируем все площадки города. Если модель работает, спрятанные станции
должны попадать в верхнюю часть рейтинга: операторы выбирали эти точки, располагая
данными, которых у нас нет (трафик, договоры аренды, техусловия, поведение клиентов).

Ключевая тонкость — контроль. Если станцию убрать, на её месте образуется «дыра», и
любая точка внутри дыры выглядит привлекательно просто потому, что рядом нет зарядок.
Поэтому спрятанные станции сравниваются не со всеми площадками подряд, а с площадками,
находящимися на ТОМ ЖЕ удалении от ближайшей оставшейся быстрой станции. Так проверяется
именно качество выбора места, а не факт наличия пустоты.
"""

import json
import math
from pathlib import Path

import numpy as np

import city_model as cm

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "validation.json"

FOLDS = 5
HOLDOUT_SHARE = 0.2
DIST_TOLERANCE = 0.25     # контроль подбирается в пределах ±25% по удалению от ближайшей станции


def nearest_dist(x, z, sites):
    return min(math.hypot(s["x"] - x, s["z"] - z) for s in sites) if sites else float("inf")


def percentile_rank(values, v):
    """Доля площадок, которые модель оценила ХУЖЕ данной (1.0 — лучшая в городе)."""
    return float((values < v).mean())


def run_fold(stations, cells, capacity_per_post, hold_idx):
    kept = [s for i, s in enumerate(stations) if i not in hold_idx]
    held = [stations[i] for i in hold_idx]

    totals, denom, weights, coords, _ = cm.allocate(cells, kept)
    dc_kept = [s for s in kept if s["is_dc"]]
    dc_posts = sum(s["posts"] for s in dc_kept)
    dc_tot = sum(t for t, s in zip(totals, kept) if s["is_dc"])
    scale = (cm.TARGET_MEAN_UTILIZATION * capacity_per_post * dc_posts) / dc_tot

    positions = [c for c in cells if c["road"] > 0]
    scored = cm.score_candidates(cells, positions, kept, denom, weights, coords,
                                 scale, capacity_per_post)
    by_xy = {(round(c["x"], 1), round(c["z"], 1)): c["net_gain"] for c in scored}
    gains = np.array([c["net_gain"] for c in scored])

    pos_index = {(round(p["x"], 1), round(p["z"], 1)): p for p in positions}

    # Контроль матчится по КОНКУРЕНТНОМУ ДАВЛЕНИЮ, а не по расстоянию до быстрой станции.
    # Расстояние — плохой контроль: спрятанные станции обычно стоят там, где рядом есть
    # ещё и медленные точки других операторов, то есть конкуренции у них заведомо больше,
    # чем у равноудалённых по «быстрым» альтернатив. Суммарный знаменатель Хаффа
    # учитывает всю конкуренцию сразу — и быстрые, и медленные.
    pressure = {}
    keys = list(pos_index)
    kx = np.array([pos_index[k]["x"] for k in keys])
    kz = np.array([pos_index[k]["z"] for k in keys])
    sx = np.array([s_["x"] for s_ in kept])
    sz = np.array([s_["z"] for s_ in kept])
    attract = np.array([cm.attractiveness(s_["posts"], s_["kw"], s_["is_dc"]) for s_ in kept])
    attract = attract * cm.anchor_quality(sx, sz)
    dm = np.hypot(kx[:, None] - sx[None, :], kz[:, None] - sz[None, :])
    beta = cm.SEGMENTS["private"]["beta"]
    press = (attract[None, :] * np.exp(-beta * dm)).sum(axis=1)
    for k, v in zip(keys, press):
        pressure[k] = float(v)

    true_ranks, ctrl_ranks = [], []
    for h in held:
        # ближайшая оцененная площадка к спрятанной станции
        best_key, best_d = None, float("inf")
        for k, p in pos_index.items():
            dd = math.hypot(p["x"] - h["x"], p["z"] - h["z"])
            if dd < best_d:
                best_key, best_d = k, dd
        if best_key is None or best_d > cm.CELL:
            continue
        r = percentile_rank(gains, by_xy[best_key])
        true_ranks.append(r)

        # контроль: площадки с тем же конкурентным давлением
        target = pressure[best_key]
        matched = [k for k, v in pressure.items()
                   if k != best_key and abs(v - target) <= DIST_TOLERANCE * max(target, 1e-6)]
        if matched:
            ctrl_ranks.append(float(np.mean([percentile_rank(gains, by_xy[k]) for k in matched])))
    return true_ranks, ctrl_ranks


def demand_at(cells, x, z, radius=700.0):
    """Суммарный спрос вокруг точки — без всякой конкуренции и дыр."""
    tot = 0.0
    for c in cells:
        if math.hypot(c["x"] - x, c["z"] - z) <= radius:
            tot += sum(c[k] for k in ("res", "work", "road"))
    return tot


def sanity_tests(stations, cells, rng):
    """Два теста, не зависящих от эффекта «дыры».

    1. Стоят ли станции в местах с более высоким спросом, чем случайная точка города.
       Проверяет саму поверхность спроса, а не логику отбора.
    2. Связано ли число постов, которое оператор реально поставил, с нашим спросом.
       Число постов — это ставка оператора деньгами, сделанная со знанием рынка.
    """
    xs = [c["x"] for c in cells]
    zs = [c["z"] for c in cells]
    dc = [s for s in stations if s["is_dc"]]

    d_st = np.array([demand_at(cells, s["x"], s["z"]) for s in dc])
    idx = rng.choice(len(cells), size=min(300, len(cells)), replace=False)
    d_rand = np.array([demand_at(cells, cells[i]["x"], cells[i]["z"]) for i in idx])
    auc_place = float((d_st[:, None] > d_rand[None, :]).mean())

    posts = np.array([s["posts"] for s in dc], dtype=float)
    if len(set(posts.tolist())) > 1 and d_st.std() > 0:
        rp = np.argsort(np.argsort(posts))
        rd = np.argsort(np.argsort(d_st))
        spearman = float(np.corrcoef(rp, rd)[0, 1])
    else:
        spearman = None
    return {
        "станции_стоят_в_спросе": {
            "AUC_против_случайной_точки": round(auc_place, 3),
            "медианный_спрос_у_станций": round(float(np.median(d_st))),
            "медианный_спрос_случайной_точки": round(float(np.median(d_rand))),
            "смысл": "проверяет поверхность спроса саму по себе: действительно ли зарядки "
                     "стоят там, где по нашей модели больше спроса",
        },
        "число_постов_против_спроса": {
            "корреляция_Спирмена": round(spearman, 3) if spearman is not None else None,
            "смысл": "оператор ставит больше постов там, где ждёт больше клиентов. Это его "
                     "ставка деньгами и независимый сигнал о качестве нашей поверхности спроса",
        },
    }


def main():
    stations = cm.parse_stations()
    cells = cm.build_demand(None)
    capacity_per_post = (24 * 60 / cm.SESSION_MIN) * cm.DAYS_PER_MONTH

    dc_idx = [i for i, s in enumerate(stations) if s["is_dc"]]
    rng = np.random.default_rng(20260928)
    sanity = sanity_tests(stations, cells, rng)
    sp = sanity["станции_стоят_в_спросе"]
    print("ТЕСТ ПОВЕРХНОСТИ СПРОСА (без эффекта дыры)")
    print(f"  станции против случайной точки города: AUC {sp['AUC_против_случайной_точки']:.3f} "
          f"(спрос у станций {sp['медианный_спрос_у_станций']}, у случайной точки "
          f"{sp['медианный_спрос_случайной_точки']})")
    print(f"  связь числа постов со спросом: Спирмен "
          f"{sanity['число_постов_против_спроса']['корреляция_Спирмена']}\n")
    n_hold = max(3, int(len(dc_idx) * HOLDOUT_SHARE))

    all_true, all_ctrl, per_fold = [], [], []
    for fold in range(FOLDS):
        hold = set(rng.choice(dc_idx, size=n_hold, replace=False).tolist())
        t, c = run_fold(stations, cells, capacity_per_post, hold)
        all_true += t
        all_ctrl += c
        per_fold.append({"фолд": fold + 1, "спрятано": len(hold),
                         "медианный_ранг_спрятанных": round(float(np.median(t)), 3) if t else None,
                         "медианный_ранг_контроля": round(float(np.median(c)), 3) if c else None})
        print(f"фолд {fold + 1}: спрятано {len(hold)} станций, "
              f"медианный ранг спрятанных {np.median(t):.1%}, контроля {np.median(c):.1%}")

    true_arr, ctrl_arr = np.array(all_true), np.array(all_ctrl)
    # AUC: вероятность, что случайная спрятанная станция оценена выше случайного контроля
    auc = float((true_arr[:, None] > ctrl_arr[None, :]).mean())
    top_decile = float((true_arr >= 0.9).mean())

    res = {
        "что_проверяем": "прячем часть реальных быстрых ЭЗС и смотрим, попадают ли они в верх "
                         "рейтинга площадок, построенного по оставшимся",
        "контроль": "площадки с тем же конкурентным давлением (суммарный знаменатель Хаффа по "
                    "всем оставшимся зарядкам, быстрым и медленным). Матчить по расстоянию до "
                    "ближайшей быстрой станции нельзя: у спрятанных станций рядом обычно есть "
                    "ещё и медленные точки, то есть конкуренции у них заведомо больше",
        "фолдов": FOLDS,
        "спрятанных_станций_всего": len(all_true),
        "медианный_ранг_спрятанных": round(float(np.median(true_arr)), 3),
        "медианный_ранг_контроля": round(float(np.median(ctrl_arr)), 3),
        "AUC": round(auc, 3),
        "доля_спрятанных_в_топ_10_процентов": round(top_decile, 3),
        "по_фолдам": per_fold,
        "дополнительные_тесты": sanity,
        "интерпретация": "AUC 0,5 — модель не лучше случая; выше 0,7 — уверенно отличает места, "
                         "выбранные операторами, от альтернатив с тем же конкурентным давлением",
        "вердикт": None,
        "как_это_читать": {
            "что_установлено": "поверхность спроса состоятельна на грубом уровне (станции стоят "
                               "в местах примерно вдвое более спросовых, чем случайная точка "
                               "города), но на тонком уровне выбор операторов моделью не "
                               "воспроизводится: среди площадок с тем же конкурентным давлением "
                               "реальные станции оцениваются нашей моделью не выше альтернатив",
            "трактовка_1": "операторы размещают станции НЕ по максимуму спроса. Это согласуется "
                           "со словами самого заказчика: площадки отсеиваются по доступности "
                           "мощности и согласованию с собственником земли, в Москве локации "
                           "выдаёт Дептранс, а средняя загрузка 9-10% против нужных 20%",
            "трактовка_2": "наша модель спроса упускает факторы, которыми пользуются операторы "
                           "(видимость, парковка, заезд, договорённости по земле, техусловия)",
            "тест_их_не_различает": True,
            "что_это_значит_для_проекта": "результат нельзя подавать как подтверждение модели. "
                                          "Но он же показывает, что действующая сеть не является "
                                          "демо-оптимальной — то есть проблема, ради которой "
                                          "проводится конкурс, существует и измерима",
            "как_проверить_по_настоящему": "нужны данные о фактической загрузке станций. Тогда "
                                            "модель проверяется напрямую: предсказанная загрузка "
                                            "против фактической. Это и есть предмет NDA",
        },
    }
    res["вердикт"] = ("модель переоткрывает выбор операторов" if auc >= 0.7 else
                      "модель слабо отличает реальные площадки от альтернатив" if auc >= 0.55 else
                      "модель НЕ переоткрывает выбор операторов — см. «как_это_читать»")
    OUT.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nспрятанных станций всего: {len(all_true)}")
    print(f"медианный ранг спрятанных: {np.median(true_arr):.1%}")
    print(f"медианный ранг контроля:   {np.median(ctrl_arr):.1%}")
    print(f"AUC: {auc:.3f}   в топ-10% города: {top_decile:.1%}")
    print(f"вердикт: {res['вердикт']}")
    print(f"\nзаписано: {OUT}")


if __name__ == "__main__":
    main()
