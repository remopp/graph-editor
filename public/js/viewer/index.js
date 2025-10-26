//this is the main entry point for the graph viewer application. it initializes the application, loads the graph data, sets up the ui, and starts rendering the graph.

import {
  titleEl, typeBadge, logoutBtn, edgeW, edgeNote, undoBtn, redoBtn,
  searchInput,
  searchCount, exportPngBtn, saveBtn
} from './dom.js';

import { graph, setSelectedNodeValue, scheduleDraw, historyCapture, undo, redo, setSelection } from './state.js';
import { resizeCanvas, zoomToFit, downloadPNG } from './render.js';
import { setupZoomAndDrag } from './interaction.js';
import { applyLayoutForType, allHavePositions } from './layouts.js';
import { setupGraphOps, refreshNodeIdDatalist, normalizeLinks, dedupeLinksInPlace } from './graphOps.js';
import { setupExporter } from './exporter.js';
import { apiGet, apiHandleAuthError, apiClearAuth } from '../api.js';
import { setupPersistence } from './persistence.js';
import { shortestPath, clearPathHighlight, degreeCentrality, pageRank } from './analytics.js';

(async function init() {
  //this reads the graph id from the url hash
  const currentGraphId = location.hash.slice(1);
  if (!currentGraphId) {
    alert('No graph id in URL.');
    location.href = './dashboard.html';
    return;
  }

  //this wires the logout button to clear auth and go to login
  if (logoutBtn) {
    logoutBtn.onclick = () => { apiClearAuth(); location.href = './login.html'; };
  }

  //this prepares canvas and ui before data loads
  resizeCanvas();
  setupZoomAndDrag();
  setupGraphOps();
  setupExporter();
  setupPersistence();
  setupShortestPathUI();
  setupSearchUI();
  setupAnalyticsUI();

  //this redraws on window resize (keeps hidpi correct)
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (allHavePositions()) scheduleDraw();
  });

  //this loads the graph data
  const data = await apiGet(`/api/graphs/${currentGraphId}`);
  if (data.error) return apiHandleAuthError(data);

  //this sets up the graph object from loaded data
  graph.nodes = (data.nodes || []).map(n => ({ ...n }));
  graph.links = (data.links || []).map(l => ({ ...l }));
  graph.type  = data.type  || 'force';
  graph.title = data.title || '';

  normalizeLinks();
  dedupeLinksInPlace();

  //this updates title and type badge in the ui
  if (titleEl)   titleEl.textContent = `Graph Viewer — ${graph.title}`;
  if (typeBadge) typeBadge.textContent = graph.type;

  //this enables edge weights for force graphs, disables otherwise
  const isForce = (graph.type === 'force');
  if (edgeW) edgeW.disabled = !isForce;
  if (edgeNote) {
    edgeNote.textContent = isForce
      ? 'Weight is optional; used by the force layout.'
      : 'Weights are ignored for this graph type.';
  }

  //this disables save in read only mode (viewer role)
  if (data.access === 'viewer' && saveBtn) {
    saveBtn.disabled = true;
    saveBtn.title = 'You have viewer access (read-only)';
  }

  //this shows shortest path ui as enabled only for force type
  updateShortestPathInteractivity();

  //this creates a tiny default graph if nothing is loaded
  if (!graph.nodes.length && !graph.links.length) {
    graph.nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    graph.links = [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }];
  }

  //this populates the datalist used by editors and inputs
  refreshNodeIdDatalist();

  //this applies layout and fits camera if positions exist
  applyLayoutForType();
  if (allHavePositions()) zoomToFit();

  //this renders the graph initially and captures history
  scheduleDraw();
  historyCapture('initial');

  //this wires undo/redo controls
  undoBtn?.addEventListener('click', () => undo());
  redoBtn?.addEventListener('click', () => redo());
  
  // keyboard shortcuts: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo
  window.addEventListener('keydown', (e) => {
    // don’t steal keys while typing in inputs,textareas or contenteditable
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;

    const mod = e.ctrlKey || e.metaKey;
    const isZ = (e.key || '').toLowerCase() === 'z';
    if (!mod || !isZ) return;

    e.preventDefault();
    if (e.shiftKey) {
      // Ctrl/Cmd+Shift+Z to redo
      redo();
    } else {
      // Ctrl/Cmd+Z to undo
      undo();
    }
  });
})();

//this sets up the shortest path ui controls
function setupShortestPathUI() {
  const runBtn = document.getElementById('runShortestPathBtn');
  const clearBtn = document.getElementById('clearShortestPathBtn');
  const srcInput = document.getElementById('spSrc');
  const dstInput = document.getElementById('spDst');
  const resultEl = document.getElementById('spResult');

  if (!runBtn) return;

  runBtn.addEventListener('click', () => {
    const src = srcInput.value.trim();
    const dst = dstInput.value.trim();
    const r = shortestPath(src, dst, graph);
    if (!r || !r.ok) {
      resultEl.textContent = r?.msg || 'no path';
      return;
    }
    resultEl.textContent = `Path length (total weight): ${r.total} — ${r.edges.length} edge(s), ${r.nodes.length} node(s).`;
  });

  clearBtn.addEventListener('click', () => {
    clearPathHighlight();
    resultEl.textContent = '';
    srcInput.value = '';
    dstInput.value = '';
  });
}

