// Read-only native browser SVG bounds; supports both paper and raw source UI.
() => {
  const failures = [], results = [];
  const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
  for (const article of document.querySelectorAll('article[data-case]')) {
    const name = article.dataset.case, svg = article.querySelector('svg');
    const nodes = [...svg.querySelectorAll('g.node[data-node-id], g.node[data-id]')];
    let nodeTexts = 0, portTexts = 0;
    for (const node of nodes) {
      const rect = node.querySelector(':scope > rect, :scope > circle, :scope > ellipse, :scope > path')?.getBoundingClientRect();
      for (const text of node.querySelectorAll(':scope > text')) {
        nodeTexts++;
        const bounds = text.getBoundingClientRect();
        if (!rect || !bounds.width || !bounds.height || !contains(rect, bounds))
          failures.push({name, node: node.getAttribute('data-node-id') || node.getAttribute('data-id'), text: text.textContent, kind: 'node-text-outside'});
      }
    }
    for (const label of svg.querySelectorAll('.paper-label')) {
      const rect = label.querySelector('rect')?.getBoundingClientRect();
      for (const text of label.querySelectorAll('text')) {
        portTexts++;
        const bounds = text.getBoundingClientRect();
        if (!rect || !bounds.width || !bounds.height || !contains(rect, bounds)) failures.push({name, text: text.textContent, kind: 'port-text-outside'});
      }
    }
    results.push({name, node_texts: nodeTexts, nodes: nodes.length, paths: svg.querySelectorAll('path[data-edge-id]').length, port_texts: portTexts});
  }
  return {schema: 'publication-browser-text/1', browser: 'Codex In-app Browser 2; actual SVG DOM bounding rectangles', render_report_sha256: document.querySelector('meta[name="inline-render-report-sha256"]').content, results, failures};
}
