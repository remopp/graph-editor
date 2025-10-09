// public/js/viewer/graphOps.js
// Node & Edge operations + selection panel + link utilities.

import {
  selInfo, newNodeId, newNodeLabel, addNodeBtn,
  editNodeId, editNodeLabel, editNodeLayer, applyEditBtn, deleteNodeBtn,
  edgeSrc, edgeDst, edgeW, addEdgeBtn, removeEdgeBtn, nodeIdsList, canvas,
} from './dom.js';

import {
  graph, selectedNode, setSelectedNodeValue, scheduleDraw,historyCapture, transform
} from './state.js';

import {
  applyLayoutForType, snapNodeToLayer,
} from './layouts.js';

import {
  savePositionsDebounced,
} from './persistence.js';

// this returns the id of a node or edge reference
export function idOf(ref) {
  return (typeof ref === 'object') ? ref?.id : ref;
}
//this returns a node by its id
function getNodeById(id) {
  return (graph.nodes || []).find(n => n.id === id);
}
// Validate a single edge (sNode -> tNode) for hierarchy rules
function validateHierarchyEdge(sNode, tNode) {
  const sL = Number(sNode?.layer), tL = Number(tNode?.layer);
  if (!Number.isFinite(sL) || !Number.isFinite(tL)) {
    return { ok: false, msg: 'Both nodes must have a valid integer layer.' };
  }
  if (sL === tL) return { ok: false, msg: 'No same-layer edges allowed in hierarchy.' };
  if (sL >= tL) return { ok: false, msg: 'Edges must go downward (source layer < target layer).' };
  return { ok: true };
}

// Check if changing `node.layer` to `newLayer` would violate ANY incident edge.
export function validateLayerChange(node, newLayer) {
  const L = Number(newLayer);
  if (!Number.isFinite(L) || L < 1) return { ok: false, msg: 'Layer must be a positive integer.' };

  // Consider all incident edges as (source,target) pairs (ids)
  for (const e of (graph.links || [])) {
    const sId = idOf(e.source);
    const tId = idOf(e.target);

    // Build hypothetical sNode/tNode with proposed L for `node`
    const sNode = (sId === node.id) ? { ...node, layer: L } : getNodeById(sId);
    const tNode = (tId === node.id) ? { ...node, layer: L } : getNodeById(tId);

    // Only validate when both ends exist
    if (!sNode || !tNode) continue;

    const v = validateHierarchyEdge(sNode, tNode);
    if (!v.ok) return v; // First violation message
  }
  return { ok: true };
}

// this ensures all links have source/target as ids (not objects)
export function normalizeLinks() {
  for (const e of (graph.links || [])) {
    if (e && typeof e.source === 'object') e.source = e.source?.id;
    if (e && typeof e.target === 'object') e.target = e.target?.id;
  }
}
// this finds the index of an edge by source and target ids
export function findEdgeIndexByIds(s, t) {
  return (graph.links || []).findIndex(e => idOf(e.source) === s && idOf(e.target) === t);
}
// this removes duplicate edges in place, keeping only one edge per (source -> target)
export function dedupeLinksInPlace() {
  const seen = new Set();
  for (let i = (graph.links?.length || 0) - 1; i >= 0; i--) {
    const e = graph.links[i];
    const key = `${idOf(e.source)}->${idOf(e.target)}`;
    if (seen.has(key)) graph.links.splice(i, 1);
    else seen.add(key);
  }
}

//this function sets the selected node and updates the UI accordingly
export function setSelectedNode(n) {
  setSelectedNodeValue(n);

  if (n) {
    selInfo.textContent = `${n.id}${n.label ? ' [' + n.label + ']' : ''}`;
    if (editNodeId)    editNodeId.value = n.id;
    if (editNodeLabel) editNodeLabel.value = n.label || '';

    if (editNodeLayer) {
      if (graph.type === 'hierarchy') {
        editNodeLayer.disabled = false;
        editNodeLayer.value = Number.isFinite(n.layer) ? n.layer : 1;
      } else {
        editNodeLayer.disabled = true;
        editNodeLayer.value = '';
      }
    }
  } else {
    selInfo.textContent = '(none)';
    if (editNodeId)    editNodeId.value = '';
    if (editNodeLabel) editNodeLabel.value = '';
    if (editNodeLayer) editNodeLayer.value = '';
  }

  scheduleDraw();
}
//this updates the nod id list in the selection panel
export function refreshNodeIdDatalist() {
  if (!nodeIdsList) return;
  nodeIdsList.innerHTML = '';
  for (const n of (graph.nodes || [])) {
    const opt = document.createElement('option');
    opt.value = n.id;
    nodeIdsList.appendChild(opt);
  }
}

