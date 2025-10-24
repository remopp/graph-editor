// node and edge operations , selection panel and link utilities.

import {
  selInfo, newNodeId, newNodeLabel, addNodeBtn,
  editNodeId, editNodeLabel, editNodeLayer, applyEditBtn, deleteNodeBtn,
  edgeSrc, edgeDst, edgeW, addEdgeBtn, removeEdgeBtn, nodeIdsList, canvas,
  newNodeDesc, editNodeDesc
} from './dom.js';

import {
  graph, selectedNode, setSelectedNodeValue, scheduleDraw, historyCapture, transform
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
// this returns a node by its id
function getNodeById(id) {
  return (graph.nodes || []).find(n => n.id === id);
}
// this validates a single edge (source Node to target Node) for hierarchy rules
function validateHierarchyEdge(sNode, tNode) {
  const sL = Number(sNode?.layer), tL = Number(tNode?.layer);
  if (!Number.isFinite(sL) || !Number.isFinite(tL)) {
    return { ok: false, msg: 'Both nodes must have a valid integer layer.' };
  }
  if (sL === tL) return { ok: false, msg: 'No same layer edges allowed in hierarchy.' };
  if (sL >= tL) return { ok: false, msg: 'Edges must go downward (source layer < target layer).' };
  return { ok: true };
}

// this checks if changing node.layer to newLayer would violate any incident edge
export function validateLayerChange(node, newLayer) {
  const L = Number(newLayer);
  if (!Number.isFinite(L) || L < 1) return { ok: false, msg: 'Layer must be a positive integer.' };

  // this considers all incident edges as (source,target) pairs (ids)
  for (const e of (graph.links || [])) {
    const sId = idOf(e.source);
    const tId = idOf(e.target);

    const sNode = (sId === node.id) ? { ...node, layer: L } : getNodeById(sId);
    const tNode = (tId === node.id) ? { ...node, layer: L } : getNodeById(tId);

    if (!sNode || !tNode) continue;

    const v = validateHierarchyEdge(sNode, tNode);
    if (!v.ok) return v; // first violation message
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
// this removes duplicate edges in place, keeping only one edge per (source to target)
export function dedupeLinksInPlace() {
  const seen = new Set();
  for (let i = (graph.links?.length || 0) - 1; i >= 0; i--) {
    const e = graph.links[i];
    const key = `${idOf(e.source)}->${idOf(e.target)}`;
    if (seen.has(key)) graph.links.splice(i, 1);
    else seen.add(key);
  }
}

// this sets the selected node and updates the ui accordingly
export function setSelectedNode(n) {
  setSelectedNodeValue(n);

  if (n) {
    selInfo.textContent = `${n.id}${n.label ? ' [' + n.label + ']' : ''}`;
    if (editNodeId)    editNodeId.value = n.id;
    if (editNodeLabel) editNodeLabel.value = n.label || '';
    if (editNodeDesc)  editNodeDesc.value  = n.description || '';

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
    if (editNodeDesc)  editNodeDesc.value  = '';
    if (editNodeLayer) editNodeLayer.value = '';
  }

  scheduleDraw();
}
// this updates the node id list in the selection panel
export function refreshNodeIdDatalist() {
  if (!nodeIdsList) return;
  nodeIdsList.innerHTML = '';
  for (const n of (graph.nodes || [])) {
    const opt = document.createElement('option');
    opt.value = n.id;
    nodeIdsList.appendChild(opt);
  }
}

// this holds the pending new node data while waiting for the user to click on the canvas
let pendingNodePlacement = null;

// this converts a browser client coordinate to graph coordinates (uses css pixels to match d3-zoom transform)
function clientToGraph(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;

  // transform.x/y are in css pixels. do not convert to device pixels here
  const gx = (cssX - transform.x) / transform.k;
  const gy = (cssY - transform.y) / transform.k;
  return { x: gx, y: gy };
}

// this finishes placement when the user clicks on the canvas
function onCanvasPointerDownToPlace(ev) {
  if (!pendingNodePlacement) return;

  ev.stopPropagation();
  ev.preventDefault();

  const { x, y } = clientToGraph(ev.clientX, ev.clientY);
  const { id, label, description } = pendingNodePlacement;

  const node = { id, label: label || undefined, description: description || '', x, y };

  // for hierarchy graphs, default to layer 1 and snap to the row
  if (graph.type === 'hierarchy') {
    node.layer = 1;
    snapNodeToLayer(node, node.layer);
  }

  historyCapture('add node');
  (graph.nodes || (graph.nodes = [])).push(node);

  if (newNodeId)    newNodeId.value = '';
  if (newNodeLabel) newNodeLabel.value = '';
  if (newNodeDesc)  newNodeDesc.value = '';

  pendingNodePlacement = null;
  canvas.style.cursor = 'grab';
  window.removeEventListener('keydown', onKeyDownCancelPlacement, true);

  refreshNodeIdDatalist();
  setSelectedNode(node);
  savePositionsDebounced();
}



// this cancels the placement flow when the user presses escape
function onKeyDownCancelPlacement(e) {
  if (e.key !== 'Escape') return;
  pendingNodePlacement = null;
  canvas.style.cursor = 'grab';
  window.removeEventListener('keydown', onKeyDownCancelPlacement, true);
}

// this starts the add-node placement flow and retracts the node editor menu
function startAddNodePlacement() {
  const id = (newNodeId?.value || '').trim();
  const label = (newNodeLabel?.value || '').trim();
  const description = (newNodeDesc?.value || '').trim();
  if (!id) return alert('Enter a new node id');
  if ((graph.nodes || []).some(n => n.id === id)) return alert('Node id already exists');

  // this closes the node editor dropdown so it is out of the way while placing
  const nodeEditorDetails = addNodeBtn?.closest('details');
  if (nodeEditorDetails) nodeEditorDetails.removeAttribute('open');

  pendingNodePlacement = { id, label, description };
  canvas.style.cursor = 'crosshair';

  // this captures the very next pointerdown and auto removes, prevents drag/zoom from stealing it
  canvas.addEventListener('pointerdown', onCanvasPointerDownToPlace, { capture: true, once: true });
  window.addEventListener('keydown', onKeyDownCancelPlacement, true);
}


// this applys the changes made in the edit node panel to the selected node
function onApplyEdit() {
  if (!selectedNode) return alert('Select a node first');
  const oldId = selectedNode.id;

  const newIdVal   = (editNodeId?.value || '').trim();
  const newLabelVal= (editNodeLabel?.value || '').trim();
  const newDescVal = (editNodeDesc?.value || '').trim();
  if (!newIdVal) return alert('ID cannot be empty');
  if (newIdVal !== oldId && (graph.nodes || []).some(n => n.id === newIdVal)) {
    return alert('Another node already has that id');
  }

  historyCapture('edit node');
  selectedNode.id = newIdVal;
  selectedNode.label = newLabelVal || undefined;
  selectedNode.description = newDescVal || '';

  // this updates links pointing to the old id
  for (const e of (graph.links || [])) {
    if (e.source === oldId) e.source = newIdVal;
    if (e.target === oldId) e.target = newIdVal;
  }

  // this determines requested layer
  let willChangeLayer = false;
  let requestedLayer = selectedNode.layer;
  if (graph.type === 'hierarchy' && editNodeLayer) {
    const Lraw = parseInt(editNodeLayer.value, 10);
    if (Number.isFinite(Lraw) && Lraw >= 1 && Lraw !== selectedNode.layer) {
      willChangeLayer = true;
      requestedLayer = Lraw;
      // this pre validates the layer change against all incident edges
      const v = validateLayerChange(selectedNode, requestedLayer);
      if (!v.ok) {
        // this blocks only the layer change, but allows id,label and description updates
        if (editNodeLayer) editNodeLayer.value = selectedNode.layer ?? '';
        alert(v.msg);
        willChangeLayer = false;
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

// this deletes the currently selected node
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

// this adds or updates an edge (and weight for force graphs)
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
  // this validates edge direction for hierarchy graphs
  if (graph.type === 'hierarchy') {
    const v = validateHierarchyEdge(sNode, tNode);
    if (!v.ok) return alert(v.msg);
  }

  const isForce = graph.type === 'force';
  const idx = findEdgeIndexByIds(s, t);

  if (idx !== -1) {
    // this updates weight for existing edge (force only)
    if (isForce) {
      if (wStr === '') return;
      const newW = Number(wStr);
      if (Number.isNaN(newW)) return alert('Weight must be a number');
      historyCapture('update edge');
      graph.links.splice(idx, 1, { source: s, target: t, weight: newW });
    } else {
      // non force graphs ignore weights and dont allow duplicates
      return;
    }
  } else {
    // this creates a new edge
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

// this removes an edge
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

// this sets up the event listeners for graph operation buttons and inputs
export function setupGraphOps() {
  if (addNodeBtn)     addNodeBtn.addEventListener('click', startAddNodePlacement);
  if (applyEditBtn)   applyEditBtn.addEventListener('click', onApplyEdit);
  if (deleteNodeBtn)  deleteNodeBtn.addEventListener('click', onDeleteNode);

  if (addEdgeBtn)     addEdgeBtn.addEventListener('click', onAddOrUpdateEdge);
  if (removeEdgeBtn)  removeEdgeBtn.addEventListener('click', onRemoveEdge);

  // this populates the id datalist initially
  refreshNodeIdDatalist();
}
