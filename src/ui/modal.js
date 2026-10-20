import { setNavigationOpen, navigationIsOpen } from './navigation.js';
let active = false, returnFocus, restoreBackground = [], closeSheet;
// A sheet replaces the map content; the project navigation remains available.
const background = () => [...document.querySelectorAll('#stage, #ui > :not(#sheet):not(#topbar):not(#toast):not(#rail):not(#nav-toggle):not(#nav-backdrop), #rail > :not(.nav), #beaver-launch')];
const onKey = e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  e.preventDefault(); e.stopPropagation(); closeSheet?.();
};

export function syncSheetModal(el, close) {
  if (el.hidden) {
    if (!active) return;
    active = false;
    const target = document.activeElement?.closest('#rail .nav button') || returnFocus;
    for (const {node, inert} of restoreBackground) node.inert = inert;
    restoreBackground = [];
    document.removeEventListener('keydown', onKey);
    document.querySelector('.skip-link')?.setAttribute('href', '#main');
    setNavigationOpen(false, {restore: false});
    if (target?.isConnected && !target.closest('[inert]')) target.focus();
    else document.getElementById('nav-toggle')?.focus();
    return;
  }
  el.setAttribute('role', 'region'); el.removeAttribute('aria-modal'); el.setAttribute('tabindex', '-1');
  document.querySelector('.skip-link')?.setAttribute('href', '#sheet');
  const heading = el.querySelector('h1');
  if (heading) { heading.id = 'sheet-title'; el.setAttribute('aria-labelledby', 'sheet-title'); }
  closeSheet = close;
  if (document.activeElement?.closest('#rail .nav button')) returnFocus = document.activeElement;
  if (!active) {
    returnFocus = document.activeElement;
    setNavigationOpen(false, {restore: false});
    active = true;
    // Фокус переносится до inert, чтобы не скрывать текущий фокус от AT.
    el.focus({preventScroll: true});
    restoreBackground = background().map(node => ({node, inert:node.inert}));
    restoreBackground.forEach(({node}) => { node.inert = true; });
    document.addEventListener('keydown', onKey);
  }
  if (!navigationIsOpen() && !el.contains(document.activeElement) && !document.getElementById('topbar')?.contains(document.activeElement)) el.focus({preventScroll: true});
}
