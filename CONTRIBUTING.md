# Contributing to sql-optima

Thanks for helping improve this GitHub Action. Please also read the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Development setup

Requires Node.js 24+.

```bash
git clone https://github.com/ale94lko/sql-optima.git
cd sql-optima
npm ci
```

## Quality checks

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

After changing `src/` or lockfile dependencies, commit the rebuilt `dist/` JS bundle in the same change. Consumers run the Action from `dist/index.js` without installing npm dependencies on their runners. CI fails if tracked `dist/` files are stale (`git diff --exit-code dist` in the build job).

`dist/sql-wasm.wasm` is **generated** by `npm run build` (copied from `sql.js`) and is gitignored on `main` to keep OpenSSF Scorecard Binary-Artifacts clean. The release workflow force-adds the wasm onto version tags so `uses: ale94lko/sql-optima@v1` still ships a complete Action. Local/CI jobs that use `uses: ./` must run `npm run build` first (integration jobs already do).

## Continuous integration

PR and `main` pushes run [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Job | Purpose |
| :--- | :--- |
| `unit` | Vitest + coverage (no database services) |
| `build` | `ncc` bundle + assert committed `dist/` is current |
| `lint` | ESLint (`npm run lint`) + [actionlint](https://github.com/rhysd/actionlint) for workflows |
| `integration-*` | Live Action runs against Postgres, MySQL, MariaDB, SQLite, SQL Server, and static BigQuery/Snowflake samples |

Security / supply-chain (separate workflows):

- GitHub **CodeQL** default code scanning (config: [`.github/codeql/codeql-config.yml`](.github/codeql/codeql-config.yml); avoids conflicting with an advanced workflow)
- [`.github/workflows/scorecard.yml`](.github/workflows/scorecard.yml) — OpenSSF Scorecard

Tag releases stay on [`.github/workflows/release.yml`](.github/workflows/release.yml) (`contents: write` only on that job). Pushing `vX.Y.Z` creates the GitHub Release and moves the major floating tag (`vX`) for Marketplace consumers (`uses: ale94lko/sql-optima@v1`). Manual / API demos use [`.github/workflows/test.yml`](.github/workflows/test.yml) (`repository_dispatch` / `workflow_dispatch` only).

Workflows use least-privilege `permissions:` and SHA-pinned Actions with `# vX.Y.Z` comments.

## Pull requests

1. Fork the repository and create a focused branch.
2. Keep changes small: one feature or fix per PR, with tests that pin the new behavior.
3. Link the PR to the related issue when applicable.
4. Fill out the pull request template.

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
