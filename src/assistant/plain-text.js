// The chat displays textContent, so keep mathematical notation readable as text.
export function plainAnswer(text) {
  return text.replace(/^(?:Привет|Здравствуйте|Добрый (?:день|вечер|утро))[!.,\s]+/iu,'')
    .replace(/\$\$?/g,'').replace(/\\[()[\]]/g,'')
    .replace(/\\rho\b/g,'ρ').replace(/\\Delta\b/g,'Δ').replace(/\\times\b/g,'×').replace(/\\(?:leq|le)\b/g,'≤').replace(/\\(?:geq|ge)\b/g,'≥')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,'($1)/($2)')
    .replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g,'$1').trim();
}
