# Roadmap

What sql-optima intends to do (and not do) over the next year.

## Next 12 months

- Keep CI, CodeQL, Scorecard, and Dependabot green on `main`.
- Keep the maintainer bus factor at **2+** ([@ale94lko](https://github.com/ale94lko) and [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)) and continue two-person review on community, Dependabot, and maintainer PRs.
- Expand dialect fixtures and regression tests as engines evolve.
- Keep Marketplace `@v1` floating tag current with semver releases ([latest release](https://github.com/ale94lko/sql-optima/releases/latest)).

## Explicitly out of scope (near term)

- Becoming a hosted SaaS analyzer (this project stays a GitHub Action + library-style `src/`).
- Replacing database vendors’ own advisors / query stores.
- Automatic rewrite/apply of production migrations without human review.
- Supporting every proprietary warehouse dialect beyond static lint where noted in the README.

## Longer-term ideas (uncommitted)

- Optional SARIF upload for findings.
- Richer EXPLAIN visualizations in the Job Summary.
- Fuzzing for the SQL splitter / allowlist edge cases.
