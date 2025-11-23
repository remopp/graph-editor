//This file essentially ensures that any changes made to the graph are properly saved to the server

import { saveBtn } from './dom.js';
import { graph } from './state.js';
import { normalizeLinks } from './graphOps.js';
import { apiPut } from '../api.js';

let saveTimer = null;
let auto_save = false;
//read the current graph id from the URL hash
function getCurrentGraphId() {
  return location.hash.slice(1);
}

//Binds the Save button to trigger the saveAll() function when clicked
export function setupPersistence() {
  if (!saveBtn) return;
  saveBtn.addEventListener('click', saveAll);
}

//If the user stops moving the node for 600ms, the positions are saved
export function savePositionsDebounced(delayMs = 600) {
  if(!auto_save) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePositionsOnly, delayMs);
}

// When you drag nodes around, this saves only the node positions to avoid re-saving the entire graph every time
export async function savePositionsOnly() {
  const id = getCurrentGraphId();
  if (!id) return;

  // this sends only position (and layer for hierarchy) so server merges without dropping description
  const nodesOut = (graph.nodes || []).map(({ id, x, y, layer }) => {
    const base = { id, x, y };
    if (graph.type === 'hierarchy' && Number.isFinite(layer)) base.layer = layer;
    return base;
  });

  const res = await apiPut(`/api/graphs/${id}`, { nodes: nodesOut });
  if (res?.error) {
    if (res.error === 'forbidden_readonly') {
      console.warn('read-only: you do not have edit access');
    } else {
      console.warn('Position save failed:', res.error);
    }
  }
}

//this function saves the entire graph to the server
export async function saveAll() {
  const id = getCurrentGraphId();
  if (!id) return;

  // Ensure links are plain id refs before saving
  normalizeLinks();

  // this includes description and position
  const nodesOut = (graph.nodes || []).map(({ id, label, description, x, y, layer }) => {
    const base = { id };
    if (label != null) base.label = label;
    if (description != null) base.description = description;
    if (Number.isFinite(x)) base.x = x;
    if (Number.isFinite(y)) base.y = y;
    if (graph.type === 'hierarchy' && Number.isFinite(layer)) base.layer = layer;
    return base;
  });

  const payload = { nodes: nodesOut, links: graph.links || [] };
  const res = await apiPut(`/api/graphs/${id}`, payload);
  if (res?.error) {
    if (res.error === 'forbidden_readonly') {
      return alert('This graph is read-only for you. Ask the owner to make you an editor.');
    }
    return alert(res.error);
  }
  alert('Saved!');
}
