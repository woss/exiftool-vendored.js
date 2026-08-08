# Release procedure

Releases use signed Git tags and npm staged publishing. The workflow stages an
exact package, but a maintainer must approve that package with two-factor
authentication (2FA) before npm makes it public.

Do not create or move a release tag manually. Do not run `npm publish` from a
workstation.

## Prepare the release

1. Decide the version from the consumer-visible change, then add the release
   notes to `CHANGELOG.md` on `main` under a heading for that exact version.
2. Push the completed changes and wait for the ordinary `main` build to pass.
3. Confirm that `main` has not moved to a different commit.

## Stage the package

1. Open **Build & Prepare Release** in GitHub Actions.
2. Select **Run workflow** on `main`.
3. Choose the `patch`, `minor`, or `major` bump that produces the version in
   the CHANGELOG heading. Nothing verifies this for you, and the tag cannot be
   moved afterwards.
4. Wait for **Build & Prepare Release** to finish.
5. Wait for the tag-bound **Stage npm Release** workflow to finish.

The first workflow runs the full test matrix, creates a signed release commit
and annotated tag, and starts the second workflow at that tag. The second
workflow validates the tag, builds and verifies the exact tarball, stages it on
npm, and creates the immutable GitHub release.

## Approve the npm stage

1. Open **Staged Packages** from the npm user menu.
2. Confirm the package name, version, file list, metadata, checksum evidence,
   and provenance.
3. Confirm that the provenance identifies this repository, `publish.yaml`, the
   release tag, and the signed tag commit.
4. Approve the staged package with 2FA.
5. Confirm that npm lists the version publicly.
6. Confirm that the GitHub release exists and is immutable.

## Recover from a failed release

- If the pre-tag test fails, fix `main` and start a new release run.
- If the tag push succeeds but publisher dispatch fails, rerun only the
  dispatch job or start `publish.yaml` manually at the existing signed tag.
- If the tagged workflow is defective, fix `main` and release a new version.
  Never move the existing tag.
- If the staged contents are wrong, reject the stage and release a new version.
- If npm publishes a bad release, deprecate it or publish a corrected version.
  Never overwrite a published version.

## Local development

Dependency resolution requires npm 11.10.0 or newer. Run `make preflight`
before opening a release pull request. To regenerate tags from the complete
ExifTool sample corpus, run `npm run mktags ../test-images` before preflight.

`.npmrc` sets `ignore-scripts`, so no lifecycle script runs during an install:
`npm install` will not build the project, and every `pre`/`post` hook is
inert. Run `npm run compile` after installing. Scripts here spell out their own
prerequisites rather than relying on hooks.