/* ========================= CLICK-TO-PLACE NEW NODE ========================= */

//this holds the pending new node data while waiting for the user to click on the canvas
let pendingNodePlacement = null;

//this converts a browser client coordinate to graph coordinates (uses CSS pixels to match d3-zoom transform)
function clientToGraph(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;

  // IMPORTANT: transform.x/y are in CSS pixels; do NOT convert to device pixels here
  const gx = (cssX - transform.x) / transform.k;
  const gy = (cssY - transform.y) / transform.k;
  return { x: gx, y: gy };
}

//this finishes placement when the user clicks on the canvas
function onCanvasPointerDownToPlace(ev) {
  if (!pendingNodePlacement) return;

  ev.stopPropagation();
  ev.preventDefault();

  const { x, y } = clientToGraph(ev.clientX, ev.clientY);
  const { id, label } = pendingNodePlacement;

  const node = { id, label: label || undefined, x, y };

  // For force graphs, pin the node at the exact position so the layout does not move it
  if (graph.type === 'force') {
    node.fx = x;
    node.fy = y;
  }

  // For hierarchy graphs, default to layer 1 and snap to the row
  if (graph.type === 'hierarchy') {
    node.layer = 1;
    snapNodeToLayer(node, node.layer);
  }

  historyCapture('add node');
  (graph.nodes || (graph.nodes = [])).push(node);

  // clear inputs
  if (newNodeId) newNodeId.value = '';
  if (newNodeLabel) newNodeLabel.value = '';

  // cleanup listeners / cursor
  pendingNodePlacement = null;
  canvas.style.cursor = 'grab';
  window.removeEventListener('keydown', onKeyDownCancelPlacement, true);
  // pointerdown listener was registered with { once:true }

  refreshNodeIdDatalist();
  // do not call applyLayoutForType() here; we want the node to stay where placed
  setSelectedNode(node);
  savePositionsDebounced();
}

//this cancels the placement flow when the user presses Escape
function onKeyDownCancelPlacement(e) {
  if (e.key !== 'Escape') return;
  pendingNodePlacement = null;
  canvas.style.cursor = 'grab';
  window.removeEventListener('keydown', onKeyDownCancelPlacement, true);
}

//this starts the add-node placement flow and retracts the Node Editor menu
function startAddNodePlacement() {
  const id = (newNodeId?.value || '').trim();
  const label = (newNodeLabel?.value || '').trim();
  if (!id) return alert('Enter a new node id');
  if ((graph.nodes || []).some(n => n.id === id)) return alert('Node id already exists');

  // retract the Node Editor dropdown (so it’s out of the way while placing)
  const nodeEditorDetails = addNodeBtn?.closest('details');
  if (nodeEditorDetails) nodeEditorDetails.removeAttribute('open');

  pendingNodePlacement = { id, label };
  canvas.style.cursor = 'crosshair';

  // capture the very next pointerdown and auto-remove; prevents drag/zoom from stealing it
  canvas.addEventListener('pointerdown', onCanvasPointerDownToPlace, { capture: true, once: true });
  window.addEventListener('keydown', onKeyDownCancelPlacement, true);
}

/* ======================= END CLICK-TO-PLACE NEW NODE ======================= */

