# Contributing to sql-optima

Thanks for helping improve this GitHub Action. Please also read the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Development setup

Requires Node.js 20+.

```bash
git clone https://github.com/ale94lko/sql-optima.git
cd sql-optima
npm ci
```

## Quality checks

```bash
npm test
npm run test:coverage
npm run build
```

After changing `src/` or lockfile dependencies, commit the rebuilt `dist/` in the same change. Consumers run the Action from `dist/index.js` without installing npm dependencies on their runners.

## Pull requests

1. Fork the repository and create a focused branch.
2. Keep changes small: one feature or fix per PR, with tests that pin the new behavior.
3. Link the PR to the related issue when applicable.
4. Fill out the pull request template.

## Dependabot updates

Dependabot opens weekly PRs for npm dependencies and GitHub Actions (see [`.github/dependabot.yml`](.github/dependabot.yml)).

Review flow:

1. Confirm CI on the Dependabot PR is green (`test.yml` jobs).
2. For **npm** PRs: skim the changelog / release notes for breaking changes; major bumps stay ungrouped so they land alone. After merging dependency changes that affect the runtime bundle, rebuild and commit `dist/` if the PR did not already include it.
3. For **Actions** PRs: prefer keeping `uses:` lines SHA-pinned with a `# vX.Y.Z` comment (Dependabot updates both). Reject unpinned mutable tags in new workflow steps.
4. Squash-merge when ready; close or comment if an update should be deferred.

## Reporting bugs and ideas

Use the [issue templates](https://github.com/ale94lko/sql-optima/issues/new/choose). Search existing issues first to avoid duplicates.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
