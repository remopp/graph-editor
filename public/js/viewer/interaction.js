// this file handles user interactions like zooming, panning, and dragging nodes in the graph viewer using d3.js

import { canvas, NODE_R } from './dom.js';
import {
  graph, transform, setTransform, setIsDragging, setZoomBehavior, scheduleDraw, historyCapture 
} from './state.js';
import { setSelectedNode, validateLayerChange  } from './graphOps.js';
import { stopSim, yForLayer, snapNodeToLayer, layerState } from './layouts.js';
import { savePositionsDebounced } from './persistence.js';

let lastPointerDown = { x: 0, y: 0 };

//this function sets up zoom and drag behavior on the canvas using d3.js
export function setupZoomAndDrag() {
  //here the zoom behavior is defined using d3.js
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

  // here the drag behavior is defined using d3.js
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
      setSelectedNode(hit || null);
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

  // compute offset so we don't snap
  const srcEv = event.sourceEvent || event;
  const [sx, sy] = d3.pointer(srcEv, canvas);
  const gx = (sx - transform.x) / transform.k;
  const gy = (sy - transform.y) / transform.k;
  n._dragOff = { dx: (n.x || 0) - gx, dy: (n.y || 0) - gy };
  n._startLayer = Math.max(1, Math.floor(n.layer) || 1);
  stopSim();
  n._captured = false;
}

// update node position as it's being dragged
function dragged(event) {
  const n = event.subject; if (!n) return;

  // Convert current pointer to graph coords
  const srcEv = event.sourceEvent || event;
  const [sx, sy] = d3.pointer(srcEv, canvas);
  const gx = (sx - transform.x) / transform.k;
  const gy = (sy - transform.y) / transform.k;

  const dx = n._dragOff?.dx || 0;
  const dy = n._dragOff?.dy || 0;
  
  const newX = gx + dx;
  const newY = gy + dy;


  if (!n._captured) {
    historyCapture('drag move'); 
    n._captured = true;    
  }

  n.x = newX;
  n.y = newY; 

  scheduleDraw(); // smoother than calling draw() directly every mousemove
}
// finalize node position after dragging ends
function dragended(event) {
  const n = event.subject; if (!n) return;
  canvas.style.cursor = 'grab';
  setIsDragging(false);

  if (graph.type === 'hierarchy') {
    const startY = layerState.startY;
    const gapY   = layerState.gapY;
    const nearest = Math.max(1, Math.round((n.y - startY) / gapY) + 1);

    if (nearest !== n._startLayer) {
      const v = validateLayerChange(n, nearest);
      if (v?.ok) {
        snapNodeToLayer(n, nearest);
      } else {
        n.layer = n._startLayer;
        n.y = yForLayer(n._startLayer);
      }
    } else {
      n.y = yForLayer(n._startLayer);
    }
  }

  delete n._dragOff;
  delete n._startLayer;
  delete n._captured;

  savePositionsDebounced();
  scheduleDraw();
}