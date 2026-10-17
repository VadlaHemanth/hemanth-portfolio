/**
 * A worker thread that draws a band of rows of the CPU passage (see cpu-tunnel.js).
 * Lookup tables for a new canvas size are built in slices between frames, so the
 * passage keeps moving while a sharper or lighter size is prepared.
 */
import {TunnelLut, outlineTable, shade} from "./cpu-tunnel.js?v=20261017-v3c";

let texN = null;
let texC = null;
const luts = new Map();
const queue = [];
let building = false;

function buildSlice() {
  // Tables for sizes that were dropped meanwhile are not worth finishing.
  while (queue.length && !luts.has(queue[0].key)) queue.shift();
  const lut = queue[0];
  if (!lut) {
    building = false;
    return;
  }
  if (lut.build(performance.now() + 8)) {
    queue.shift();
    self.postMessage({type: "lut", key: lut.key});
  }
  setTimeout(buildSlice, 0);
}

self.onmessage = ({data: m}) => {
  if (m.type === "textures") {
    if (m.neural) texN = m.neural;
    if (m.circuit) texC = m.circuit;
  } else if (m.type === "lut") {
    if (luts.has(m.key)) {
      self.postMessage({type: "lut", key: m.key});
      return;
    }
    const lut = new TunnelLut(m.spec);
    lut.key = m.key;
    luts.set(m.key, lut);
    // Keep the newest few sizes; older ones are dropped with their memory.
    for (const key of [...luts.keys()].slice(0, -3)) luts.delete(key);
    queue.push(lut);
    if (!building) {
      building = true;
      setTimeout(buildSlice, 0);
    }
  } else if (m.type === "drop") {
    luts.delete(m.key);
  } else if (m.type === "retain") {
    for (const key of [...luts.keys()]) if (!m.keys.includes(key)) luts.delete(key);
  } else if (m.type === "frame") {
    const lut = luts.get(m.key);
    const out = new Uint32Array(m.buffer);
    if (!lut || !lut.done || !texN) {
      self.postMessage({type: "frame", id: m.id, missing: true, buffer: m.buffer}, [m.buffer]);
      return;
    }
    const win = m.win ? {radius: m.win.radius, table: outlineTable(m.win.shape)} : null;
    shade(out, lut, m.k, texN, texC || texN, m.rx0, m.ry0, m.rx1, m.ry1, m.ox, m.oy, win);
    self.postMessage({type: "frame", id: m.id, buffer: m.buffer, rx0: m.rx0, ry0: m.ry0, rx1: m.rx1, ry1: m.ry1}, [m.buffer]);
  }
};
