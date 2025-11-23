//this file manages basic UI interactions, and makes sure everything scales properly across devices

//this function gets an element by its id in the html
export const $ = (id) => document.getElementById(id);

export const titleEl       = $('title');
export const typeBadge     = $('typeBadge');
export const logoutBtn     = $('logoutBtn');
export const exportBtn     = $('exportBtn');
export const exportPngBtn = $('exportPngBtn');
export const saveBtn       = $('saveBtn');
export const undoBtn      = $('undoBtn');
export const redoBtn      = $('redoBtn');
export const searchInput = $('searchInput');
export const searchBtn   = $('searchBtn');
export const searchCount = $('searchCount');



export const canvas        = $('graphCanvas');
// the 2d rendering context for the canvas
export const ctx           = canvas.getContext('2d', { alpha: false });

export const selInfo       = $('selInfo');

// Node editor
export const newNodeId     = $('newNodeId');
export const newNodeLabel  = $('newNodeLabel');
export const addNodeBtn    = $('addNodeBtn');

export const editNodeId    = $('editNodeId');
export const editNodeLabel = $('editNodeLabel');
export const editNodeLayer = $('editNodeLayer');
export const applyEditBtn  = $('applyEditBtn');
export const deleteNodeBtn = $('deleteNodeBtn');
export const newNodeDesc = $('newNodeDesc');
export const editNodeDesc = $('editNodeDesc');

// Edge editor
export const edgeSrc       = $('edgeSrc');
export const edgeDst       = $('edgeDst');
export const edgeW         = $('edgeW');
export const addEdgeBtn    = $('addEdgeBtn');
export const removeEdgeBtn = $('removeEdgeBtn');
export const edgeNote      = $('edgeNote');
export const nodeIdsList   = $('nodeIdsList');

//visual constrants for the arrow and node radius
export const NODE_R    = 5;
export const ARROW_LEN = 10;
export const ARROW_W   = 6;

//get the device pixel ratio for HiDPI rendering
let dpi = Math.max(1, window.devicePixelRatio || 1);

//retuerns the current device pixel ratio
export function getDPI() {
  return dpi;
}

//refresh the dpi value 
export function refreshDPI() {
  dpi = Math.max(1, window.devicePixelRatio || 1);
  return dpi;
}

//gets the current size of the canvas in css pixels
export function getCanvasClientSize() {
  const rect = canvas.getBoundingClientRect();
  return {
    width:  Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

//applies HiDPI scaling to the canvas
export function applyHiDPI(widthCssPx, heightCssPx) {
  const d = getDPI();
  canvas.width  = Math.round(widthCssPx * d);
  canvas.height = Math.round(heightCssPx * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
