---
name: release
description: Verify and publish a Pixiv Token Getter release through the repository's ReleaseGraph workflow when a release is requested.
---

# Release

1. Read `AGENTS.md`, `package.json`, `.github/workflows/release.yml`, and recent commits. Confirm the migration notes and version impact of public CLI/API changes.
2. Run `npm test`, syntax checks for changed JavaScript, and `git diff --check`. Never run a real-account login without explicit authorization.
3. Use the existing release workflow and version automation. Do not assert CI, npm publication, or GitHub Pages deployment from a local test or an uncompleted workflow.
4. Verify the resulting version, package availability, workflow result, and both Docsify language pages. Record evidence in `.agent/STATUS.md` and the handoff. Stop and report any release failure rather than claiming completion.
