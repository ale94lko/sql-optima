# Security assurance case

This document argues why sql-optima’s security expectations are met.

## Security requirements (what users can / cannot expect)

Users **can** expect:

- Analysis of provided SQL without the Action posting review comments by default (least-privilege token).
- Blocking of clearly dangerous DDL/DCL before apply/EXPLAIN.
- Private vulnerability reporting per [SECURITY.md](../SECURITY.md).
- Dependency and workflow hygiene via Dependabot, CodeQL, and Scorecard.

Users **cannot** expect:

- That connecting the Action to a production database is safe without their own network/ACL controls.
- Cryptographic confidentiality features inside the Action (it does not implement custom crypto).
- Guaranteed detection of every SQL injection or schema anti-pattern.

## Threat model

| Threat | Mitigation |
| :--- | :--- |
| Malicious SQL in inputs aiming to damage a connected DB | DDL allowlist; block dangerous statements; prefer ephemeral CI DBs |
| Supply-chain compromise of Actions/deps | SHA-pinned Actions; Dependabot; Scorecard; CodeQL |
| Credential leak in repo | No secrets in git; `GITHUB_TOKEN` least privilege; secret scanning |
| Markdown injection in Job Summary | Escaping in `formatter.js` (CodeQL-hardened) |
| Stale vulnerable dependencies | Dependabot + CI |

## Trust boundaries

See [ARCHITECTURE.md](ARCHITECTURE.md#trust-boundaries). Untrusted input is SQL text and paths under the workspace; trusted compute is the GitHub-hosted runner executing the pinned Action revision.

## Secure design principles applied

- **Fail-safe defaults:** dangerous statements rejected; optional severity gate fails closed when configured.
- **Least privilege:** default workflow permissions are read-oriented; release job alone gets `contents: write`.
- **Complete mediation:** SQL apply path goes through allowlist checks before execution.
- **Psychological acceptability:** findings are human-readable Markdown with severities.

## Common implementation weaknesses countered

- Injection into Markdown tables → escaping.
- Accidental execution of destructive SQL → allowlist / blocks.
- Memory-unsafe languages → not used (JavaScript/Node).
- Weak custom crypto → none implemented; HTTPS via GitHub/npm only.
