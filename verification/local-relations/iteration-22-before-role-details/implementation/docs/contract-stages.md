# Certified local role stages

The canvas `roles` frontier can now form a reversible presentation region from
an existing certificate's **subset of operation roles**. The first recipe is the
addition followed directly by post-normalization in a certified residual. It
works for vector and convolutional compositions, regardless of model names.
Transformer is an evaluation input, never a production selector.

The stage shows `Add & Norm` and the actual normalization type. Only the addition
and normalization move into the presentation region. The branch, its dropout,
shared source and any attention/convolution/other computation remain outside.
The original certificate stays attached to its canonical output node and keeps
its complete proof scope; the stage does not become a new certificate.

The recipe requires compatible sibling operations, an exact direct dependency,
a single use of the addition result, two distinct certified skip/branch operands
and matching result slots. Conditions, unknown/mutable operations, identity and
observation boundaries prevent the affected stage. Non-value effects and
incompatible resource reads also prevent it. Aliased or indirect intermediate
paths conservatively retain their existing expression. Other independent tails
can still form stages in the same graph. Prenorm is not relabeled as postnorm.

Each stage records the canonical members, original cuts and operand/result-slot
bindings. The projection preserves each cut's edge identity and destination
operand. A certified skip can route to the folded stage when its actual producer remains exposed or is the exact output role of another
certified stage. The stage references the final constraint receipt rather than
copying its preliminary status; a reserved lane can still conflict with final
routing. Hiding two operations never fulfills their atomic expression goals.

Automatic role detail stops at this local stage. Manual expansion reveals the
original operations. Saved/reopened documents and refolding retain the canonical
IR and bindings. The editor's “expand all” combines the original plan index with
the current presentation index, so attached source ownership cannot omit source
wrappers or synthetic stage children. Print and other presets keep their prior
contracts. `paperContractStages:false` disables the recipe for evaluation.

The new recipe lives in `semantic_studio/contract-stages.js`. Subsequent recipes
should use independently certified roles and the same cut/ownership protocol;
this change does not justify interpreting arbitrary adjacent operators as a
semantic stage.

Reproduce the evidence from this directory:

```sh
python3 tools/check_stage_fixture_extraction.py
python3 tools/run_local_tests.py
node tools/audit_local_expressions.cjs --stages
python3 tools/audit_local_svg.py --stages
python3 tools/build_inline_review.py --stages
```

The render producer validates its frozen implementation snapshot. For an input
and state already in that snapshot's prior report, it copies the exact hashed
prior SVG/document and records provenance; new baseline inputs execute the
archived renderer. Historical evidence is neither regenerated nor resealed.

Use the real editor to inspect, unfold, save, reopen, refold and expand all;
`tools/audit_stage_ui.cjs` re-renders those exports and checks their bindings.
Then record actual browser text bounds and visual observations, and run
`python3 tools/summarize_publication_checks.py`. Its exit code remains 2 while
the broader goal is unfinished.

The stage moves the intermediate frontier toward architecture-level expression.
It does not establish reference-frontier equivalence or complete adaptive
selection. Residual capture points, whole-graph context organization, overlap
handling beyond compatible sibling cuts and dense view readability still need
work. Review height, width and crossings alongside semantics; fewer visible
nodes alone are not proof of a better diagram.

Follow-up: [stage stability](stage-stability.md) separates automatic evidence
detail from stage grouping and retains measured canvas layout after manual
unfolding. The original stage evidence above remains historical.
