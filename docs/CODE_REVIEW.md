# Code review standards

## When review is required

- Every change to `main` MUST go through a pull request (branch protection).
- CI (`unit`, `build`, `lint`, and relevant integration jobs) MUST be green before merge.
- For OpenSSF Best Practices **Gold**, at least **50% of proposed modifications** SHOULD be reviewed by a person **other than the author** before release. Recruiting a second maintainer/reviewer is required to meet that bar continuously (see [GOVERNANCE.md](../GOVERNANCE.md)).

## What reviewers check

1. **Correctness** — Does the change do what the PR claims? Edge cases covered?
2. **Tests** — New/changed behavior has Vitest coverage; `npm test` / CI green.
3. **Security** — No secrets; SQL apply path still respects the dangerous-statement allowlist; workflow permissions stay least-privilege; Actions remain SHA-pinned.
4. **Style** — ESLint clean; matches existing `src/` patterns; DCO `Signed-off-by` present.
5. **Docs / dist** — User-facing changes update README/CHANGELOG as needed; `dist/` rebuilt when `src/` or lockfile changes.

## Acceptable to merge

- Approval (when a second reviewer is available) **or**, while bus factor is 1, maintainer self-merge only after the checklist above is satisfied and CI is green.
- Squash-merge preferred; link related issues.

## Small tasks for new contributors

Issues labeled [`good first issue`](https://github.com/ale94lko/sql-optima/labels/good%20first%20issue) and [`help wanted`](https://github.com/ale94lko/sql-optima/labels/help%20wanted) are intentionally scoped for new or casual contributors (docs typos, extra fixtures, small lint rules, test gaps).
