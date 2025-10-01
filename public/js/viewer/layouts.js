//this file handles various graph layout algorithms and node positioning strategies for the graph viewer

import { canvas } from './dom.js';
import { graph, scheduleDraw } from './state.js';


let sim = null;
// stop any running simulation
export function stopSim() {
  if (sim && typeof sim.stop === 'function') sim.stop();
  sim = null;
}

// keep a node's y locked to its current layer row (without changing its layer)
export function lockYToCurrentLayer(n) {
  const L = Math.max(1, Math.floor(n.layer) || 1);
  const y = yForLayer(L);
  n.y = y;
  n.fy = y;
}

// get current canvas size
function canvasSize() {
  const r = canvas.getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
}
// This function checks if all nodes in the graph have valid positions
export function allHavePositions() {
  return (graph.nodes || []).length > 0 &&
         (graph.nodes || []).every(n => Number.isFinite(n.x) && Number.isFinite(n.y));
}
// Pin all nodes to their current x/y (fix in place)
export function pinToCurrentXY() {
  for (const n of (graph.nodes || [])) {
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
      n.fx = n.x; n.fy = n.y;
    }
  }
}
// Zero out all node velocities (for force layout)
function zeroVelocities() {
  for (const n of (graph.nodes || [])) {
    n.vx = 0; n.vy = 0;
  }
}
// asign initial positon to nodes without x/y (in a circle)
export function seedPositions() {
  const { width, height } = canvasSize();
  const cx = width / 2, cy = height / 2;
  const N  = Math.max(1, (graph.nodes || []).length);
  const R  = Math.min(width, height) * 0.38; // bigger radius so nodes start apart

  (graph.nodes || []).forEach((n, i) => {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      const a = (i / N) * Math.PI * 2;
      n.x = cx + R * Math.cos(a);
      n.y = cy + R * Math.sin(a);
    }
  });
}


//apply the appropriate layout based on the graph type
export function applyLayoutForType() {
  stopSim();
  const t = graph.type || 'force';
  const hasSaved = allHavePositions();

  // If we already have positions, pin them so nothing moves unexpectedly
  if (hasSaved && t !== 'hierarchy') pinToCurrentXY();

  switch (t) {
    case 'force': {
      // NO simulation: if positions exist, keep them; else seed & pin.
      if (!hasSaved) {
        seedPositions();
        pinToCurrentXY();
      }
      zeroVelocities();
      scheduleDraw();
      break;
    }

    case 'circle': {
      if (!hasSaved) layoutCircle();
      scheduleDraw();
      break;
    }

    case 'grid': {
      if (!hasSaved) layoutGrid();
      scheduleDraw();
      break;
    }

    case 'hierarchy': {
      layoutHierarchy(); // respects n.layer and sets/pins rows
      scheduleDraw();
      break;
    }

    default:
      scheduleDraw();
  }
}

// apply the circle layout to position nodes in a circular arrangement
export function layoutCircle() {
  const { width, height } = canvasSize();
  const R = Math.min(width, height) * 0.4;
  const cx = width / 2, cy = height / 2;
  const N = Math.max(1, (graph.nodes || []).length);

  (graph.nodes || []).forEach((n, i) => {
    const a = (i / N) * Math.PI * 2;
    n.x = cx + R * Math.cos(a);
    n.y = cy + R * Math.sin(a);
    n.fx = n.x; n.fy = n.y;
  });
}

//arrange nodes in a grid layout
export function layoutGrid() {
  const { width, height } = canvasSize();
  const nodes = graph.nodes || [];
  const cols = Math.ceil(Math.sqrt(nodes.length || 1));
  const gap = 40;
  const startX = width/2  - (cols - 1) * gap / 2;
  const startY = height/2 - (cols - 1) * gap / 2;

  nodes.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    n.x = startX + c * gap;
    n.y = startY + r * gap;
    n.fx = n.x; n.fy = n.y;
  });
}

// arrage nodes in discrete horizontal layers (for hierarchy layout)
export let layerState = {
  enabled: false,
  startY: 40,
  gapY: 100,
  Lmax: 1,
  xGap: 60,
  sidePad: 40,
};
// ensure layerState is initialized (if not already) 
function ensureLayerState() {
  if (layerState.enabled) return;

  let Lmax = 1;
  for (const n of (graph.nodes || [])) {
    if (Number.isFinite(n.layer)) Lmax = Math.max(Lmax, Math.floor(n.layer));
  }

  const { width, height } = canvasSize();
  const TOP_PAD = 40, MIN_YGAP = 80, MAX_YGAP = 140;

  const rows = Math.max(1, Lmax);
  const availableH = Math.max(1, height - TOP_PAD*2);
  const gapY = Math.max(MIN_YGAP, Math.min(MAX_YGAP, rows > 1 ? (availableH / (rows - 1)) : availableH));

  layerState = {
    enabled: true,
    startY: TOP_PAD,
    gapY,
    Lmax: rows,
    xGap: 60,
    sidePad: 40,
  };
}
// get the y-coordinate for a given layer number
export function yForLayer(L) {
  ensureLayerState();
  return layerState.startY + (Math.max(1, Math.floor(L)) - 1) * layerState.gapY;
}
// snap a node to the nearest layer based on its current y-coordinate
export function snapNodeToNearestLayer(n) {
  ensureLayerState();
  const raw = 1 + Math.round((n.y - layerState.startY) / layerState.gapY);
  const L = Math.max(1, raw);
  if (L > layerState.Lmax) layerState.Lmax = L;
  n.layer = L;
  n.y = yForLayer(L);
 // n.fx = n.x; n.fy = n.y;
}
// snap a node to a specific layer number
export function snapNodeToLayer(n, L) {
  ensureLayerState();
  const Lint = Math.max(1, Math.floor(L));
  if (Lint > layerState.Lmax) layerState.Lmax = Lint;
  n.layer = Lint;
  n.y = yForLayer(Lint);
  //n.fx = n.x; n.fy = n.y;
}

