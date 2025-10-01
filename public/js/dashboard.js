//this file handles the dashboard page
import { apiGet, apiPost, apiPut, apiFetch, apiHandleAuthError, apiClearAuth } from './api.js';
// here the program starts 
(async function init() {
  const me = await apiGet('/api/me');
  if (me.error) return apiHandleAuthError(me);
  document.getElementById('me').textContent = `@${me.username}`;
  document.getElementById('logoutBtn').onclick = () => { apiClearAuth(); location.href = './login.html'; };

  document.getElementById('createBtn').onclick = onCreate;

  await loadTables();
})();
// this function loads the tables of owned and shared graphs
async function loadTables() {
  const data = await apiGet('/api/graphs');
  if (data.error) return apiHandleAuthError(data);
  fillTable('ownedTbl', data.owned, true);
  fillTable('sharedTbl', data.shared, false);
}
// this function fills a table body with rows of graphs, adding buttons and handlers as needed
function fillTable(tblId, rows, owned) {
  const tbody = document.querySelector(`#${tblId} tbody`);
  tbody.innerHTML = '';
  for (const g of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(g.title || '')}</td>
      <td><span class="badge">${g.type || ''}</span></td>
      <td>${g.updatedAt ? new Date(g.updatedAt).toLocaleString() : ''}</td>
      <td>
        <a href="./viewer.html#${g._id}"><button>Open</button></a>
        ${owned ? `
          <button class="secondary shareBtn" data-id="${g._id}">Share</button>
          <button class="secondary deleteBtn" data-id="${g._id}">Delete</button>
        ` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  }

  // this is the share handler (owner only)
  tbody.querySelectorAll('.shareBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const username = prompt('Share with username:');
      if (!username) return;
      const res = await apiPost(`/api/graphs/${id}/share`, { username });
      if (res.error) return alert(res.error);
      alert('Shared!');
    });
  });

  // delete handlers (owner only)
  tbody.querySelectorAll('.deleteBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const ok = confirm('Delete this graph? This removes it for anyone it was shared with.');
      if (!ok) return;

      // use the low-level fetch helper
      const resp = await apiFetch(`/api/graphs/${id}`, { method: 'DELETE' });
      if (!resp.ok) {
        let msg = 'Delete failed';
        try { const j = await resp.json(); if (j?.error) msg = j.error; } catch {}
        alert(msg);
        return;
      }
      await loadTables();
    });
  });
}
// prevents html injection in text
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
// this function reads csv text into { headers, rows:[{ col:val, ...}, ...] }
function simpleCsvParse(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}
// parses a number, returns null if invalid
function parseNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// this builds a graph from a single CSV file's text
function csvOneFileToGraph(text, expectedType) {
  const { headers, rows } = simpleCsvParse(text);
  const need = name => headers.includes(name);
  const errors = [];
  const warnings = [];

  if (!need('record')) errors.push('Missing required column: "record".');

  const nodes = [];
  const links = [];
  const nodeById = new Map();
  let fileType = null;

  for (const r of rows) {
    const kind = (r.record || '').toLowerCase();

    if (kind === 'meta') {
      const t = (r.type || '').toLowerCase();
      if (!t) { errors.push('meta row must include "type".'); continue; }
      if (!['force','grid','circle','hierarchy'].includes(t)) {
        errors.push(`Unknown graph type in meta row: "${t}".`);
      }
      fileType = t;
      continue;
    }

    if (kind === 'node') {
      const id = (r.id || '').trim();
      if (!id) { errors.push('node row missing "id".'); continue; }

      const n = { id };
      if (r.label && r.label.trim()) n.label = r.label.trim();
      if (need('x') && need('y')) {
        const x = parseNumber(r.x), y = parseNumber(r.y);
        if (x != null && y != null) { n.x = x; n.y = y; }
        else if ((r.x ?? r.y) && (x == null || y == null)) {
          warnings.push(`node "${id}": invalid x/y ignored`);
        }
      }

      if (nodeById.has(id)) {
        warnings.push(`duplicate node id "${id}" – keeping the first`);
      } else {
        nodeById.set(id, n); nodes.push(n);
      }
      continue;
    }

    if (kind === 'edge') {
      const s = (r.source || '').trim();
      const t = (r.target || '').trim();
      if (!s || !t) { errors.push('edge row must have "source" and "target".'); continue; }

      const e = { source: s, target: t };
      if (need('weight') && r.weight !== '') {
        const w = parseNumber(r.weight);
        if (w == null) warnings.push(`edge ${s}->${t}: invalid weight ignored`);
        else e.weight = w;
      }
      links.push(e);
      continue;
    }

    if (kind) warnings.push(`unknown record kind "${kind}" ignored`);
  }

  if (!fileType) errors.push('CSV must include one meta row with type (force|grid|circle|hierarchy).');
  if (fileType && expectedType && fileType !== expectedType) {
    errors.push(`Selected type "${expectedType}" does not match CSV meta type "${fileType}".`);
  }

  for (const e of links) {
    if (!nodeById.has(e.source)) errors.push(`edge references missing node: ${e.source}`);
    if (!nodeById.has(e.target)) errors.push(`edge references missing node: ${e.target}`);
  }

  if (fileType && fileType !== 'force') {
    const hasAnyWeight = links.some(e => e.weight != null);
    if (hasAnyWeight) errors.push(`Weights are only allowed when type=force (CSV says type="${fileType}").`);
  }

  // Dedupe edges (keep last)
  const seen = new Set();
  for (let i = links.length - 1; i >= 0; i--) {
    const k = `${links[i].source}->${links[i].target}`;
    if (seen.has(k)) links.splice(i, 1);
    else seen.add(k);
  }

  return { type: fileType || expectedType, nodes, links, errors, warnings };
}

// the create button handler
async function onCreate() {
  const title = document.getElementById('newTitle').value.trim();
  const selectedType = document.getElementById('newType').value;
  const file = document.getElementById('csvCreate').files[0];
  if (!title) return alert('Please enter a title');
  if (!selectedType) return alert('Please select a type');

  let nodes = [];
  let links = [];
  let finalType = selectedType;

  if (file) {
    const text = await file.text();
    const { type, nodes: n, links: l, errors, warnings } = csvOneFileToGraph(text, selectedType);

    if (warnings?.length) console.warn('CSV warnings:\n' + warnings.join('\n'));
    if (errors?.length)    return alert('CSV errors:\n' + errors.join('\n'));

    finalType = type || selectedType;
    nodes = n;
    links = l;
  }

  const body = { title, type: finalType, ...(nodes.length || links.length ? { nodes, links } : {}) };
  const res = await apiPost('/api/graphs', body);
  if (res.error) return alert(res.error);

  document.getElementById('newTitle').value = '';
  document.getElementById('csvCreate').value = '';
  await loadTables();
}
