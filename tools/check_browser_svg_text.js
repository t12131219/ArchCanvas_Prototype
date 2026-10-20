// Read-only browser evaluation, used with cua_repl on browser-review.html.
() => {
  const failures = [], results = [];
  const contains = (outer, inner) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  for (const article of document.querySelectorAll('article[data-case]')) {
    const name = article.dataset.case, svg = article.querySelector('svg');
    const nodes = [...svg.querySelectorAll('g.node[data-node-id]')];
    let nodeTexts = 0, portTexts = 0;
    for (const node of nodes) {
      // Operators and controls use circles/paths instead of rectangles.
      const shape = node.querySelector(':scope > rect, :scope > circle, :scope > ellipse, :scope > path');
      const rect = shape?.getBoundingClientRect();
      for (const text of node.querySelectorAll(':scope > text')) {
        nodeTexts++;
        const bounds = text.getBoundingClientRect();
        if (!rect || !bounds.width || !bounds.height || !contains(rect, bounds))
          failures.push({name, node: node.dataset.nodeId, text: text.textContent, kind: 'node-text-outside', rect: rect?.toJSON(), bounds: bounds.toJSON()});
      }
    }
    for (const label of svg.querySelectorAll('.paper-label')) {
      const rect = label.querySelector('rect')?.getBoundingClientRect();
      for (const text of label.querySelectorAll('text')) {
        portTexts++;
        const bounds = text.getBoundingClientRect();
        if (!rect || !bounds.width || !bounds.height || !contains(rect, bounds))
          failures.push({name, text: text.textContent, kind: 'port-text-outside'});
      }
    }
    results.push({name, node_texts: nodeTexts, nodes: nodes.length, paths: svg.querySelectorAll('path[data-edge-id]').length, port_texts: portTexts});
  }
  return {schema: 'branch-columns-browser-text/1', browser: 'Codex In-app Browser 2; actual SVG DOM bounding rectangles', render_report_sha256: document.querySelector('meta[name="inline-render-report-sha256"]').content, results, failures};
}
