/**
 * Portfolio sections: which part of the page the navigation marks as current,
 * whether scroll-linked reveals may run, and the copy-email control.
 * Everything works without this module; it only adds state and conveniences.
 * Reveals themselves are CSS scroll-driven animations (see css/sections.css),
 * so they track native or smooth-scrolled position without any wiring.
 */

/** Section id -> the navigation link that represents it. */
export const NAV_TARGETS = Object.freeze({
  work: "work",
  "more-work": "work",
  experience: "experience",
  education: "experience",
  about: "about",
  skills: "skills",
  contact: "contact",
});

export function navTargetFor(sectionId) {
  return Object.hasOwn(NAV_TARGETS, sectionId) ? NAV_TARGETS[sectionId] : null;
}

/**
 * The site-wide motion setting (html[data-motion], owned by app.js) wins;
 * without it, the operating-system preference decides.
 */
export function motionAllowed(root, reduceQuery) {
  const setting = root?.dataset?.motion;
  if (setting === "full") return true;
  if (setting === "reduced") return false;
  return !reduceQuery?.matches;
}

export async function copyText(clipboard, text) {
  try {
    if (typeof clipboard?.writeText !== "function") return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function emailFromHref(href) {
  const match = /^mailto:([^?]+)/i.exec(String(href ?? ""));
  return match ? decodeURIComponent(match[1]) : null;
}

export function initMotionGate(doc = document, win = window) {
  const root = doc.documentElement;
  const reduce = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  const apply = () => root.toggleAttribute("data-sections-motion", motionAllowed(root, reduce));
  win.addEventListener?.("portfolio:motionchange", apply);
  reduce?.addEventListener?.("change", apply);
  apply();
  return { apply };
}

export function initNavState(doc = document, win = window) {
  if (typeof win.IntersectionObserver !== "function") return null;
  const links = new Map(
    [...doc.querySelectorAll('.site-nav a[href^="#"]')].map((link) => [link.hash.slice(1), link]),
  );
  const watched = Object.keys(NAV_TARGETS)
    .map((id) => doc.getElementById(id))
    .filter(Boolean);
  const footer = doc.querySelector(".site-footer");
  if (footer) watched.push(footer);
  if (!links.size || !watched.length) return null;

  const visible = new Set();
  let current = null;
  const targetOf = (element) => (element === footer ? "contact" : navTargetFor(element.id));

  function render() {
    // The first watched element (in page order) crossing the reading line wins.
    const active = watched.find((element) => visible.has(element));
    const next = active ? targetOf(active) : null;
    if (next === current) return;
    current = next;
    for (const [target, link] of links) {
      if (target === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  // A thin reading line a little above the middle of the viewport.
  const observer = new win.IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    render();
  }, { rootMargin: "-42% 0px -56% 0px", threshold: 0 });
  watched.forEach((element) => observer.observe(element));
  return { current: () => current, disconnect: () => observer.disconnect() };
}

export function initCopyEmail(doc = document, win = window) {
  const button = doc.querySelector("[data-copy-email]");
  const status = doc.querySelector("[data-copy-status]");
  const link = doc.querySelector("[data-email]");
  const address = emailFromHref(link?.getAttribute("href"));
  if (!button || !status || !link || !address) return null;
  button.hidden = false;
  let timer = 0;

  async function copy() {
    let clipboard;
    try { clipboard = win.navigator?.clipboard; } catch { /* Fall through to manual copy. */ }
    const copied = await copyText(clipboard, address);
    win.clearTimeout?.(timer);
    button.classList.toggle("is-done", copied);
    if (copied) {
      status.textContent = "Copied. Paste it into any email app.";
      timer = win.setTimeout?.(() => button.classList.remove("is-done"), 2400) ?? 0;
    } else {
      // Select the address so a keyboard shortcut finishes the job.
      try {
        const range = doc.createRange();
        range.selectNodeContents(link);
        const selection = win.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch { /* The address is still visible and readable. */ }
      status.textContent = "Couldn’t copy automatically. The address is selected, so press Ctrl+C or ⌘C.";
    }
    return copied;
  }

  button.addEventListener("click", copy);
  return { copy, address };
}

export function initSections(doc = document, win = window) {
  return {
    motion: initMotionGate(doc, win),
    nav: initNavState(doc, win),
    email: initCopyEmail(doc, win),
  };
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initSections(), { once: true });
  } else {
    initSections();
  }
}