//this enables or disables shortest path inputs based on the current graph type
function updateShortestPathInteractivity() {
  const isForce = (graph.type === 'force');

  const src = document.getElementById('spSrc');
  const dst = document.getElementById('spDst');
  const run = document.getElementById('runShortestPathBtn');
  const clr = document.getElementById('clearShortestPathBtn');
  const result = document.getElementById('spResult');
  const hint = document.getElementById('spHint');

  if (!src || !dst || !run || !clr || !result || !hint) return;

  src.disabled = !isForce;
  dst.disabled = !isForce;
  run.disabled = !isForce;
  clr.disabled = false;

  hint.textContent = isForce ? '' : 'Shortest path is only available for the force-directed graph type.';
  if (!isForce) result.textContent = '';
}

//this wires the search dropdown menu and runs the search based on id/label checkboxes
function setupSearchUI() {
  const execBtn = document.getElementById('searchExecBtn');
  const dd = document.getElementById('searchDropdown');
  const inId = document.getElementById('searchInId');
  const inLabel = document.getElementById('searchInLabel');

  execBtn?.addEventListener('click', () => {
    runSearch();
    dd?.removeAttribute('open');
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
      dd?.removeAttribute('open');
    }
  });

  const ensureOneChecked = () => {
    if (!inId || !inLabel) return;
    if (!inId.checked && !inLabel.checked) { inId.checked = true; inLabel.checked = true; }
  };
  inId?.addEventListener('change', ensureOneChecked);
  inLabel?.addEventListener('change', ensureOneChecked);
}

//this executes a search over nodes using the input and selected scopes
function runSearch() {
  const q = (searchInput?.value || '').trim().toLowerCase();
  const useId = !!document.getElementById('searchInId')?.checked;
  const useLabel = !!document.getElementById('searchInLabel')?.checked;

  if (!q) {
    setSelection([]);
    setSelectedNodeValue?.(null);
    if (searchCount) searchCount.textContent = '';
    scheduleDraw();
    return;
  }

  const nodes = graph.nodes || [];
  const matches = nodes.filter(n => {
    const idStr = String(n.id).toLowerCase();
    const labelStr = String(n.label || '').toLowerCase();
    return (useId && idStr.includes(q)) || (useLabel && labelStr.includes(q));
  });

  const ids = matches.map(n => n.id);

  if (!ids.length) {
    setSelection([]);
    setSelectedNodeValue?.(null);
    if (searchCount) searchCount.textContent = '0';
    scheduleDraw();
    return;
  }

  setSelection(ids);
  const first = matches[0];
  setSelectedNodeValue?.(first);
  if (searchCount) searchCount.textContent = `${ids.length} match${ids.length > 1 ? 'es' : ''}`;

  if (first && Number.isFinite(first.x) && Number.isFinite(first.y)) {
    const pad = 60;
    const orig = graph.nodes;
    graph.nodes = [{ x: first.x, y: first.y }, { x: first.x + 1, y: first.y + 1 }];
    zoomToFit(pad);
    graph.nodes = orig;
  }

  scheduleDraw();
}

//this downloads a png using the graph title and date in the filename
exportPngBtn?.addEventListener('click', () => {
  const safeTitle = (graph.title || 'graph').replace(/[^\w\-]+/g, '_');
  const date = new Date().toISOString().slice(0,10);
  downloadPNG(`${safeTitle}_${date}.png`);
});

//degree and pagerank analytics ui setup

function setupAnalyticsUI() {
  const runDegBtn = document.getElementById('runDegreeBtn');
  const degModeEl = document.getElementById('degMode');
  const degOut = document.getElementById('degOut');

  const runPrBtn = document.getElementById('runPageRankBtn');
  const prDampEl = document.getElementById('prDamp');
  const prIterEl = document.getElementById('prIter');
  const prOut = document.getElementById('prOut');

  if (runDegBtn) {
    runDegBtn.onclick = () => {
      const mode = (degModeEl?.value || 'total');
      const res = degreeCentrality(mode, graph).sort((a,b)=>b.score-a.score);
      degOut.textContent = res.length ? res.map(r => `${r.id}: ${r.score}`).join('\n') : '(no nodes)';
    };
  }

  if (runPrBtn) {
    runPrBtn.onclick = () => {
      const d = Math.max(0, Math.min(1, parseFloat(prDampEl?.value || '0.85')));
      const iters = Math.max(1, parseInt(prIterEl?.value || '50', 10));
      const res = pageRank({ d, maxIter: iters }, graph).sort((a,b)=>b.score-a.score);
      prOut.textContent = res.length ? res.map(r => `${r.id}: ${r.score.toFixed(4)}`).join('\n') : '(no nodes)';
    };
  }
}