// compute layers for all nodes based on edges (Kahn topological sort)
export function computeHierarchyLayers(nodes, links) {
  const idToNode = new Map(nodes.map(n => [n.id, n]));
  const out = new Map(nodes.map(n => [n.id, []]));
  const indeg = new Map(nodes.map(n => [n.id, 0]));
  const preds = new Map(nodes.map(n => [n.id, []]));

  for (const e of (links || [])) {
    const s = (typeof e.source === 'object') ? e.source?.id : e.source;
    const t = (typeof e.target === 'object') ? e.target?.id : e.target;
    if (!idToNode.has(s) || !idToNode.has(t)) continue;
    out.get(s).push(t);
    indeg.set(t, (indeg.get(t) || 0) + 1);
    preds.get(t).push(s);
    // ensure keys initialized
    if (!out.has(t)) out.set(t, out.get(t) || []);
    if (!preds.has(s)) preds.set(s, preds.get(s) || []);
  }

  const layer = new Map();
  const q = [];

  // indegree-0 nodes start at layer 1
  for (const [id, deg] of indeg) {
    if (deg === 0) { layer.set(id, 1); q.push(id); }
  }
  // isolated nodes → layer 1
  for (const n of nodes) {
    if (!indeg.has(n.id)) {
      layer.set(n.id, 1);
      q.push(n.id);
      indeg.set(n.id, 0);
      if (!out.has(n.id))  out.set(n.id, []);
      if (!preds.has(n.id)) preds.set(n.id, []);
    }
  }

  // Kahn propagation
  while (q.length) {
    const u = q.shift();
    const L = layer.get(u) || 1;
    for (const v of out.get(u) || []) {
      layer.set(v, Math.max(layer.get(v) || 1, L + 1));
      indeg.set(v, (indeg.get(v) || 0) - 1);
      if (indeg.get(v) === 0) q.push(v);
    }
  }

  // cycles: place just below max predecessor layer
  for (const n of nodes) {
    if (!layer.has(n.id)) {
      const ps = preds.get(n.id) || [];
      let maxPred = 0;
      for (const p of ps) maxPred = Math.max(maxPred, layer.get(p) || 0);
      layer.set(n.id, Math.max(1, maxPred + 1));
    }
  }

  // write back integer layers
  for (const n of nodes) {
    n.layer = Math.max(1, Math.floor(layer.get(n.id) || 1));
  }
}

// arrange nodes in a hierarchical layout based on their assigned layers
export function layoutHierarchy() {
  const nodes = graph.nodes || [];
  const links = graph.links || [];

  
  const needs = nodes.some(n => !Number.isFinite(n.layer));
  if (needs) computeHierarchyLayers(nodes, links);

  const { width, height } = canvasSize();
  const TOP_PAD = 40, MIN_YGAP = 80, MAX_YGAP = 140, SIDE_PAD = 40, MIN_XGAP = 60;

  
  let Lmax = 1;
  for (const n of nodes) if (Number.isFinite(n.layer)) Lmax = Math.max(Lmax, Math.floor(n.layer));

  const rows = Math.max(1, Lmax);
  const availableH = Math.max(1, height - TOP_PAD*2);
  const gapY = Math.max(MIN_YGAP, Math.min(MAX_YGAP, rows > 1 ? (availableH / (rows - 1)) : availableH));
  const startY = TOP_PAD;

  
  layerState = { enabled: true, startY, gapY, Lmax: rows, xGap: MIN_XGAP, sidePad: SIDE_PAD };

  
  const buckets = new Map();
  for (const n of nodes) {
    const L = Math.max(1, Number.isFinite(n.layer) ? Math.floor(n.layer) : 1);
    if (!buckets.has(L)) buckets.set(L, []);
    buckets.get(L).push(n);
  }

  
  for (const [L, arr] of buckets) {
    arr.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' }));
    const count = arr.length || 1;
    const totalW = Math.max(0, (count - 1) * MIN_XGAP);
    const startX = Math.max(SIDE_PAD, (width - totalW) / 2);
    const y = startY + (L - 1) * gapY;

    arr.forEach((n, i) => {
      if (!Number.isFinite(n.x)) n.x = startX + i * MIN_XGAP;
      n.y = y;
      n.layer = L;
      //n.fx = n.x; n.fy = n.y;
    });
  }
}
