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

  const nodesOut = (graph.nodes || []).map(({ id, label, x, y, layer }) => {
    const base = { id, label, x, y };
    if (graph.type === 'hierarchy' && Number.isFinite(layer)) base.layer = layer;
    return base;
  });

  const res = await apiPut(`/api/graphs/${id}`, { nodes: nodesOut });
  if (res?.error) console.warn('Position save failed:', res.error);
}

//this function saves the entire graph (nodes and links) to the server
export async function saveAll() {
  const id = getCurrentGraphId();
  if (!id) return;

  // Ensure links are plain id refs before saving
  normalizeLinks();

  const nodesOut = (graph.nodes || []).map(({ id, label, x, y, layer }) => {
    const base = { id, label, x, y };
    if (graph.type === 'hierarchy' && Number.isFinite(layer)) base.layer = layer;
    return base;
  });

  const payload = { nodes: nodesOut, links: graph.links || [] };
  const res = await apiPut(`/api/graphs/${id}`, payload);
  if (res?.error) return alert(res.error);
  alert('Saved!');
}
