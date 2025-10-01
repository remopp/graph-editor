//this file contains functions responsible for rendering the graph onto an HTML canvas, including drawing nodes and directed links with arrowheads, handling zoom and pan transformations, and ensuring the graph fits within the viewport

import {
  canvas, ctx,
  NODE_R, ARROW_LEN, ARROW_W,
  getCanvasClientSize, applyHiDPI,
} from './dom.js';

import {
  graph, transform, selectedNode, isDragging,
  scheduleDraw, setTransform, getZoomBehavior,
} from './state.js';

import { layerState, yForLayer } from './layouts.js';

//this function resizes the canvas to match its displayed size and applies HiDPI scaling
export function resizeCanvas() {
  const { width, height } = getCanvasClientSize();
  applyHiDPI(width, height);
  scheduleDraw();
}

//this function clears the entire canvas, filling it with a black background to avoid drawing over previous graph renderings when the user for example zooms or moves nodes around
function clearCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawLayerGuides() {
  if (graph.type !== 'hierarchy' || !layerState?.enabled || !graph.nodes?.length) return;

  ctx.save();
  ctx.strokeStyle = '#ffffff7a';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 4]);

  for (let L = 1, Lmax = Math.max(1, layerState.Lmax | 0); L <= Lmax; L++) {
    const y = yForLayer(L);
    ctx.beginPath();
    ctx.moveTo(-1e5, y);
    ctx.lineTo( 1e5, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}


// Main draw function: clear, apply pan/zoom, draw links, draw nodes
export function draw() {
  if (!graph.nodes || graph.nodes.length === 0) return;

  clearCanvas();

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  drawLayerGuides();
  if (isDragging) {
    // Fast path while dragging: simple lines (no arrows/labels)
    ctx.strokeStyle = '#7aa0ff55';
    ctx.lineWidth = 1.2;
    for (const e of (graph.links || [])) {
      const s = getNode(e.source), t = getNode(e.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x || 0, s.y || 0);
      ctx.lineTo(t.x || 0, t.y || 0);
      ctx.stroke();
    }
  } else {
    // Full arrows + optional weight labels
    for (const e of (graph.links || [])) {
      const s = getNode(e.source), t = getNode(e.target);
      if (!s || !t) continue;
      drawArrowLink(s, t, e.weight);
    }
  }

  for (const n of (graph.nodes || [])) {
    drawNode(n, n === selectedNode); // highlight selected
  }

  ctx.restore();
}
//This function is used to retrieve the node object using either the node reference directly or its ID
function getNode(ref) {
  if (!ref) return null;
  return (typeof ref === 'object') ? ref : (graph.nodes.find(n => n.id === ref) || null);
}

// Draw a directed link with arrow head; optionally show weight label (force graphs only)
export function drawArrowLink(s, t, weight) {
  const dx = (t.x || 0) - (s.x || 0);
  const dy = (t.y || 0) - (s.y || 0);
  const ang = Math.atan2(dy, dx);

  // Start at source rim; end just before target rim (for arrow head)
  const sx = (s.x || 0) + Math.cos(ang) * NODE_R;
  const sy = (s.y || 0) + Math.sin(ang) * NODE_R;
  const tipX = (t.x || 0) - Math.cos(ang) * NODE_R;
  const tipY = (t.y || 0) - Math.sin(ang) * NODE_R;
  const baseX = tipX - Math.cos(ang) * ARROW_LEN;
  const baseY = tipY - Math.sin(ang) * ARROW_LEN;

  // Shaft
  ctx.strokeStyle = '#7aa0ff55';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();

  // Arrow head
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const leftX  = baseX + nx * (ARROW_W / 2);
  const leftY  = baseY + ny * (ARROW_W / 2);
  const rightX = baseX - nx * (ARROW_W / 2);
  const rightY = baseY - ny * (ARROW_W / 2);

  ctx.fillStyle = '#7aa0ffcc';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();

  // Weight label (force graphs only)
  if (graph.type === 'force' && weight != null) {
    const midX = (sx + baseX) / 2;
    const midY = (sy + baseY) / 2;
    ctx.fillStyle = '#c9d6ff';
    ctx.font = '10px system-ui';
    ctx.fillText(String(weight), midX + nx * 8, midY + ny * 8);
  }
}
// Draw a node as a circle with optional label; highlight if selected
export function drawNode(n, isSelected) {
  ctx.beginPath();
  ctx.fillStyle = '#4f7cff';
  ctx.arc(n.x || 0, n.y || 0, NODE_R, 0, Math.PI * 2);
  ctx.fill();

  if (isSelected) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(n.x || 0, n.y || 0, NODE_R + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Labels: always show selected; otherwise when zoomed enough or graphs <= 500 nodes
  const showLabel = isSelected || transform.k >= 0.7 || (graph.nodes?.length || 0) <= 500;
  if (showLabel) {
    ctx.fillStyle = '#dbe2ff';
    ctx.font = '10px system-ui';
    ctx.fillText(n.label || n.id, (n.x || 0) + 7, (n.y || 0) + 3);
  }
}

// This function calculates the best zoom level and translation to ensure that the graph fits within the canvas
export function zoomToFit(pad = 24) {
  const nodes = graph.nodes || [];
  if (!nodes.length) return;

  const xs = nodes.map(n => n.x ?? 0);
  const ys = nodes.map(n => n.y ?? 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const { width, height } = getCanvasClientSize();
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const k = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const tx = pad + (width - k * w) / 2 - k * minX;
  const ty = pad + (height - k * h) / 2 - k * minY;

  const t = d3.zoomIdentity.translate(tx, ty).scale(k);
  setTransform(t);

  const zb = getZoomBehavior?.();
  if (zb) {
    d3.select(canvas).call(zb.transform, t);
  } else {
    scheduleDraw();
  }
}
