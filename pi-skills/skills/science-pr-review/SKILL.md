---
name: science-pr-review
description: add the science-model Stage 0-5 lifecycle policy to skipper-review or skipper-review-deep. use only alongside those skills when reviewing a science-model pull request, assessing stage readiness, or performing a final merge check.
---

# Science PR Review

Use this skill only as an addition to `skipper-review` or
`skipper-review-deep`. Those skills own the review workflow, findings, output,
and verification. This skill supplies the science-model maturity policy.

## Lifecycle references

Read [the lifecycle](references/review-lifecycle.md) and only the reference for
the selected stage:

- [Stage 0 - Prototype](references/stage-0-prototype.md)
- [Stage 1 - Structural Design](references/stage-1-structural-design.md)
- [Stage 2 - Restructuring](references/stage-2-restructuring.md)
- [Stage 3 - Implementation Refinement](references/stage-3-implementation-refinement.md)
- [Stage 4 - Polishing](references/stage-4-polishing.md)
- [Stage 5 - Final Review and Merge](references/stage-5-final-merge.md)

The selected stage determines what blocks progression and what is deferred.
Scientific correctness remains the responsibility of a scientific reviewer;
technical review verifies only the evidence of that review.
