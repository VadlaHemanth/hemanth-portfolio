/**
 * DOM layers that ride on the journey: the hero copy, passing thoughts, the
 * three project cards and the closing line. Everything is driven by the same
 * state as the camera, so text and picture can never drift apart.
 */
import {THOUGHTS, smoothstep, easeInOut} from "./timeline.js?v=20261016-v3b";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Card order on screen: left, centre (Attendance ERP), right. */
export const CARD_ORDER = ["satellite", "attendance", "memory"];

/**
 * Card placement in CSS px for a viewport and focus amount.
 * Each card: {x, y, w, h, zoom, rotate, opacity, z}; (x, y) is the top-left of
 * the zoomed box on screen and (w, h) its unzoomed layout size.
 */
export function layoutCards(width, height, focus = 0, hold = 0) {
  const compact = width < 720 || width / height < 0.8;
  const f = easeInOut(focus);
  const breathe = 1 + 0.015 * Math.sin(hold * Math.PI);
  const place = (cx, cy, w, h, zoom, rotate, opacity, z) => ({x: cx - (w * zoom) / 2, y: cy - (h * zoom) / 2, w, h, zoom, rotate, opacity, z});
  if (!compact) {
    const cw = clamp(Math.min(width * 0.25, height * 0.5), 250, 400);
    const ch = cw * 0.92;
    const leadH = cw * 1.06;
    const gap = Math.max(26, width * 0.026);
    const cy = height * 0.6;
    const lead = (1 + f * (Math.min(1.5, (height * 0.7) / leadH) - 1)) * breathe;
    const sideZoom = 0.86;
    const spread = 1 + f * 0.6;
    const cx = width / 2;
    const offset = ((cw * lead) / 2 + gap + (cw * sideZoom) / 2) * spread;
    const sideOpacity = 1 - 0.7 * f;
    const cards = [
      place(cx - offset, cy + 6, cw, ch, sideZoom, 16, sideOpacity, 1),
      place(cx, cy - f * height * 0.04, cw, leadH, lead, 0, 1, 2),
      place(cx + offset, cy + 6, cw, ch, sideZoom, -16, sideOpacity, 1),
    ];
    const top = cards[1].y;
    return {compact, cards, title: {x: cx, y: Math.max(height * 0.2 + 40, top - height * 0.05), opacity: 1 - f}};
  }
  // Phones and narrow tablets: the ERP card leads, the other two sit below it.
  const pad = Math.max(16, width * 0.05);
  const cw = width - pad * 2;
  const ch = Math.min(cw * 0.86, height * 0.4);
  const cy = height * 0.46;
  const lead = (1 + f * 0.04) * breathe;
  const sw = (cw - pad * 0.6) / 2;
  const sh = Math.min(sw * 0.8, height * 0.19);
  const sy = cy + (ch * lead) / 2 + pad * 0.6 + sh / 2 + f * height * 0.1;
  const sideOpacity = 1 - 0.9 * f;
  const cards = [
    place(pad + sw / 2, sy, sw, sh, 1, 0, sideOpacity, 1),
    place(width / 2, cy, cw, ch, lead, 0, 1, 2),
    place(width - pad - sw / 2, sy, sw, sh, 1, 0, sideOpacity, 1),
  ];
  return {compact, cards, title: {x: width / 2, y: Math.max(height * 0.16 + 30, cards[1].y - height * 0.035), opacity: 1 - f}};
}

export class Overlays {
  constructor(root) {
    this.root = root;
    this.hero = root.querySelector("[data-j='hero']");
    this.thought = root.querySelector("[data-j='thought']");
    this.cardsBox = root.querySelector("[data-j='cards']");
    this.cardsTitle = root.querySelector("[data-j='cards-title']");
    this.cards = CARD_ORDER.map((id) => root.querySelector(`[data-card='${id}']`));
    this.final = root.querySelector("[data-j='final']");
    this.progress = root.querySelector("[data-j='progress']");
    this.cache = new Map();
    this.lastThought = -1;
  }

