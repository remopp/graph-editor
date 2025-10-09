//this file is for analytics functions like shortest path
import { graph, scheduleDraw } from './state.js';

let highlightedPath = { nodes: new Set(), edges: new Set(), total: 0 };

//this variable controls whether shortest path treats edges as undirected (true) or directed (false)
export let pathTreatEdgesAsUndirected = false;

//this function lets you change the direction mode from other modules if needed
export function setPathUndirected(v) {
  pathTreatEdgesAsUndirected = !!v;
}

//this function clears any current shortest-path highlight and schedules a redraw
export function clearPathHighlight() {
  highlightedPath = { nodes: new Set(), edges: new Set(), total: 0 };
  scheduleDraw();
}

//this function returns the current shortest-path highlight (edge indices, node ids, and total weight)
export function getPathHighlight() {
  return highlightedPath;
}

//this function computes the shortest path using Dijkstra with edge.weight or 1 if missing
//this analytic is only available for the force-directed graph type
//this returns { ok:boolean, edges?:Array<number>, nodes?:Array<string>, total?:number, msg?:string }
export function shortestPath(srcId, dstId) {
  //this guards the feature so it only runs for the force-directed type
  if (graph.type !== 'force') {
    return { ok:false, msg:'Shortest path is only available for the force-directed graph type.' };
  }

  if (!srcId || !dstId) return { ok:false, msg:'Source and target are required.' };
  if (srcId === dstId) {
    highlightedPath = { nodes: new Set([srcId]), edges: new Set(), total: 0 };
    scheduleDraw();
    return { ok:true, edges:[], nodes:[srcId], total:0 };
  }

  const nodes = graph.nodes || [];
  const links = graph.links || [];
  const id2idx = new Map(nodes.map((n,i) => [n.id, i]));
  if (!id2idx.has(srcId) || !id2idx.has(dstId)) {
    return { ok:false, msg:'One or both node IDs do not exist.' };
  }

  //this builds an adjacency list; if pathTreatEdgesAsUndirected is true, edges are added both ways
  const adj = new Map();
  for (let i = 0; i < nodes.length; i++) adj.set(nodes[i].id, []);

  links.forEach((e, idx) => {
    const s = (typeof e.source === 'object') ? e.source?.id : e.source;
    const t = (typeof e.target === 'object') ? e.target?.id : e.target;
    if (!adj.has(s) || !adj.has(t)) return;
    const w = Number.isFinite(e.weight) ? e.weight : 1;

    // directed edge s -> t
    adj.get(s).push({ to: t, w, edgeIndex: idx });

    // optional reverse edge t -> s (only when treating as undirected)
    if (pathTreatEdgesAsUndirected) {
      adj.get(t).push({ to: s, w, edgeIndex: idx });
    }
  });

  //this initializes Dijkstra structures
  const dist = new Map(nodes.map(n => [n.id, Infinity]));
  const prev = new Map(); // id -> { id, edgeIndex }
  dist.set(srcId, 0);

  //this is a simple priority queue using sorting (fine for hundreds/thousands of nodes)
  const pq = [{ id: srcId, d: 0 }];

  while (pq.length) {
    pq.sort((a,b) => a.d - b.d); //this extracts the smallest distance
    const { id: u, d } = pq.shift();
    if (d !== dist.get(u)) continue;
    if (u === dstId) break;

    const edges = adj.get(u);
    if (!edges) continue;

    for (const { to: v, w, edgeIndex } of edges) {
      const nd = d + w;
      if (nd < dist.get(v)) {
        dist.set(v, nd);
        prev.set(v, { id: u, edgeIndex });
        pq.push({ id: v, d: nd });
      }
    }
  }

  if (!isFinite(dist.get(dstId))) {
    return { ok:false, msg:'No path found between the selected nodes.' };
  }

  //this reconstructs the path from dstId back to srcId and collects edge indices
  const pathNodes = [];
  const pathEdges = [];
  let cur = dstId;
  while (cur !== undefined && cur !== srcId) {
    pathNodes.push(cur);
    const p = prev.get(cur);
    if (!p) break;
    pathEdges.push(p.edgeIndex);
    cur = p.id;
  }
  pathNodes.push(srcId);
  pathNodes.reverse();
  pathEdges.reverse();

  //this saves the highlight state and triggers a redraw
  highlightedPath = {
    nodes: new Set(pathNodes),
    edges: new Set(pathEdges),
    total: dist.get(dstId)
  };
  scheduleDraw();

  return { ok:true, edges: pathEdges, nodes: pathNodes, total: dist.get(dstId) };
}
