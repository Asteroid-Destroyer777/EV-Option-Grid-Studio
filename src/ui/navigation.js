const mobile = () => matchMedia('(max-width: 768px)').matches;
let open = false, previousFocus;
const $ = s => document.querySelector(s);

export function setNavigationOpen(value, {restore = true} = {}) {
  const rail = $('#rail'), toggle = $('#nav-toggle');
  if (!rail || !toggle) return;
  const wasOpen = open;
  open = value && mobile();
  document.getElementById('app').classList.toggle('nav-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Закрыть меню разделов' : 'Открыть меню разделов');
  $('#nav-backdrop').hidden = !open;
  rail.inert = mobile() && !open;
  if (open && !wasOpen) { previousFocus = document.activeElement; rail.querySelector('.nav button')?.focus(); }
  else if (wasOpen && restore) (previousFocus?.isConnected ? previousFocus : toggle).focus();
}

export function initNavigation() {
  $('#nav-toggle').addEventListener('click', () => setNavigationOpen(!open));
  $('#nav-backdrop').addEventListener('click', () => setNavigationOpen(false));
  $('#rail').addEventListener('click', e => {
    if (e.target.closest('button[data-act], a')) setNavigationOpen(false, {restore: false});
  });
  matchMedia('(max-width: 768px)').addEventListener('change', () => setNavigationOpen(false));
  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setNavigationOpen(false); }
    if (e.key === 'Tab') {
      const controls = [...$('#rail').querySelectorAll('button,a,summary')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }, true);
  setNavigationOpen(false);
}

export const navigationIsOpen = () => open;
