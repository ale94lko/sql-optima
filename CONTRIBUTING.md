# Contributing to sql-optima

Thanks for helping improve this GitHub Action. Please also read the [Code of Conduct](.github/CODE_OF_CONDUCT.md) and [GOVERNANCE.md](GOVERNANCE.md).

## Developer Certificate of Origin (DCO)

All non-trivial contributions must be submitted under the
[Developer Certificate of Origin](https://developercertificate.org/).
Sign your commits with:

```bash
git commit -s -m "Your message"
```

Pull requests without a `Signed-off-by:` line may be asked to amend before merge.

## Development setup

Requires Node.js 24+.

```bash
git clone https://github.com/ale94lko/sql-optima.git
cd sql-optima
npm ci
```

This installs dependencies and is enough to run tests and rebuild `dist/`.

For optional live Postgres analysis locally, copy `.env.example` → `.env`, set `DB_PASSWORD`, and run `docker compose up -d` (see [README — Local Development](README.md#local-development--building)).

## Coding standards

- JavaScript style is enforced by **ESLint** (`eslint.config.js`).
- Run `npm run lint` locally; CI fails on lint errors.
- Prefer small, focused PRs; match existing patterns in `src/`.
- Every `src/**/*.js` file must keep the SPDX / copyright header:
  `SPDX-License-Identifier: MIT` and `Copyright (c) … sql-optima contributors`.

## Code review

See [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) for how reviews are conducted, what must be checked, and how small tasks are labeled for new contributors. Default reviewers are listed in [`.github/CODEOWNERS`](.github/CODEOWNERS). Prefer requesting a review from a maintainer **other than the author** before merge.

## Testing policy (required)

As major new functionality is added, **automated tests MUST be added** to the
Vitest suite (`npm test` / `npm run test:coverage`). Pull requests that change
behavior without tests should explain why coverage is deferred and will usually
be asked to add tests before merge.

### Coverage thresholds (enforced)

`vitest.config.js` sets global floors on `src/` via `@vitest/coverage-v8` (OpenSSF Gold-aligned). If any metric is unmet, `npm run test:coverage` exits **non-zero** — the CI **`unit`** job runs that same command and fails the workflow.

| Metric | Minimum |
| :--- | ---: |
| statements | 90% |
| lines | 90% |
| functions | 90% |
| branches | 80% |

Do not lower these numbers to greenwash a PR; raise coverage (or the floor only when the suite sustains it). CI also prints the JSON summary and uploads `coverage/lcov.info` + `coverage/coverage-summary.json` as the `coverage-unit` artifact.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
```

After changing `src/` or lockfile dependencies, commit the rebuilt `dist/` JS bundle in the same change. Consumers run the Action from `dist/index.js` without installing npm dependencies on their runners. CI fails if tracked `dist/` files are stale (`git diff --exit-code dist` in the build job).

`dist/sql-wasm.js` and `dist/sql-wasm.wasm` are **generated** by `npm run build` (copied from `sql.js`) and are gitignored on `main` to keep OpenSSF Scorecard Binary-Artifacts clean. The release workflow force-adds both onto version tags so `uses: ale94lko/sql-optima@v1` still ships a complete Action. Local/CI jobs that use `uses: ./` must run `npm run build` first (integration jobs already do).

sql.js is intentionally **not** inlined into `dist/index.js` (ncc + Emscripten breaks with `Cannot set properties of undefined (setting 'exports')` under Node 24).

## Continuous integration

PR and `main` pushes run [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Job | Purpose |
| :--- | :--- |
| `unit` | `npm run test:coverage` — Vitest + coverage floors (see [Coverage thresholds](#coverage-thresholds-enforced)); no database services |
| `build` | `ncc` bundle + assert committed `dist/` is current |
| `lint` | ESLint (`npm run lint`) + `npm audit --audit-level=high` + [actionlint](https://github.com/rhysd/actionlint) for workflows |
| `typecheck` | `npm run typecheck` — TypeScript `checkJs` on `src/**/*.js` (JSDoc); fails on type drift |
| `integration` | Live Postgres + MySQL + SQL Server service containers; `scripts/run-integration.js` fails if mixed fixtures produce `issue_count=0` |
| `integration-*` | Per-engine Action runs against Postgres, MySQL, MariaDB, SQLite, SQL Server, and static BigQuery/Snowflake samples |

Security / supply-chain (separate workflows):

- GitHub **CodeQL** advanced setup ([`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) + [`.github/codeql/codeql-config.yml`](.github/codeql/codeql-config.yml)). The config excludes `dist/**` (ncc bundle) so CodeQL does not try to parse generated JS. Prefer advanced setup over default setup on this repo so `paths-ignore` is always applied.
- [`.github/workflows/scorecard.yml`](.github/workflows/scorecard.yml) — OpenSSF Scorecard

Tag releases stay on [`.github/workflows/release.yml`](.github/workflows/release.yml) (`contents: write` only on that job). Pushing `vX.Y.Z` creates the GitHub Release and moves the major floating tag (`vX`) for Marketplace consumers (`uses: ale94lko/sql-optima@v1`). Manual / API demos use [`.github/workflows/test.yml`](.github/workflows/test.yml) (`repository_dispatch` / `workflow_dispatch` only). Do **not** hardcode the latest semver in README / docs — link [releases/latest](https://github.com/ale94lko/sql-optima/releases/latest) (and update [CHANGELOG.md](CHANGELOG.md) only).

Workflows use least-privilege `permissions:` and SHA-pinned Actions with `# vX.Y.Z` comments.

The lint job’s `npm audit --audit-level=high` fails the PR on high/critical advisories. Prefer upgrading the dependency (or a Dependabot PR) over `npm audit --ignore`; only document a temporary exception in this file if a transitive finding cannot be fixed yet.

## Pull requests

1. Fork the repository and create a focused branch named after the issue:
   - Prefer `{type}/{issue}-{slug}` (e.g. `feat/66-readme-logo`, `ci/78-pr-metadata-validator`)
   - Or `{type}/{slug}-{issue}` (e.g. `chore/docker-compose-postgres-51`)
   - Allowed types: `feat`, `fix`, `docs`, `ci`, `chore`, `test`, `refactor`, `security`, `release`, `perf`, `build`, `style`
2. Use a Conventional Commits PR title (`feat: …`, `fix: …`, `ci: …`, …).
3. Sign off commits (DCO) with `git commit -s`.
4. Keep changes small: one feature or fix per PR, with tests that pin the new behavior.
5. Link the PR to the related issue (`Fixes #<issue>` in the body) so [issue-in-progress](.github/workflows/issue-in-progress.yml) can label and assign it.
6. Fill out the pull request template.

CI enforces branch + title rules via [pr-metadata-validator](https://github.com/ale94lko/pr-metadata-validator) (`.github/workflows/validate-pr-metadata.yml`).

## Dependabot updates

Dependabot opens weekly PRs for npm dependencies and GitHub Actions (see [`.github/dependabot.yml`](.github/dependabot.yml)).

Review flow:

1. Confirm CI on the Dependabot PR is green (`ci.yml` jobs: unit, build, lint, integrations).
2. For **npm** PRs: skim the changelog / release notes for breaking changes; major bumps stay ungrouped so they land alone. After merging dependency changes that affect the runtime bundle, rebuild and commit `dist/` if the PR did not already include it.
3. For **Actions** PRs: prefer keeping `uses:` lines SHA-pinned with a `# vX.Y.Z` comment (Dependabot updates both). Reject unpinned mutable tags in new workflow steps.
4. Squash-merge when ready; close or comment if an update should be deferred.

## Reporting bugs and ideas

Use the [issue templates](https://github.com/ale94lko/sql-optima/issues/new/choose). Search existing issues first to avoid duplicates.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
