---
name: release
description: Release process for serverless-domain-manager - version bump, CHANGELOG entry, release branch and PR, npm auto-publish. Use when preparing or reviewing a release.
---

# Releasing serverless-domain-manager

- Merging to `main` with a changed `package.json` version auto-publishes to npm and tags `vX.Y.Z` (`.github/workflows/publish.yml`). Merges without a version change publish nothing – but the next release includes everything already on `main`, so merge release PRs before unrelated feature PRs.
- Contributor PRs are merged first, then a release PR bumps the version and adds the CHANGELOG entry.
- Branch `release/X.Y.Z`; commit subject `release/X.Y.Z`; PR title `Release X.Y.Z`, opened as draft; body sections: Included / Changes in this PR / Testing (state what was not verified, e.g. real-AWS checks). `Fixes #N` closes issues on merge.
- `npm version X.Y.Z --no-git-tag-version` updates `package.json` and the lockfile.
- CHANGELOG follows Keep a Changelog; sections used: `Possible Breaking Changes`, `Added`, `Fixed`, `Changed`. Credit pattern: `Thank you @user ([713](https://github.com/amplify-education/serverless-domain-manager/pull/713))`; issues link as `([683](.../issues/683))`. Keep entries to one concise line each; dependency-only releases get a short generic line (e.g. "Upgraded dependencies and resolved vulnerabilities."). No README upgrade guides; CI-only changes are not listed.
- Run the real-AWS integration tests (README "Running Tests") before merging a release that changes runtime behaviour or dependencies.
- CI: `.github/workflows/test.yml` (PRs, Node 22/24/26) runs `npm ci`, build, lint, test; actions are pinned to commit SHAs. Outside-contributor PRs need a maintainer to approve the workflow run.
