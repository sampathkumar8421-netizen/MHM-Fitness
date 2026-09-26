/**
 * nav.js — topbar state, the mobile menu, and the current-chapter marker.
 *
 * Keyboard first: Escape closes, the button is a real button. On a phone the panel
 * is modal in behaviour (not just looks): the page behind it is scroll-locked and
 * inert, so a thumb-scroll cannot move the document under the panel and Tab/AT
 * cannot wander into content the user cannot see.
 */
export function initNav({ rig }) {
  const root = document.documentElement;
  const nav = document.getElementById('nav');
  const toggle = document.querySelector('[data-menu]');
  const inertTargets = [document.getElementById('main'), document.querySelector('.foot'), document.querySelector('.skip')].filter(Boolean);
  const links = nav ? Array.from(nav.querySelectorAll('a[href^="#"]')) : [];
  const topbarLinks = Array.from(document.querySelectorAll('[data-topbar] a[href^="#"]'));
  const byIndex = new Map(
    Array.from(document.querySelectorAll('[data-section][id]'), (element) => [
      Number(element.dataset.section),
      element.id,
    ]),
  );

  let open = false;
  let lockY = 0;

  /** Everything Tab is allowed to reach while the panel is open, in DOM order. */
  function panelFocusables() {
    if (!nav) return [];
    return [toggle, ...nav.querySelectorAll('a[href], button:not([disabled])')]
      .filter(Boolean)
      .filter((element, index, all) => all.indexOf(element) === index)
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
      });
  }

  /* iOS Safari ignores `body { overflow: hidden }`; pinning the body and restoring
     the offset is the lock that works on both engines. */
  function lockPage() {
    lockY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }

  function unlockPage() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    if (window.scrollY !== lockY) window.scrollTo(0, lockY);
  }

  function setInert(modal) {
    for (const element of inertTargets) {
      if ('inert' in element) element.inert = modal;
    }
  }

  function setOpen(next, { restoreFocus = true } = {}) {
    next = Boolean(next);
    if (next === open) return;
    open = next;
    root.classList.toggle('menu-open', open);
    toggle?.setAttribute('aria-expanded', String(open));

    if (open) {
      lockPage();
      setInert(true);
      /* move focus into the panel rather than leaving it on the toggle */
      requestAnimationFrame(() => panelFocusables()[1]?.focus());
    } else {
      const wasInside = Boolean(document.activeElement && nav?.contains(document.activeElement));
      unlockPage();
      setInert(false);
      if (restoreFocus && wasInside) toggle?.focus();
    }
  }

  const onToggle = () => setOpen(!open);

  const onKeydown = (event) => {
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;
    const items = panelFocusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onLinkClick = () => {
    if (open) setOpen(false, { restoreFocus: false });
  };

  const onScroll = () => {
    root.classList.toggle('is-scrolled', window.scrollY > 40);
  };

  const onDesktop = (event) => {
    if (event.matches && open) setOpen(false);
  };

  toggle?.addEventListener('click', onToggle);
  links.forEach((link) => link.addEventListener('click', onLinkClick));
  topbarLinks.forEach((link) => link.addEventListener('click', onLinkClick));
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', onScroll, { passive: true });
  const wideQuery = window.matchMedia('(min-width: 60rem)');
  wideQuery.addEventListener('change', onDesktop);
  onScroll();

  const unsubscribe = rig.onSection((index) => {
    const id = byIndex.get(index);
    links.forEach((link) => {
      const target = link.getAttribute('href').slice(1);
      if (target === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  });

  return {
    destroy() {
      toggle?.removeEventListener('click', onToggle);
      links.forEach((link) => link.removeEventListener('click', onLinkClick));
      topbarLinks.forEach((link) => link.removeEventListener('click', onLinkClick));
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('scroll', onScroll);
      wideQuery.removeEventListener('change', onDesktop);
      unsubscribe();
      if (open) setOpen(false, { restoreFocus: false });
      setInert(false);
    },
  };
}
