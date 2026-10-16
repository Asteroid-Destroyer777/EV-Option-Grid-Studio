// Common scenario inputs, not an operator quote or equipment offer.
export const FINANCIAL_DEFAULTS = Object.freeze({tariff:24, energyCost:12, discount:.12});
export const STATION_COSTS = Object.freeze({
  new_station:{capex:52,opex:4.2,lead:2,addPosts:6},
  expansion:{capex:35,opex:2,lead:1,addPosts:6},
  storage:{capex:17,opex:.55,lead:1}, grid_upgrade:{capex:62,opex:.8,lead:2},
  local_gen:{capex:14,opex:.3,lead:1}, defer:{capex:3.2,opex:.35,lead:0},
  pilot:{capex:9.5,opex:.7,lead:0,addPosts:2}, none:{capex:0,opex:0,lead:0},
});
export const PLANNING_DEFAULTS = Object.freeze({minimumScore:2,maxStationsPerStep:3,decisionYears:[2027,2030]});