//applys the changes made in the edit node panel to the selected node
function onApplyEdit() {
  if (!selectedNode) return alert('Select a node first');
  const oldId = selectedNode.id;

  const newIdVal = (editNodeId?.value || '').trim();
  const newLabelVal = (editNodeLabel?.value || '').trim();
  if (!newIdVal) return alert('ID cannot be empty');
  if (newIdVal !== oldId && (graph.nodes || []).some(n => n.id === newIdVal)) {
    return alert('Another node already has that id');
  }

  historyCapture('edit node');
  selectedNode.id = newIdVal;
  selectedNode.label = newLabelVal || undefined;

  // Update links pointing to old id
  for (const e of (graph.links || [])) {
    if (e.source === oldId) e.source = newIdVal;
    if (e.target === oldId) e.target = newIdVal;
  }

  // Determine requested layer (if any)
  let willChangeLayer = false;
  let requestedLayer = selectedNode.layer;
  if (graph.type === 'hierarchy' && editNodeLayer) {
    const Lraw = parseInt(editNodeLayer.value, 10);
    if (Number.isFinite(Lraw) && Lraw >= 1 && Lraw !== selectedNode.layer) {
      willChangeLayer = true;
      requestedLayer = Lraw;
      // Pre-validate layer change against all incident edges
      const v = validateLayerChange(selectedNode, requestedLayer);
      if (!v.ok) {
        // Block only the layer change, but allow id/label to proceed
        // Reset the UI field so it matches the actual layer
        if (editNodeLayer) editNodeLayer.value = selectedNode.layer ?? '';
        alert(v.msg);
        willChangeLayer = false; // cancel layer change
      }
    }
  }
  
  if (willChangeLayer) {
    snapNodeToLayer(selectedNode, requestedLayer);
  }
  refreshNodeIdDatalist();
  setSelectedNode(selectedNode);
  savePositionsDebounced();
}
// this function is called when the delete node button is clicked after a node is selected
function onDeleteNode() {
  if (!selectedNode) return alert('Select a node first');
  const id = selectedNode.id;
  
  historyCapture('delete node');

  graph.nodes = graph.nodes.filter(n => n !== selectedNode);
  graph.links = (graph.links || []).filter(e => (idOf(e.source) !== id && idOf(e.target) !== id));

  setSelectedNode(null);
  refreshNodeIdDatalist();
  applyLayoutForType();
  savePositionsDebounced();
}

//this functionis called when addiing an edge or updating an existing edge
function onAddOrUpdateEdge() {
  const s = (edgeSrc?.value || '').trim();
  const t = (edgeDst?.value || '').trim();
  const wStr = (edgeW?.value || '').trim();
  
  const sNode = getNodeById(s);
  const tNode = getNodeById(t);
  
  if (!s || !t) return alert('Enter source and target ids');
  if (s === t) return alert('Source and target must differ');

  if (!(graph.nodes || []).some(n => n.id === s) ||
      !(graph.nodes || []).some(n => n.id === t)) {
    return alert('Both source and target must exist');
  }
  // For hierarchy graphs, validate the edge direction
  if (graph.type === 'hierarchy') {
    const v = validateHierarchyEdge(sNode, tNode);
    if (!v.ok) return alert(v.msg);
  }

  const isForce = graph.type === 'force';
  const idx = findEdgeIndexByIds(s, t);

  if (idx !== -1) {
    // Edge exists -> update weight silently (force only)
    if (isForce) {
      if (wStr === '') return; // no change requested
      const newW = Number(wStr);
      if (Number.isNaN(newW)) return alert('Weight must be a number');
      historyCapture('update edge');
      graph.links.splice(idx, 1, { source: s, target: t, weight: newW });
    } 
    else {
      // Non-force graphs ignore weights and don’t allow duplicates
      return;
    }
  } else {
    // Create new edge
    const newEdge = { source: s, target: t };
    if (isForce && wStr !== '') {
      const newW = Number(wStr);
      if (Number.isNaN(newW)) return alert('Weight must be a number');
      newEdge.weight = newW;
    }
    historyCapture('add edge');
    (graph.links || (graph.links = [])).push(newEdge);
  }

  dedupeLinksInPlace();
  scheduleDraw();
}
// this function is called when removing an edge
function onRemoveEdge() {
  const s = (edgeSrc?.value || '').trim();
  const t = (edgeDst?.value || '').trim();
  if (!s || !t) return alert('Enter source and target ids');

  const idx = findEdgeIndexByIds(s, t);
  if (idx === -1) return alert('No edge (source,target) found');

  historyCapture('remove edge');

  graph.links.splice(idx, 1);
  scheduleDraw();
}


// this function sets up the event listeners for the graph operation buttons and inputs
export function setupGraphOps() {
  // Buttons / inputs
  if (addNodeBtn)     addNodeBtn.addEventListener('click', startAddNodePlacement);
  if (applyEditBtn)   applyEditBtn.addEventListener('click', onApplyEdit);
  if (deleteNodeBtn)  deleteNodeBtn.addEventListener('click', onDeleteNode);

  if (addEdgeBtn)     addEdgeBtn.addEventListener('click', onAddOrUpdateEdge);
  if (removeEdgeBtn)  removeEdgeBtn.addEventListener('click', onRemoveEdge);

  // Initial datalist
  refreshNodeIdDatalist();
}
