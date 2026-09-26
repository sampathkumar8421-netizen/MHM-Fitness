/**
 * counters.js — counts the three numbers in the Standard chapter up from zero, once,
 * the first time they are read. Reduced motion gets the final value immediately.
 */
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export function initCounters({ motionOK }) {
  const counters = Array.from(document.querySelectorAll('[data-count-to]'));
  if (counters.length === 0) return { destroy() {} };

  const write = (element, value) => {
    const decimals = Number(element.dataset.countDecimals ?? 0);
    const suffix = element.dataset.countSuffix ?? '';
    const text = value.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    element.textContent = `${text}${suffix}`;
  };

  const run = (element) => {
    const target = Number(element.dataset.countTo ?? 0);
    if (!motionOK) {
      write(element, target);
      return;
    }

    const duration = 1100;
    let start = null;

    const step = (now) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / duration);
      write(element, Math.round(target * easeOutCubic(progress)));
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.6 },
  );

  counters.forEach((element) => observer.observe(element));
  return { destroy: () => observer.disconnect() };
}
