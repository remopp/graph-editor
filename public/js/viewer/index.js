//this is the main entry point for the graph viewer application. It initializes the application, loads the graph data, sets up the UI, and starts rendering the graph.

import {
  titleEl, typeBadge, logoutBtn, edgeW, edgeNote, undoBtn, redoBtn, searchInput, searchBtn, searchCount, exportPngBtn 
} from './dom.js';

import { graph, setSelectedNodeValue, scheduleDraw, historyCapture, undo, redo, setSelection} from './state.js';

import {
  resizeCanvas, zoomToFit,downloadPNG 
} from './render.js';

import {
  setupZoomAndDrag,
} from './interaction.js';

import {
  applyLayoutForType, allHavePositions,
} from './layouts.js';

import {
  setupGraphOps, refreshNodeIdDatalist,
  normalizeLinks, dedupeLinksInPlace, setSelectedNode
} from './graphOps.js';

import {
  setupExporter,
} from './exporter.js';

import {
  apiGet, apiHandleAuthError, apiClearAuth,
} from '../api.js';

import { setupPersistence 
} from './persistence.js';

import { shortestPath, clearPathHighlight } from './analytics.js';

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
  // setup the shortest path UI
  setupShortestPathUI() ;
  
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

  //this updates the shortest path UI to be usable only for the force-directed graph type
  updateShortestPathInteractivity();

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

// this function is for the shortest path UI setup
function setupShortestPathUI() {
  const runBtn = document.getElementById('runShortestPathBtn');
  const clearBtn = document.getElementById('clearShortestPathBtn');
  const srcInput = document.getElementById('spSrc');
  const dstInput = document.getElementById('spDst');
  const resultEl = document.getElementById('spResult');

  if (!runBtn) return; // page not loaded or old HTML

  runBtn.addEventListener('click', () => {
    const src = srcInput.value.trim();
    const dst = dstInput.value.trim();
    const r = shortestPath(src, dst);
    if (!r.ok) {
      resultEl.textContent = r.msg || 'Error';
      return;
    }
    const edgesCount = r.edges.length;
    const nodesCount = r.nodes.length;
    resultEl.textContent = `Path length (total weight): ${r.total} — ${edgesCount} edge(s), ${nodesCount} node(s).`;
  });

  clearBtn.addEventListener('click', () => {
    clearPathHighlight();
    resultEl.textContent = '';
    srcInput.value = '';
    dstInput.value = '';
  });
}

//this function toggles the shortest path inputs/buttons depending on the current graph type
function updateShortestPathInteractivity() {
  const isForce = (graph.type === 'force');

  const src = document.getElementById('spSrc');
  const dst = document.getElementById('spDst');
  const run = document.getElementById('runShortestPathBtn');
  const clr = document.getElementById('clearShortestPathBtn');
  const result = document.getElementById('spResult');
  const hint = document.getElementById('spHint');

  if (!src || !dst || !run || !clr || !result || !hint) return;

  //this disables or enables the form controls
  src.disabled = !isForce;
  dst.disabled = !isForce;
  run.disabled = !isForce;

  //this keeps Clear enabled so users can clear an old highlight even after switching types
  clr.disabled = false;

  //this updates helper text so users understand why Analyze is disabled
  hint.textContent = isForce
    ? ''
    : 'Shortest path is only available for the force-directed graph type.';

  //this clears any previous result when type changes away from force
  if (!isForce) result.textContent = '';
}

// SEARCH
function runSearch() {
  const q = (searchInput?.value || '').trim().toLowerCase();

  if (!q) {
    setSelection([]);
    setSelectedNodeValue?.(null);
    if (searchCount) searchCount.textContent = '';
    scheduleDraw();
    return;
  }

  const nodes = graph.nodes || [];
  const matches = nodes.filter(n =>
    String(n.id).toLowerCase().includes(q) ||
    String(n.label || '').toLowerCase().includes(q)
  );
  const ids = matches.map(n => n.id);

  if (!ids.length) {
    setSelection([]);
    setSelectedNodeValue?.(null);
    if (searchCount) searchCount.textContent = '0';
    scheduleDraw();
    return;
  }

  // Select all matches and focus the first (behaves like normal selection)
  setSelection(ids);
  const first = matches[0];
  setSelectedNodeValue?.(first);
  if (searchCount) searchCount.textContent = `${ids.length} match${ids.length > 1 ? 'es' : ''}`;

  // Optional: center/zoom to the first match
  if (first && Number.isFinite(first.x) && Number.isFinite(first.y)) {
    const pad = 60;
    const orig = graph.nodes;
    graph.nodes = [{ x: first.x, y: first.y }, { x: first.x + 1, y: first.y + 1 }];
    zoomToFit(pad);
    graph.nodes = orig;
  }

  scheduleDraw();
}

// events
searchBtn?.addEventListener('click', () => runSearch());
searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});
exportPngBtn?.addEventListener('click', () => {
  const safeTitle = (graph.title || 'graph').replace(/[^\w\-]+/g, '_');
  const date = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  downloadPNG(`${safeTitle}_${date}.png`);
});
