// Graph-level checks complement the per-edge source and geometry validator.
const overlaps=graph=>globalThis.SummaryEngine.layoutConflicts(graph);
module.exports={overlaps};
