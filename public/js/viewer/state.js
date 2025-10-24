//this file serves the central storage for all graph data and global state (like zoom level, selected node, and whether a node is being dragged)

// The graph object holds nodes and links, plus metadata like type and title.
export const graph = {
  nodes: [],   // [{ id, label, x, y, layer }]
  links: [],   // [{ source, target, weight }]
  type: 'force',
  title: '',
};

export let selectedIds = new Set();

export function setSelection(ids = []) {
  selectedIds = new Set(ids);
  scheduleDraw();
}

export function clearSelection() {
  selectedIds.clear();
  // keep focused node consistent
  setSelectedNodeValue?.(null);
  scheduleDraw();
}

// here program sets the selected node object (or null)
export let selectedNode = null;
// this function sets the selected node 
export function setSelectedNodeValue(n) { selectedNode = n; }
// here the prtogram sets whether we are currently dragging a node
export let isDragging = false;
export function setIsDragging(v) { isDragging = !!v; }

// Current d3 zoom transform (x,y = translation, k = scale)
export let transform = d3.zoomIdentity; // {x, y, k}
export function setTransform(t) { transform = t; }

// Hold the d3 zoom behavior so zoomToFit() can programmatically change it
let zoomBehavior = null;
export function setZoomBehavior(zb) { zoomBehavior = zb; }
export function getZoomBehavior() { return zoomBehavior; }

// The frame scheduler ensures that the graph is rendered only once per animation frame, making the rendering process more efficient
//Keeps track of whether a draw has already been scheduled 
let drawQueued = false;

//drawFn Holds the function that will perform the actual drawing
let drawFn = null;
export function setDrawFn(fn) { drawFn = fn; }

//request a draw on the next animation frame if one is not already scheduled
export function scheduleDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(async () => {
    drawQueued = false;
    try {
      if (!drawFn) {
        const mod = await import('./render.js');
        drawFn = mod.draw;
      }
      if (typeof drawFn === 'function') drawFn();
    } 
    catch (err) {
      console.warn('scheduleDraw(): failed to draw', err);
    }
  });
}


// SEARCH
export let searchMatches = new Set();           // ids of matched nodes
export let searchIndex = 0;
export function setSearchResults(ids, index=0){ 
  searchMatches = new Set(ids);
  searchIndex = Math.max(0, Math.min(index, ids.length-1));
  scheduleDraw();
}


//undo/redo

const _clone = (obj) => {
  // structuredClone is used if the browser supports it 
  if (typeof structuredClone === 'function') return structuredClone(obj);
  // JSON deep clone if not
  return JSON.parse(JSON.stringify(obj));
};

let undoStack = []; // undo array of { graph, reason } reason is not nesesary but usfeful for debugging
let redoStack = []; // redo array of { graph, reason }  reason is not nesesary but usfeful for debugging

// this functions is for capturing the current state of the graph befor any change is made to it
export function historyCapture(reason = '') {
  undoStack.push({ graph: _clone(graph), reason });
  // clear the redo stack on new action becuse once a change it done there is no futere to redo to
  redoStack.length = 0;
}

// applys a snapshot to the current graph
function _applySnapshot(snap) {
  graph.nodes.length = 0;
  graph.links.length = 0;
  graph.nodes.push(...snap.nodes);
  graph.links.push(...snap.links);
  graph.type  = snap.type || graph.type;
  graph.title = snap.title ?? graph.title;
}

// Undo one step
export function undo() {
  if (undoStack.length === 0) return;
  // push current state to redo
  redoStack.push({ graph: _clone(graph), reason: 'redo checkpoint' });
  // restore previous from undo
  const prev = undoStack.pop();
  _applySnapshot(prev.graph);
  scheduleDraw();
  // refresh the ID list in case nodes were added/removed 
  import('./graphOps.js').then(m => m.refreshNodeIdDatalist?.());
}

// Redo one step
export function redo() {
  if (redoStack.length === 0) return;
  // push current state to undo
  undoStack.push({ graph: _clone(graph), reason: 'undo checkpoint' });
  // restore from redo
  const next = redoStack.pop();
  _applySnapshot(next.graph);
  scheduleDraw();
  // refresh the ID list in case nodes were added/removed
  import('./graphOps.js').then(m => m.refreshNodeIdDatalist?.());
}

