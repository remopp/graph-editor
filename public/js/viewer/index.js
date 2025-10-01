//this is the main entry point for the graph viewer application. It initializes the application, loads the graph data, sets up the UI, and starts rendering the graph.

import {
  titleEl, typeBadge, logoutBtn, edgeW, edgeNote, undoBtn, redoBtn
} from './dom.js';

import {
  graph, setSelectedNodeValue, scheduleDraw, historyCapture, undo, redo
} from './state.js';

import {
  resizeCanvas, zoomToFit,
} from './render.js';

import {
  setupZoomAndDrag,
} from './interaction.js';

import {
  applyLayoutForType, allHavePositions,
} from './layouts.js';

import {
  setupGraphOps, refreshNodeIdDatalist,
  normalizeLinks, dedupeLinksInPlace,
} from './graphOps.js';

import {
  setupExporter,
} from './exporter.js';

import {
  apiGet, apiHandleAuthError, apiClearAuth,
} from '../api.js';

import { setupPersistence 

} from './persistence.js';

(async function init() {
  // read graph id from URL hash
  const currentGraphId = location.hash.slice(1);
  if (!currentGraphId) {
    alert('No graph id in URL.');
    location.href = './dashboard.html';
    return;
  }

  // if the logout button is pressed, clear the auth token and redirect to login page
  if (logoutBtn) {
    logoutBtn.onclick = () => { apiClearAuth(); location.href = './login.html'; };
  }

  // Size canvas and set up interactions before data (so UI is ready)
  resizeCanvas();
  setupZoomAndDrag();
  setupGraphOps();
  setupExporter();
  setupPersistence();

  // Redraw on window resize (keeps HiDPI correct)
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (allHavePositions()) scheduleDraw();
  });

  // Load graph data
  const data = await apiGet(`/api/graphs/${currentGraphId}`);
  if (data.error) return apiHandleAuthError(data);

  //here the program sets up the graph data and the UI
  graph.nodes = (data.nodes || []).map(n => ({ ...n }));
  graph.links = (data.links || []).map(l => ({ ...l }));
  graph.type  = data.type  || 'force';
  graph.title = data.title || '';

  
  normalizeLinks(); // ensures source/target are ids
  dedupeLinksInPlace(); // removes duplicate edges

  //sets the title and type badge in the UI
  if (titleEl)   titleEl.textContent = `Graph Viewer — ${graph.title}`;
  if (typeBadge) typeBadge.textContent = graph.type;

  // if the graph type is force, enable the edge weight input, otherwise disable it
  if (edgeW)   edgeW.disabled = (graph.type !== 'force');
  if (edgeNote) {
    edgeNote.textContent = (graph.type === 'force')
      ? 'Weights set link length (higher weight → shorter, stronger link).'
      : 'Weights are ignored for this graph type.';
  }

  // create a default graph when first creating a graph if not loaded from a csv file
  if (!graph.nodes.length && !graph.links.length) {
    graph.nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    graph.links = [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }];
  }

  //Populate ID datalist for edge editors
  refreshNodeIdDatalist();

  // Layout and initial camera
  applyLayoutForType();
  if (allHavePositions()) {
    // positions provided (CSV or saved)
    zoomToFit();
  }

  // renders the graph for the first time
  scheduleDraw();
  //capture the initial state for undo/redo functionality
  historyCapture('initial');
  undoBtn?.addEventListener('click', () => undo());
  redoBtn?.addEventListener('click', () => redo());
})();
