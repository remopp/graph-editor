//this module contains shortest path logic, the path-highlighting state used by the renderer,
//and simple centrality analytics (degree and pagerank)

import { graph, setSelection, scheduleDraw } from './state.js';

//this keeps track of which nodes/edges are currently highlighted (renderer reads this)
let _pathHighlight = { nodes: new Set(), edges: new Set() };
//this returns the current highlight sets (used by render.js to style path)
export function getPathHighlight() {
  const edgeIdxSet = new Set();
  if (_pathHighlight && _pathHighlight.edges && graph?.links) {
    for (let i = 0; i < graph.links.length; i++) {
      const e = graph.links[i];
      const sId = (typeof e.source === 'object') ? e.source.id : e.source;
      const tId = (typeof e.target === 'object') ? e.target.id : e.target;
      const key = `${sId}->${tId}`;
      if (_pathHighlight.edges.has(key)) {
        edgeIdxSet.add(i);
      }
    }
  }

  const nodeIdSet = _pathHighlight?.nodes || new Set();
  return {
    edges: edgeIdxSet,
    nodes: nodeIdSet,
  };
}

//this helper selects nodes in the ui and requests a redraw
function highlightNodes(ids) {
  try { setSelection(ids); scheduleDraw(); } catch {}
}

// this computes the shortest path using Dijkstra.
export function shortestPath(srcId, dstId, g = graph) {
  const nodes = g?.nodes || [];
  const links = g?.links || [];
  if (!srcId || !dstId) return { ok: false, msg: 'missing ids' };

  const id2idx = new Map(nodes.map((n, i) => [String(n.id), i]));
  const n = nodes.length;
  if (!id2idx.has(String(srcId)) || !id2idx.has(String(dstId))) {
    return { ok: false, msg: 'id not found' };
  }

  const adj = Array.from({ length: n }, () => []);
  for (const e of links) {
    // normalize source/target to ids
    const sId = (typeof e.source === 'object') ? e.source.id : e.source;
    const tId = (typeof e.target === 'object') ? e.target.id : e.target;

    const si = id2idx.get(String(sId));
    const ti = id2idx.get(String(tId));
    if (si == null || ti == null) continue;

    // edge weight is by default 1 if missing or bad
    const wNum = Number(e.weight);
    const w = Number.isFinite(wNum) ? wNum : 1;

    adj[si].push({ j: ti, w });
  }

  const src = id2idx.get(String(srcId));
  const dst = id2idx.get(String(dstId));

  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const used = new Array(n).fill(false);
  dist[src] = 0;

  for (let k = 0; k < n; k++) {
    // pick unused node with best dist
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!used[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;     // no reachable nodes left
    used[u] = true;
    if (u === dst) break;    // we reached target, we can stop early


    for (const { j, w } of adj[u]) {
      const step = Math.max(0, w);
      const nd = dist[u] + step;
      if (nd < dist[j]) {
        dist[j] = nd;
        prev[j] = u;
      }
    }
  }

  if (!Number.isFinite(dist[dst])) {
    return { ok: false, msg: 'no path' };
  }

  const order = [];
  for (let v = dst; v !== -1; v = prev[v]) {
    order.push(v);
  }
  order.reverse();

  const nodeIds = order.map(i => nodes[i].id);

  const edgeList = [];
  for (let k = 0; k < order.length - 1; k++) {
    const a = nodes[order[k]].id;
    const b = nodes[order[k + 1]].id;
    edgeList.push({ source: a, target: b });
  }

  _pathHighlight = {
    nodes: new Set(nodeIds),
    edges: new Set(edgeList.map(e => `${e.source}->${e.target}`)),
  };

  highlightNodes(nodeIds);

  return {
    ok: true,
    total: dist[dst],
    nodes: nodeIds,
    edges: edgeList
  };
}


//this clears the path highlight and ui selection
export function clearPathHighlight() {
  _pathHighlight.nodes.clear();
  _pathHighlight.edges.clear();
  try { setSelection([]); scheduleDraw(); } catch {}
}

//this computes degree centrality; mode = total or in or out. accepts an optional graph.
export function degreeCentrality(mode = 'total', g = graph) {
  const nodes = g?.nodes || [];
  const links = g?.links || [];
  const id2idx = new Map(nodes.map((n, i) => [n.id, i]));
  const degIn  = new Array(nodes.length).fill(0);
  const degOut = new Array(nodes.length).fill(0);

  for (const e of links) {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    const si = id2idx.get(String(s));
    const ti = id2idx.get(String(t));
    if (si == null || ti == null) continue;
    degOut[si] += 1;
    degIn[ti]  += 1;
  }

  return nodes.map((n, i) => {
    let score = 0;
    if (mode === 'in') score = degIn[i];
    else if (mode === 'out') score = degOut[i];
    else score = degIn[i] + degOut[i];
    return { id: n.id, score };
  });
}

//this computes pagerank with power-iteration; d in [0,1]. accepts an optional graph.
export function pageRank({ d = 0.85, maxIter = 50, tol = 1e-6 } = {}, g = graph) {
  const nodes = g?.nodes || [];
  const links = g?.links || [];
  const N = nodes.length;
  if (N === 0) return [];

  const id2idx = new Map(nodes.map((n, i) => [n.id, i]));
  const outNeighbors = Array.from({ length: N }, () => new Set());
  const outDegree = new Array(N).fill(0);

  for (const e of links) {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    const si = id2idx.get(String(s));
    const ti = id2idx.get(String(t));
    if (si == null || ti == null) continue;
    if (si === ti) continue; // ignore self loops
    if (!outNeighbors[si].has(ti)) {
      outNeighbors[si].add(ti);
      outDegree[si] += 1;
    }
  }

  let pr = new Array(N).fill(1 / N);
  let next = new Array(N).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let danglingSum = 0;
    for (let i = 0; i < N; i++) if (outDegree[i] === 0) danglingSum += pr[i];

    const base = (1 - d) / N;
    const danglingShare = d * danglingSum / N;
    next.fill(base + danglingShare);

    for (let i = 0; i < N; i++) {
      if (outDegree[i] === 0) continue;
      const share = d * pr[i] / outDegree[i];
      for (const j of outNeighbors[i]) next[j] += share;
    }

    let diff = 0;
    for (let i = 0; i < N; i++) diff += Math.abs(next[i] - pr[i]);
    pr = next.slice();
    if (diff < tol) break;
  }

  return nodes.map((n, i) => ({ id: n.id, score: pr[i] }));
}