  set(el, prop, value) {
    if (!el) return;
    const key = el;
    let entry = this.cache.get(key);
    if (!entry) this.cache.set(key, (entry = {}));
    if (entry[prop] === value) return;
    entry[prop] = value;
    if (prop.startsWith("--")) el.style.setProperty(prop, value);
    else el.style[prop] = value;
  }

  visible(el, on) {
    if (!el) return;
    const entry = this.cache.get(el) || {};
    if (entry.visible === on) return;
    entry.visible = on;
    this.cache.set(el, entry);
    el.toggleAttribute("data-hidden", !on);
    el.inert = !on;
  }

  update(state, view, extras) {
    const {width, height} = view;
    // Hero copy lifts away as the dive begins.
    const hero = state.hero;
    this.visible(this.hero, hero > 0.01);
    this.set(this.hero, "opacity", hero.toFixed(3));
    this.set(this.hero, "transform", `translate3d(0, ${(-(1 - hero) * height * 0.06).toFixed(1)}px, 0)`);
    this.set(this.hero, "--squeeze", (1 - hero).toFixed(3));

    // Thoughts flash beside the travelling signal for a fraction of a second.
    if (state.thought >= 0 && state.thoughtLevel > 0) {
      if (this.lastThought !== state.thought) {
        this.thought.textContent = THOUGHTS[state.thought].word;
        this.lastThought = state.thought;
      }
      const level = smoothstep(0, 0.55, state.thoughtLevel);
      const sig = extras.signalScreen;
      const side = state.thought % 2 ? -1 : 1;
      const x = sig[0] + side * Math.min(width, height) * 0.06;
      const y = sig[1] - Math.min(width, height) * 0.05;
      this.visible(this.thought, true);
      this.set(this.thought, "opacity", level.toFixed(3));
      this.set(this.thought, "transform", `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.86 + 0.3 * (1 - state.thoughtLevel)).toFixed(3)})`);
      this.set(this.thought, "filter", `blur(${((1 - level) * 3).toFixed(2)}px)`);
    } else {
      this.visible(this.thought, false);
      this.set(this.thought, "opacity", "0");
    }

    // Project cards assemble from the fragments, come into reading distance, then dissolve.
    const reveal = smoothstep(0.55, 0.95, state.assemble) * (1 - smoothstep(0.0, 0.3, state.collapse));
    const cardsOn = reveal > 0.001;
    this.visible(this.cardsBox, cardsOn);
    if (cardsOn) {
      const layout = extras.cardLayout;
      layout.cards.forEach((r, i) => {
        const el = this.cards[i];
        if (!el) return;
        const scan = clamp((reveal - i * 0.06) / 0.82);
        this.set(el, "width", `${r.w.toFixed(1)}px`);
        this.set(el, "height", `${r.h.toFixed(1)}px`);
        const cx = r.x + (r.w * r.zoom) / 2;
        const cy = r.y + (r.h * r.zoom) / 2;
        this.set(el, "transform", `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, ${r.z * 10}px) rotateY(${r.rotate}deg) scale(${r.zoom.toFixed(4)}) translate(-50%, -50%)`);
        this.set(el, "opacity", (r.opacity * smoothstep(0, 0.35, scan)).toFixed(3));
        this.set(el, "--scan", `${((1 - scan) * 100).toFixed(2)}%`);
        this.set(el, "--focus", i === 1 ? easeInOut(state.focus).toFixed(3) : "0");
      });
      const title = layout.title;
      this.set(this.cardsTitle, "transform", `translate3d(${title.x.toFixed(1)}px, ${title.y.toFixed(1)}px, 0) translate(-50%, -100%)`);
      this.set(this.cardsTitle, "opacity", (state.cardsTitle * title.opacity).toFixed(3));
    }

    // The closing line lands as the camera settles back on the face.
    const fin = state.final;
    this.visible(this.final, fin > 0.01);
    this.set(this.final, "opacity", fin.toFixed(3));
    this.set(this.final, "transform", `translate3d(0, ${((1 - fin) * height * 0.035).toFixed(1)}px, 0)`);

    if (this.progress) this.set(this.progress, "transform", `scaleX(${state.progress.toFixed(4)})`);
  }
}
