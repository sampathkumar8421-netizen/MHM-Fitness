/**
 * magnetic.js — a few pixels of pull on the primary buttons when a fine pointer is
 * nearby. Disabled for touch and for reduced motion: it is a garnish, never a
 * requirement for hitting the target.
 */
export function initMagnetic({ motionOK, strength = 14 }) {
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (!motionOK || !finePointer) return { destroy() {} };

  const elements = Array.from(document.querySelectorAll('[data-magnetic]'));
  const cleanups = [];

  for (const element of elements) {
    const move = (event) => {
      const rect = element.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      element.style.setProperty('--mx', `${dx * strength}px`);
      element.style.setProperty('--my', `${dy * strength * 0.6}px`);
    };

    const reset = () => {
      element.style.setProperty('--mx', '0px');
      element.style.setProperty('--my', '0px');
    };

    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', reset);
    cleanups.push(() => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', reset);
    });
  }

  return {
    destroy() {
      cleanups.forEach((fn) => fn());
    },
  };
}
