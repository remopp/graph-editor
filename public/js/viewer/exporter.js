//this file manages exporting the current graph to a CSV file

import { exportBtn } from './dom.js';
import { graph } from './state.js';

//this function makes a cell value safe for CSV output
function csvCell(v) {
  return (v == null ? '' : String(v))
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, ' ');
}

// this builds a single-file CSV representation of the current graph
function buildSingleFileCSV() {
  // record,id,label,description,x,y,source,target,weight,type
  const includeWeight = (graph.type === 'force');
  const lines = ['record,id,label,description,x,y,source,target,weight,type'];

  const gType = (graph.type || '').toString().trim().toLowerCase() || 'force';
  lines.push([
    'meta',   // record
    '',       // id
    '',       // label
    '',       // description
    '',       // x
    '',       // y
    '',       // source
    '',       // target
    '',       // weight
    csvCell(gType) // type
  ].join(','));

  // node rows id, label, description, x, y
  const nodesSorted = [...(graph.nodes || [])].sort((a,b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })
  );

  for (const n of nodesSorted) {
    const id = csvCell(n.id);
    const label = csvCell(n.label || '');
    const desc = csvCell(n.description || ''); // keep description
    const x = Number.isFinite(n.x) ? n.x : '';
    const y = Number.isFinite(n.y) ? n.y : '';
    lines.push([
      'node',
      id, label, desc, x, y,
      '', '', '', '' // source,target,weight,type
    ].join(','));
  }

  // handle edges source, target, weight
  for (const e of (graph.links || [])) {
    const s = typeof e.source === 'object' ? e.source?.id : e.source;
    const t = typeof e.target === 'object' ? e.target?.id : e.target;
    if (!s || !t) continue;

    let w = '';
    if (includeWeight && e.weight != null && Number.isFinite(Number(e.weight))) {
      w = String(Number(e.weight));
    }

    lines.push([
      'edge',        // record
      '', '', '', '',// id,label,description,x
      '',            // y
      csvCell(s),    // source
      csvCell(t),    // target
      w,             // weight
      ''             // type
    ].join(','));
  }

  return lines.join('\n');
}

// this function triggers a download of a text file with the given name, mime type, and content
function downloadText(filename, mime, text) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// this function sets up the export button to download the current graph as a CSV file
export function setupExporter() {
  if (!exportBtn) return;
  exportBtn.addEventListener('click', () => {
    const csv = buildSingleFileCSV();

    // filename from title
    const safeTitle = (graph.title || 'graph')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${safeTitle || 'graph'}_single.csv`;

    downloadText(filename, 'text/csv;charset=utf-8', csv);
  });
}
