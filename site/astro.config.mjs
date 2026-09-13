// @ts-check
import { createRequire } from "node:module";

import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const require = createRequire(import.meta.url);

/**
 * The site is published at https://apps.bash-365.com/csv-vscode.
 *
 * Both halves of that URL are environment-overridable so the same build can be
 * previewed elsewhere: `SITE_BASE=/` for a root-served preview, or
 * `SITE_URL=https://bamr87.github.io SITE_BASE=/csv-vscoode` for the default
 * GitHub Pages URL of this repository.
 */
const SITE_URL = process.env.SITE_URL ?? "https://apps.bash-365.com";
const SITE_BASE = process.env.SITE_BASE ?? "/csv-vscode";

const REPO = "https://github.com/bamr87/csv-vscoode";
const MARKETPLACE =
  "https://marketplace.visualstudio.com/items?itemName=bash-365.csv-grid-viewer";

export default defineConfig({
  site: SITE_URL,
  base: SITE_BASE,
  trailingSlash: "always",
  vite: {
    resolve: {
      alias: {
        // The live demo imports ../../../src/core, and src/core/parse.ts
        // imports papaparse. Node would resolve that bare specifier from the
        // repository root, which has no node_modules in CI — only site/ is
        // installed there. Pin it to the site's own copy so the build does not
        // depend on the extension having been installed first.
        papaparse: require.resolve("papaparse"),
      },
    },
  },
  integrations: [
    starlight({
      title: "CSV Editor",
      description:
        "Spreadsheet-style grid for CSV and TSV files inside VS Code: edit, Excel-style filters, statistics, charts, SQL queries and repeatable data pipelines.",
      logo: {
        src: "./src/assets/logo.svg",
        replacesTitle: false,
      },
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: REPO },
        { icon: "vscode", label: "VS Code Marketplace", href: MARKETPLACE },
      ],
      editLink: {
        // Guide pages are generated from the markdown in `docs/`, so the edit
        // link has to point at that source rather than at the generated copy.
        // `sync-docs.mjs` sets a per-page `editUrl` for those; this covers the
        // pages authored inside the site.
        baseUrl: `${REPO}/edit/main/site/`,
      },
      lastUpdated: true,
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "meta",
          attrs: { property: "og:image", content: `${SITE_URL}${SITE_BASE}/og.png` },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", link: "/" },
            { label: "Getting started", link: "/guides/getting-started/" },
            { label: "Live demo", link: "/demo/" },
            { label: "Feature tour", link: "/features/" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "The grid editor", link: "/guides/grid-editor/" },
            { label: "Filtering, search and sort", link: "/guides/filtering-and-search/" },
            { label: "Analysis", link: "/guides/analysis/" },
            { label: "Pipelines", link: "/guides/pipelines/" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Commands", link: "/reference/commands/" },
            { label: "Settings", link: "/reference/settings/" },
            { label: "Keyboard shortcuts", link: "/reference/keyboard-shortcuts/" },
            { label: "Pipeline schema", link: "/reference/pipeline-schema/" },
            { label: "Feature parity", link: "/reference/feature-parity/" },
            { label: "Troubleshooting", link: "/reference/troubleshooting/" },
            { label: "Changelog", link: "/reference/changelog/" },
          ],
        },
        {
          label: "Contribute",
          items: [
            { label: "Contributing", link: "/contribute/contributing/" },
            { label: "The documentation site", link: "/contribute/documentation/" },
            { label: "Releasing", link: "/contribute/releasing/" },
          ],
        },
      ],
    }),
  ],
});
