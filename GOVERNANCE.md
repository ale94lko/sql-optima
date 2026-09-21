# Governance

This document describes how **sql-optima** makes decisions and who is responsible for what.

## Model

sql-optima uses a **maintainer-led** model:

- Day-to-day technical decisions are made by the project maintainers via pull requests on GitHub.
- Community input is welcome through [Issues](https://github.com/ale94lko/sql-optima/issues) and pull requests.
- Breaking changes, license changes, and security policy changes require an explicit maintainer decision recorded in a PR or issue.

## Decision process

1. Propose a change via issue and/or pull request.
2. Automated CI must pass (see [CONTRIBUTING.md](CONTRIBUTING.md)).
3. A maintainer **other than the author** reviews the PR when one is available (see [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) and [`.github/CODEOWNERS`](.github/CODEOWNERS)).
4. A maintainer merges (squash-merge preferred).
5. Releases are created by pushing semver tags (`vX.Y.Z`), which trigger [`.github/workflows/release.yml`](.github/workflows/release.yml).

## Roles and responsibilities

| Role | Responsibilities | Current holders |
| :--- | :--- | :--- |
| **Maintainer** | Merge PRs, triage issues, cut releases, respond to security reports, update Dependabot/CI | [@ale94lko](https://github.com/ale94lko) (Fidel Alejandro Fernández Arias); [@leoflavio1989](https://github.com/leoflavio1989) |
| **Contributor** | Propose changes via PR; follow DCO and coding standards | Anyone submitting a signed-off PR |
| **Security contact** | Receive and coordinate private vulnerability reports | Maintainers (see [SECURITY.md](SECURITY.md)) |

## Access continuity

If a maintainer is unavailable:

- Remaining maintainers keep repository administration, release tagging, and secret/token rotation.
- Repository administration, release tagging, and secret/token rotation are also recoverable through GitHub account recovery and documented offline credentials stored by the copyright holder for succession.
- A designated backup contact can be granted `admin` on the repository within one week of confirmed loss of all maintainer support so issues can be closed, PRs merged, and releases published.
- DNS / Marketplace listing continuity follows the same succession notes held by the copyright holder.

## Bus factor

The engineering bus factor is **2+**: [@ale94lko](https://github.com/ale94lko) and [@leoflavio1989](https://github.com/leoflavio1989) both contribute and can continue triage, review, and releases. Contributor graph: [graphs/contributors](https://github.com/ale94lko/sql-optima/graphs/contributors).

## Authentication (2FA)

Maintainers who can push to the central repository or access private vulnerability reports MUST use GitHub **two-factor authentication**. Prefer TOTP or passkeys/WebAuthn over SMS ([GitHub 2FA docs](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa)).

## Code of conduct

All participants must follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).
