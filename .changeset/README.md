# Changesets

This directory drives rbac-fs's release process — see
`.github/workflows/release.yml` and `docs/backlog/adr-v1.1-changesets-publish.md`
for the full design.

Every PR that changes published behavior (`src/**`, not docs/tests-only)
should include a changeset describing the change and its semver bump:

```sh
npx changeset
```

This prompts for a bump type (patch/minor/major — the whole package is one
version across core + every adapter, so pick the highest bump any part of
your change needs) and a one-line summary, then writes a markdown file
under `.changeset/`. Commit that file alongside your code changes.

On merge to `main`, the release workflow either opens/updates a "Version
Packages" PR (consuming pending changesets into a version bump +
`CHANGELOG.md` entry) or, if that PR was just merged, publishes the new
version to npm. See https://github.com/changesets/changesets for the full
CLI reference.
