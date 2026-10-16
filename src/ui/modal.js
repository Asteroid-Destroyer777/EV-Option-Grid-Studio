import { setNavigationOpen } from './navigation.js';
let active = false, returnFocus;
const background = () => [...document.querySelectorAll('#stage, #ui > :not(#sheet):not(#toast), #beaver-launch')];
const focusable = el => [...el.querySelectorAll('button:not(:disabled), a[href], input, textarea, select, summary, [tabindex="0"]')].filter(n => n.getClientRects().length && !n.closest('[hidden], [inert], details:not([open]) :not(summary)'));

export function syncSheetModal(el, close) {
  if (el.hidden) {
    if (!active) return;
    active = false;
    background().forEach(n => { n.inert = false; });
    setNavigationOpen(false, {restore: false});
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus();
    else document.getElementById('nav-toggle')?.focus();
    return;
  }
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('tabindex', '-1');
  const heading = el.querySelector('h1');
  if (heading) { heading.id = 'sheet-title'; el.setAttribute('aria-labelledby', 'sheet-title'); }
  if (!active) {
    returnFocus = document.activeElement;
    setNavigationOpen(false, {restore: false});
    active = true;
    // Фокус переносится до inert, чтобы не скрывать текущий фокус от AT.
    el.focus({preventScroll: true});
    background().forEach(n => { n.inert = true; });
  }
  if (!el.contains(document.activeElement)) el.focus({preventScroll: true});
  el.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const controls = focusable(el), first = controls[0], last = controls.at(-1);
    if (!controls.length) { e.preventDefault(); el.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === el)) { e.preventDefault(); first.focus(); }
  };
}
