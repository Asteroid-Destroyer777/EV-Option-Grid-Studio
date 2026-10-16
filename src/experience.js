import {initTypography} from './ui/typography.js';
// Presentation-only motion. Model, form events and camera input remain independent.
const root = document.documentElement;
const media = matchMedia('(prefers-reduced-motion: reduce)');
let activeAnimations = new Set();
export const motion = { get enabled() { return !media.matches; } };

function animate(el, frames, options) {
  if (!motion.enabled || !el?.animate) return;
  const animation = el.animate(frames, options);
  activeAnimations.add(animation);
  const remove = () => activeAnimations.delete(animation);
  animation.addEventListener('finish', remove, {once:true});
  animation.addEventListener('cancel', remove, {once:true});
  return animation;
}
export { animate };

let revealObserver;
function reveal(el) {
  el.classList.add('is-revealed');
  if (el.dataset.reveal === 'lines') {
    [...el.children].forEach((line, i) => animate(line, [
      {transform:'translateY(70px)', clipPath:'inset(0 0 100%)'},
      {transform:'translateY(0)', clipPath:'inset(0)'}
    ], {duration:1050, delay:i*105, fill:'backwards', easing:'cubic-bezier(.22,1,.36,1)'}));
  } else animate(el, [{opacity:0,transform:'translateY(40px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}], {duration:850,easing:'cubic-bezier(.22,1,.36,1)'});
}
function syncMotion() {
  root.classList.toggle('motion-off', !motion.enabled);
  if (!motion.enabled) {
    for (const a of activeAnimations) a.cancel();
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-revealed'));
  }
  document.querySelectorAll('.ev-motion-toggle').forEach(b => {
    b.textContent = motion.enabled ? 'Анимации: вкл' : 'Анимации: выкл';
    b.setAttribute('aria-pressed', String(!motion.enabled));
    b.title = media.matches ? 'Уменьшение движения включено в настройках системы' : 'Уменьшить движение';
  });
  document.dispatchEvent(new CustomEvent('ev-motion-change', {detail:{enabled:motion.enabled}}));
}
syncMotion();
media.addEventListener('change', syncMotion);

function init() {
  initTypography();
  const steps = [...document.querySelectorAll('.steps span')], result = document.querySelector('#results'), load = document.querySelector('#load');
  if (steps.length && result && load) {
    const updateSteps = () => {
      const index = !result.hidden ? 2 : load.disabled ? 0 : 1;
      steps.forEach((el,i) => { el.classList.toggle('on',i===index); if(i===index)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current'); });
    };
    const progressObserver = new MutationObserver(updateSteps);
    progressObserver.observe(result,{attributes:true,attributeFilter:['hidden']});
    progressObserver.observe(load,{attributes:true,attributeFilter:['disabled']});
    updateSteps();
  }
  if ('IntersectionObserver' in window && motion.enabled) {
    root.classList.add('motion-ready');
    revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { reveal(entry.target); revealObserver.unobserve(entry.target); }
    }, {threshold:.12, rootMargin:'0px 0px -30px 0px'});
    document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));
  }
  // Only animate the existing panels when their own content is replaced.
  // Never observe map labels or the constantly updated decision chain.
  for (const el of document.querySelectorAll('#sheet,#panel,#results')) {
    let pending;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (!el.hidden && motion.enabled && !el.closest('#app.demoing')) animate(el, [{opacity:.4,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}], {duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
      });
    });
    observer.observe(el, {childList:true});
  }
  let curtain = document.querySelector('.page-curtain');
  if (!curtain) { curtain = document.createElement('div'); curtain.className = 'page-curtain'; curtain.setAttribute('aria-hidden','true'); curtain.textContent = 'EV—OPTION GRID'; document.body.append(curtain); }
  let leaving = false;
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.download || (link.target && link.target !== '_self') || !motion.enabled) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('.html') || url.pathname === location.pathname) return;
    if (leaving) { e.preventDefault(); return; }
    e.preventDefault(); leaving = true; curtain.classList.add('is-leaving');
    try { sessionStorage.setItem('ev-page-transition',url.pathname); } catch {}
    const a = animate(curtain, [{transform:'translateY(101%)'},{transform:'translateY(0)'}], {duration:380,fill:'forwards',easing:'cubic-bezier(.7,0,.2,1)'});
    let navigated = false;
    const navigate = () => { if (!navigated) { navigated = true; location.assign(url.href); } };
    a?.finished.then(navigate).catch(navigate);
    setTimeout(navigate, 450); // Never let a cancelled animation trap navigation.
  });
  let enter = false;
  try { enter = sessionStorage.getItem('ev-page-transition') === location.pathname; sessionStorage.removeItem('ev-page-transition'); } catch {}
  const onPageShow = e => {
    leaving = false; curtain.getAnimations().forEach(a => a.cancel()); curtain.classList.remove('is-leaving');
    if (!e.persisted && enter && motion.enabled) animate(curtain,[{transform:'translateY(0)'},{transform:'translateY(-101%)'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'});
    enter = false;
  };
  window.addEventListener('pageshow', onPageShow);
  if (document.readyState === 'complete') onPageShow({persisted:false});
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  for (const el of document.querySelectorAll('[data-magnetic],[data-tilt]')) {
    let frame;
    el.addEventListener('pointermove', e => {
      if (!fine.matches || !motion.enabled) return;
      const rect = el.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width - .5, y = (e.clientY - rect.top) / rect.height - .5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (el.hasAttribute('data-tilt')) { el.style.setProperty('--tilt-x', x*18+'px'); el.style.setProperty('--tilt-y', y*12+'px'); }
        else el.style.transform = `translate3d(${x*8}px,${y*6}px,0)`;
      });
    });
    const reset = () => { cancelAnimationFrame(frame); el.style.transform = ''; el.style.removeProperty('--tilt-x'); el.style.removeProperty('--tilt-y'); };
    el.addEventListener('pointerleave', reset); document.addEventListener('ev-motion-change', reset);
  }
}
// 3D chrome is generated after boot; observe its arrival once.
if (document.querySelector('#rail') && !document.querySelector('#rail .brand')) {
  const observer = new MutationObserver(() => { if (document.querySelector('#rail .brand')) { observer.disconnect(); init(); } });
  observer.observe(document.querySelector('#rail'), {childList:true});
} else init();
