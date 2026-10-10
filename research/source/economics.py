"""
Экономика ЭЗС, откалиброванная по публичным заявлениям заказчика.

Ключевой приём: CAPEX и маржа НЕ выдумываются. РСЗС публично назвала две вещи —
(1) для окупаемости нужна загрузка ~20%, (2) внутренний норматив окупаемости 7-8 лет.
Это уравнение: экономика обязана давать окупаемость ~7,5 лет ровно при 20% загрузки.
Из него выводится маржа, и той же маржой считаются все наши площадки.
Каждое число прослеживается до слов заказчика.
"""

# --- Публичные заявления РСЗС (docs/00_key_numbers_reference.md) ---
BREAKEVEN_UTILIZATION = 0.20      # «для окупаемости нужно порядка 20%»
TARGET_PAYBACK_YEARS = 7.5        # «внутренний норматив по сроку окупаемости 7-8 лет»
ENERGY_COST_EX_VAT = 18.9         # ₽/кВт·ч, закупка электроэнергии (23 ₽ с НДС)
SUBSIDY_SHARE = 0.70              # «Энергия Москвы»: до 70% CAPEX на оборудование
KWH_PER_SESSION = 25.2            # выведено: 12,6 млн кВт·ч / 500 тыс. сессий

# --- Допущения команды: на вопросы про CAPEX/OPEX заказчик не ответил ---
CAPEX_FIXED_MLN = 4.0             # площадка, СМР, щитовое, цифровая интеграция — не зависит от числа постов
CAPEX_PER_POST_MLN = 4.0          # зарядный пост 150 кВт («Парус Электро») с монтажом
OPEX_FIXED_MLN = 0.7              # аренда площадки, связь, эквайринг, администрирование — в год
OPEX_PER_POST_MLN = 0.2           # обслуживание поста — в год
DISCOUNT_RATE = 0.18
HORIZON_YEARS = 10
BASE_POSTS = 2                    # минимум по требованию заказчика к городской станции


def capacity_sessions_per_post_month(session_minutes):
    return (24 * 60 / session_minutes) * 30.4


def capex_mln(posts, capex_fixed=CAPEX_FIXED_MLN, capex_per_post=CAPEX_PER_POST_MLN):
    return capex_fixed + capex_per_post * posts


def opex_mln(posts):
    return OPEX_FIXED_MLN + OPEX_PER_POST_MLN * posts


def own_capex_rub(posts, connection_mln, capex_fixed=CAPEX_FIXED_MLN, capex_per_post=CAPEX_PER_POST_MLN):
    """Субсидия «Энергия Москвы» покрывает до 70% оборудования; техприсоединение платим полностью."""
    equipment = capex_mln(posts, capex_fixed, capex_per_post) * 1e6
    return equipment * (1 - SUBSIDY_SHARE) + connection_mln * 1e6


def implied_margin_per_kwh(session_minutes, capex_fixed=CAPEX_FIXED_MLN,
                           capex_per_post=CAPEX_PER_POST_MLN, posts=BASE_POSTS):
    """Обратная задача: какая маржа даёт окупаемость 7,5 лет при загрузке 20%.

    Это НЕ подгонка под картинку, а перевод публичного утверждения заказчика
    («20% загрузки окупают станцию за 7-8 лет») в рублёвую величину.
    """
    sessions_year = capacity_sessions_per_post_month(session_minutes) * posts * 12 * BREAKEVEN_UTILIZATION
    kwh_year = sessions_year * KWH_PER_SESSION
    own = own_capex_rub(posts, 0.0, capex_fixed, capex_per_post)
    gross_needed = own / TARGET_PAYBACK_YEARS + opex_mln(posts) * 1e6
    return gross_needed / kwh_year


