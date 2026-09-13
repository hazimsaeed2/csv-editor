# Releasing

## Before you start

You need a Visual Studio Marketplace publisher and a Personal Access Token.

1. Create an Azure DevOps organisation at https://dev.azure.com.
2. Create a Personal Access Token with **Marketplace: Manage** scope, and organisation set to **All accessible organizations**. Copy it; it is shown once.
3. The token must belong to a user with rights on the `bash-365` publisher, which owns the published extension. Publishers are managed at https://marketplace.visualstudio.com/manage.

## Store the tokens

Tokens live in a local `.env` file, which is git-ignored and excluded from the packaged VSIX.

```bash
cp .env.example .env
# then fill in VSCE_PAT, and OVSX_PAT if you publish to Open VSX
```

`.env.example` documents each variable and how to create it. Real values never belong anywhere else in the repository: a `.env` at the repo root is packaged into the VSIX by default, which is why `.vscodeignore` excludes it explicitly.

Check that the tokens are picked up without publishing anything:

```bash
npm run publish:check
```

That prints the identifier, the version, and each token masked, then shows the commands it would run.

Values already in the real environment take precedence over the file, so CI secrets are never shadowed by a stale local copy. The release workflow does not read `.env`; it uses repository secrets of the same names, set under **Settings > Secrets and variables > Actions**.

## Checklist## Checklist

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `CHANGELOG.md` has an entry for the new version
- [ ] `package.json` version is bumped
- [ ] `publisher` matches your Marketplace publisher ID
- [ ] Screenshots in `README.md` still reflect the UI
- [ ] The `.vsix` installs and opens a CSV file cleanly

## Version numbers

The extension follows semantic versioning. The Marketplace additionally treats the middle number specially for pre-releases, so keep patch releases to the third number.

| Change | Bump |
| --- | --- |
| Bug fix, documentation | Patch |
| New feature, new setting | Minor |
| Removed setting, changed default behaviour, raised minimum VS Code version | Major |

## Build and package

```bash
npm run package:vsix
```

This runs the production build and produces `csv-editor-<version>.vsix`. Dependencies are bundled by esbuild, so the package excludes `node_modules` entirely.

Verify what is inside before publishing:

```bash
npx @vscode/vsce ls --no-dependencies
```

The package should contain `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, the icon, and `out/`. Sources, tests, samples and screenshots are excluded by `.vscodeignore`.

## Test the package

```bash
code --install-extension csv-editor-<version>.vsix
```

Open a CSV file and confirm the grid renders, a cell edit saves, an AutoFilter dropdown opens, and the SQL panel returns a result. The SQL panel is the one to check specifically, because it is the only feature that loads a file from disk at runtime.

Uninstall with `code --uninstall-extension hazimsaeed2.csv-editor-by-hazim`.

## Publish

```bash
npm run publish:extension
```

This reads `VSCE_PAT` from `.env`, packages the extension if the `.vsix` for the current version is missing, and publishes. To publish to Open VSX as well:

```bash
npm run publish:openvsx
```

The script refuses to run if `VSCE_PUBLISHER` is set to something other than the publisher in `package.json`, because publishing under a different publisher creates a separate listing rather than updating the existing one.

Publishing from CI uses the same token as a repository secret:

```bash
npx @vscode/vsce publish --no-dependencies --pat "$VSCE_PAT"
```

The release workflow in `.github/workflows/release.yml` does this on a tag push when the `VSCE_PAT` secret is set. Without that secret it still builds and attaches the `.vsix` to the GitHub release, so tagging is safe before the secret exists.

## Tag a release

```bash
git tag -a v1.0.0 -m "v1.0.0"
git push origin v1.0.0
```

## Open VSX

Open VSX is the registry VSCodium and Gitpod use. Publishing there is optional and needs `OVSX_PAT` in `.env`:

```bash
npm run publish:openvsx
```

## After publishing

The Marketplace takes a few minutes to show a new version. Verify the listing renders: images in `README.md` must use absolute HTTPS URLs, because the Marketplace does not resolve relative paths.
