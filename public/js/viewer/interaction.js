// this file handles user interactions like zooming, panning, and dragging nodes in the graph viewer using d3.js

import { canvas, NODE_R } from './dom.js';
import {graph, transform, setTransform, setIsDragging, setZoomBehavior, scheduleDraw, historyCapture, selectedIds, setSelection } from './state.js';
import { setSelectedNode, validateLayerChange  } from './graphOps.js';
import {  yForLayer, snapNodeToLayer, layerState } from './layouts.js';
import { savePositionsDebounced } from './persistence.js';

let lastPointerDown = { x: 0, y: 0 };
let dragGroup = null;
//this function sets up zoom and drag behavior on the canvas
export function setupZoomAndDrag() {
  //here the zoom behavior is defined
  const zoom = d3.zoom()
    .filter(ev => {
      if (ev.type === 'wheel') return true;
      if (ev.type === 'dblclick') return false;
      if (ev.type === 'mousedown' || ev.type === 'pointerdown' || ev.type === 'touchstart') {
        const [sx, sy] = d3.pointer(ev, canvas);
        return !findNodeAt(sx, sy);
      }
      return true;
    })
    .scaleExtent([0.1, 5])
    .on('zoom', (ev) => {
      setTransform(ev.transform);
      scheduleDraw();
    });

  d3.select(canvas).call(zoom);
  setZoomBehavior(zoom);

  // here the drag behavior is defined 
  d3.select(canvas).call(
    d3.drag()
      .container(canvas)
      .subject(ev => {
        const [sx, sy] = d3.pointer(ev, canvas);
        return findNodeAt(sx, sy);
      })
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended)
  );

  canvas.addEventListener('pointerdown', (e) => {
    lastPointerDown = { x: e.offsetX, y: e.offsetY };
  });
  canvas.addEventListener('pointerup', (e) => {
    const dx = e.offsetX - lastPointerDown.x;
    const dy = e.offsetY - lastPointerDown.y;
    if (dx*dx + dy*dy < 4) {
        const hit = findNodeAt(e.offsetX, e.offsetY);
        if (hit) {
          setSelectedNode(hit);
          setSelection([hit.id]);     // make it the sole selection
        } else {
          setSelectedNode(null);
          setSelection([]);           // clear selection on empty click
        }
    }
  });
}

//here the function checks if a node is at the given screen coordinates for hit detection
export function findNodeAt(screenX, screenY) {
  const gx = (screenX - transform.x) / transform.k;
  const gy = (screenY - transform.y) / transform.k;
  const hitR2 = (NODE_R + 6) ** 2;

  let hit = null, best = hitR2;
  for (const n of (graph.nodes || [])) {
    const nx = n.x || 0, ny = n.y || 0;
    const dx = gx - nx, dy = gy - ny;
    const d2 = dx*dx + dy*dy;
    if (d2 < best) { best = d2; hit = n; }
  }
  return hit;
}

//initiate dragging of a node
function dragstarted(event) {
  const n = event.subject; if (!n) return;
  event.sourceEvent?.stopPropagation?.();
  canvas.style.cursor = 'grabbing';
  setSelectedNode(n);
  setIsDragging(true);

  // pointer to graph coords
  const srcEv = event.sourceEvent || event;
  const [sx, sy] = d3.pointer(srcEv, canvas);
  const gx = (sx - transform.x) / transform.k;
  const gy = (sy - transform.y) / transform.k;

  // drag group (selected nodes or just this one)
  if (selectedIds.size && selectedIds.has(n.id)) {
    const nodes = graph.nodes || [];
    dragGroup = nodes.filter(x => selectedIds.has(x.id));
  } else {
    setSelection?.([n.id]);
    dragGroup = [n];
  }

  for (const g of dragGroup) {
    g._dragOff = { dx: (g.x || 0) - gx, dy: (g.y || 0) - gy };
    g._startLayer = Math.max(1, Math.floor(g.layer) || 1);
  }

  n._captured = false; // one history entry per gesture
}

// update node position as its being dragged
function dragged(event) {
  const n = event.subject; if (!n) return;

  const srcEv = event.sourceEvent || event;
  const [sx, sy] = d3.pointer(srcEv, canvas);
  const gx = (sx - transform.x) / transform.k;
  const gy = (sy - transform.y) / transform.k;

  if (!n._captured) { historyCapture('drag move (group)'); n._captured = true; }

  // Move entire group together (each with its own offset)
  const group = dragGroup || [n];
  for (const g of group) {
    const dx = g._dragOff?.dx || 0;
    const dy = g._dragOff?.dy || 0;
    g.x = gx + dx;
    g.y = gy + dy;
  }

  scheduleDraw();
}

// finalize node position after dragging ends
function dragended(event) {
  const n = event.subject; if (!n) return;
  canvas.style.cursor = 'grab';
  setIsDragging(false);

  const group = dragGroup || [n];

  if (graph.type === 'hierarchy') {
    const startY = layerState.startY;
    const gapY   = layerState.gapY;

    for (const g of group) {
      const nearest = Math.max(1, Math.round((g.y - startY) / gapY) + 1);
      if (nearest !== g._startLayer) {
        const v = validateLayerChange(g, nearest);
        if (v?.ok) snapNodeToLayer(g, nearest);
        else { g.layer = g._startLayer; g.y = yForLayer(g._startLayer); }
      } else {
        // snapped back to the exact row for its original layer
        g.y = yForLayer(g._startLayer);
      }
    }
  }

  // cleanup
  for (const g of group) { delete g._dragOff; delete g._startLayer; }
  delete n._captured;
  dragGroup = null;

  savePositionsDebounced();
  scheduleDraw();
}