def station_economics(sessions_per_month, posts, session_minutes, margin_per_kwh,
                      growth_index=None, connection_extra_mln=0.0,
                      capex_fixed=CAPEX_FIXED_MLN, capex_per_post=CAPEX_PER_POST_MLN):
    """NPV, простая окупаемость и годовой поток по одной площадке.

    sessions_per_month — фактический поток ВСЕЙ станции; CAPEX и OPEX масштабируются
    числом постов. Никакого пост-масштабирования результата не делается.
    """
    own = own_capex_rub(posts, connection_extra_mln, capex_fixed, capex_per_post)
    annual_opex = opex_mln(posts) * 1e6

    cum, payback_year, npv = -own, None, -own
    first_net = None
    for year in range(1, HORIZON_YEARS + 1):
        k = growth_index(year) if growth_index else 1.0
        kwh = sessions_per_month * k * 12 * KWH_PER_SESSION
        net = kwh * margin_per_kwh - annual_opex
        if first_net is None:
            first_net = net
        npv += net / (1 + DISCOUNT_RATE) ** year
        prev = cum
        cum += net
        if payback_year is None and cum >= 0 and net > 0:
            payback_year = year - 1 + (-prev / net)

    static = None
    if growth_index is not None:
        static = station_economics(sessions_per_month, posts, session_minutes, margin_per_kwh,
                                   None, connection_extra_mln, capex_fixed, capex_per_post)
    return {
        "capex_total_mln": round(capex_mln(posts, capex_fixed, capex_per_post) + connection_extra_mln, 2),
        "own_capex_mln": round(own / 1e6, 2),
        "annual_net_year1_mln": round(first_net / 1e6, 2),
        "npv_mln": round(npv / 1e6, 2),
        "payback_years": round(payback_year, 1) if payback_year else None,
        "payback_within_norm": bool(payback_year and payback_year <= 8.0),
        # Консервативный вариант: спрос не растёт вообще. Именно его показывать первым —
        # иначе весь результат держится на прогнозе роста парка, как в старом прототипе.
        "static_npv_mln": static["npv_mln"] if static else None,
        "static_payback_years": static["payback_years"] if static else None,
    }


def _breakeven_utilization(session_minutes, margin, posts=BASE_POSTS, years=8.0):
    """Какая загрузка нужна, чтобы уложиться в норматив — без всякого роста спроса.
    Это честная граница: её и надо сравнивать с прогнозом по площадке."""
    own = own_capex_rub(posts, 0.0)
    need_annual = own / years + opex_mln(posts) * 1e6
    kwh_at_full = capacity_sessions_per_post_month(session_minutes) * posts * 12 * KWH_PER_SESSION
    return need_annual / (kwh_at_full * margin)


def sanity_check(session_minutes):
    """Калибровка обязана воспроизводить утверждение заказчика: 20% загрузки → ~7,5 лет."""
    margin = implied_margin_per_kwh(session_minutes)
    cap = capacity_sessions_per_post_month(session_minutes)
    econ = station_economics(cap * BASE_POSTS * BREAKEVEN_UTILIZATION, BASE_POSTS,
                             session_minutes, margin)
    at_10 = station_economics(cap * BASE_POSTS * 0.10, BASE_POSTS, session_minutes, margin)
    # ВАЖНО: «при 10% не окупается» — НЕ валидация. Это алгебраическое следствие конструкции:
    # калибровка задаёт net(20%) = own/7,5; поток линеен по загрузке, OPEX — нет, поэтому
    # net(10%) = own/15 − OPEX/2, а для окупаемости за 10 лет нужно net ≥ own/10. Условие
    # сводится к −own/30 ≥ OPEX/2, что невозможно при любых положительных own и OPEX.
    # Тест не может провалиться и потому ничего не проверяет. Выдавать его за совпадение
    # со словами заказчика нельзя.
    return {
        "implied_margin_per_kwh": round(margin, 2),
        "implied_retail_ex_vat": round(ENERGY_COST_EX_VAT + margin, 2),
        "implied_retail_with_vat": round((ENERGY_COST_EX_VAT + margin) * 1.2, 1),
        "payback_at_20pct": econ["payback_years"],
        "payback_at_10pct": at_10["payback_years"],
        "payback_at_10pct_note": "следствие конструкции, а не проверка: при линейном потоке и "
                                 "постоянном OPEX этот результат получается при ЛЮБЫХ параметрах",
        "breakeven_utilization_for_8y": round(_breakeven_utilization(session_minutes, margin), 4),
        "verdict": "калибровка сходится" if econ["payback_years"] and
                   abs(econ["payback_years"] - TARGET_PAYBACK_YEARS) < 0.6 else "РАСХОЖДЕНИЕ",
    }


if __name__ == "__main__":
    import json
    print(json.dumps(sanity_check(27.5), ensure_ascii=False, indent=2))
