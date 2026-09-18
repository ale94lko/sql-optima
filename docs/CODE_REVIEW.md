# Code review standards

## When review is required

- Every change to `main` MUST go through a pull request (branch protection).
- CI (`unit`, `build`, `lint`, and relevant integration jobs) MUST be green before merge.
- At least **50% of proposed modifications** MUST be reviewed before release by a person **other than the author** (OpenSSF Best Practices Gold `two_person_review`). In practice:
  - Community and Dependabot PRs are reviewed by a maintainer other than the author before merge.
  - Maintainer PRs request review from the other maintainer listed in [`.github/CODEOWNERS`](../.github/CODEOWNERS) when they are available.
- Evidence: non-author approval on contributor PRs such as [#56](https://github.com/ale94lko/sql-optima/pull/56) (author [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo), review by [@ale94lko](https://github.com/ale94lko)).

## What reviewers check

1. **Correctness** — Does the change do what the PR claims? Edge cases covered?
2. **Tests** — New/changed behavior has Vitest coverage; `npm test` / CI green.
3. **Security** — No secrets; SQL apply path still respects the dangerous-statement allowlist; workflow permissions stay least-privilege; Actions remain SHA-pinned.
4. **Style** — ESLint clean; matches existing `src/` patterns; DCO `Signed-off-by` present.
5. **Docs / dist** — User-facing changes update README/CHANGELOG as needed; `dist/` rebuilt when `src/` or lockfile changes.

## Acceptable to merge

- Approval from a reviewer other than the author (CODEOWNERS), **or** for Dependabot/automation PRs, maintainer review of the bot-authored diff.
- Squash-merge preferred; link related issues.

## Small tasks for new contributors

Issues labeled [`good first issue`](https://github.com/ale94lko/sql-optima/labels/good%20first%20issue) and [`help wanted`](https://github.com/ale94lko/sql-optima/labels/help%20wanted) are intentionally scoped for new or casual contributors (docs typos, extra fixtures, small lint rules, test gaps).
