# Documentation site

The public documentation for the CSV Editor extension, published to **[apps.bash-365.com/csv-vscode](https://apps.bash-365.com/csv-vscode/)**.

[Astro](https://astro.build/) with [Starlight](https://starlight.astro.build/): a static build, no server, no database. It is deployed to GitHub Pages by [`.github/workflows/docs.yml`](../.github/workflows/docs.yml) on every push to `main` that touches the documentation or the extension's contributed surface.

## Commands

```bash
cd site
npm install
npm run dev        # http://localhost:4321/csv-vscode/
npm run build      # sync + static build into dist/
npm run preview    # serve dist/
npm run check      # astro check (types and content schemas)
npm run check:links  # dead internal links in dist/
```

Node 22.12 or newer, because Astro 7 requires it. The extension itself still builds and tests on Node 20 — the two toolchains are deliberately separate, with their own `package.json` and lockfile, and nothing here reaches the VSIX (`.vscodeignore` excludes `site/**`).

## Most pages are generated

`docs/` in the repository root is the source of truth for the guides. [`scripts/sync-docs.mjs`](scripts/sync-docs.mjs) runs before every build and turns each source file into a Starlight page, adding frontmatter, rewriting cross-document links into site routes, and pointing the page's **Edit page** link at the *source* file.

| Generated page | Source |
| --- | --- |
| `guides/*` and most of `reference/*` | `docs/*.md` |
| `reference/changelog` | `CHANGELOG.md` |
| `contribute/contributing` | `CONTRIBUTING.md` |
| `contribute/releasing` | `docs/RELEASING.md` |
| `reference/commands` | `package.json` → `contributes.commands` |
| `reference/pipeline-schema` | `schemas/csvpipe.schema.json` |

The last two are built from machine-readable sources, so the command list and the pipeline reference cannot drift from what the extension actually contributes.

Everything the script writes is git-ignored: `src/content/docs/guides/`, the generated files under `src/content/docs/reference/` and `contribute/`, `src/assets/hero-grid.png`, and `public/media/`, `public/samples/` and the SQLite `.wasm`. **Editing a generated file is work the next build throws away** — change the source in `docs/` instead.

## Pages written here

| Page | File |
| --- | --- |
| Overview | `src/content/docs/index.mdx` |
| Feature tour | `src/content/docs/features.mdx` |
| Live demo | `src/content/docs/demo.mdx` |
| The documentation site | `src/content/docs/contribute/documentation.mdx` |
| Not found | `src/content/docs/404.mdx` |

## The live demo

[`src/scripts/demo.ts`](src/scripts/demo.ts) imports `src/core/parse.ts`, `src/core/infer.ts` and `src/core/stats.ts` **from the extension**, one directory up. The demo is therefore not a re-implementation: the numbers on that page come from the same functions that produce them inside VS Code.

That import only works because `src/core/` is pure TypeScript with no `vscode` and no DOM dependency. If someone breaks that rule, this build fails — which makes the site an early warning for a constraint that otherwise has no enforcement outside code review.

## Conventions

- Internal links in authored pages are **relative** (`../guides/analysis/`), never absolute, so the site works under any base path. `npm run check:links` verifies every one of them against the built output and fails the build on a dead link.
- Screenshots are referenced as `` `${import.meta.env.BASE_URL}media/screenshots/name.png` `` and live in the repository's `media/screenshots/`, not here.
- One paragraph per line, matching the rest of the repository. The `markdown-oneline` workflow enforces it on `.md`; `.mdx` is on you.
- British spelling, matching the extension's copy.

## Where the URL comes from

`SITE_URL` and `SITE_BASE` in [`astro.config.mjs`](astro.config.mjs) decide where the site thinks it lives, and both are environment-overridable:

```bash
SITE_BASE=/ npm run dev                      # serve from the root instead
SITE_URL=https://bamr87.github.io SITE_BASE=/csv-vscoode npm run build
```

The `/csv-vscode` path segment is produced by the deploy workflow laying the build out under a `csv-vscode/` directory in the Pages artifact, with a redirect at the root. A custom domain on a project Pages site otherwise serves from the domain root, so the path has to come from the artifact's own shape.
