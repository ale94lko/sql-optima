# Security review (2026)

**Date:** 2026-09-17  
**Scope:** sql-optima GitHub Action (`src/`, workflows, supply chain)  
**Reviewers:** Project maintainer ([@ale94lko](https://github.com/ale94lko)), assisted by automated CodeQL + OpenSSF Scorecard findings triage

## Method

1. Re-read security requirements and trust boundaries in [ASSURANCE.md](ASSURANCE.md).
2. Walk the SQL ingest → allowlist → EXPLAIN / static analysis path in `src/`.
3. Review GitHub Actions workflows for permission scope and pin hygiene.
4. Triage open code-scanning alerts and Dependabot updates.

## Security boundary

- **Inside:** Action code running on a GitHub-hosted runner; ephemeral DB services in CI; Markdown Job Summary output.
- **Outside / untrusted:** Workflow inputs, `repository_dispatch` payloads, `sql_file` contents, third-party Actions/npm packages.

## Findings addressed in this review cycle

- Markdown table escaping hardened (`formatter.js`).
- actionlint install pinned by SHA-256.
- `sql-wasm.wasm` no longer tracked on `main` (Binary-Artifacts).
- Branch protection + Scorecard / CodeQL enabled.

## Conclusion

Within the documented threat model, secure-design principles (least privilege, fail-safe defaults, input allowlisting) are applied. Residual risk remains if operators point the Action at production databases without network controls—called out explicitly in ASSURANCE.md.

This review satisfies the OpenSSF Best Practices **security_review** criterion (performed within the last 5 years, considering requirements and boundary).
