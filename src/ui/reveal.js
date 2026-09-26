/**
 * reveal.js — progressive enhancement for [data-reveal].
 *
 * Browsers with CSS scroll-driven animations animate these in CSS at zero JS cost.
 * Everyone else gets an IntersectionObserver — and only then do the elements start
 * hidden, because `.js-reveal` is the switch. No JavaScript, no hidden content.
 */

const SUPPORTS_VIEW_TIMELINE =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('animation-timeline: view()')
    : false;

export function initReveal({ motionOK }) {
  if (!motionOK || SUPPORTS_VIEW_TIMELINE) return { destroy() {} };

  document.documentElement.classList.add('js-reveal');

  const targets = Array.from(document.querySelectorAll('[data-reveal]'));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
  );

  targets.forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${(index % 4) * 70}ms`);
    observer.observe(element);
  });

  return { destroy: () => observer.disconnect() };
}
