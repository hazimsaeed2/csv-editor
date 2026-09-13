# Changelog

## Unreleased

### Added

- Clearer, theme-aware alternating row bands and a full-width hover stripe, including the frozen row-number gutter, for tracking records across wide CSV files.
- A documentation site at [apps.bash-365.com/csv-vscode](https://apps.bash-365.com/csv-vscode/), built with Astro and Starlight from `site/`. It carries the full guide set with search, a feature tour, a contributor section, and a live demo that runs the extension's own `src/core` parsing, type inference and statistics in the browser over sample or user-supplied files, including real SQLite via WebAssembly.
- The site's guides are generated from `docs/`, `README.md`, `CHANGELOG.md` and `CONTRIBUTING.md`, and its command and pipeline references are generated from `package.json` and `schemas/csvpipe.schema.json`, so neither can drift from what the extension contributes.
- A `docs` workflow that builds the site on every pull request, checks every internal link against the built output, and deploys to GitHub Pages from `main`.

### Fixed

- The Marketplace version and install badges used shields.io `visual-studio-marketplace` routes, which now render as "retired badge". They now use [badgen.net](https://badgen.net), an approved Marketplace badge host.

### Changed

- Renamed the fork to **CSV Editor**, credited it to **Hazim Saeed**, and moved extension-owned commands and settings to the collision-safe `csvEditor.*` namespace.

- Documentation screenshots and the demo GIF now show the grid inside the VS Code workbench, with the CSV sidebar (Settings, Pipelines, Files) visible rather than a cropped webview.
- Custom editor `priority` is now `"option"` instead of `"default"`, so CSV/TSV files open in the text editor unless you choose **Open in Grid Editor** or set `workbench.editorAssociations` to `csv.gridEditor`. Getting started, README, settings and troubleshooting docs explain the opt-in path.
- `homepage` now points at the documentation site rather than at the README, so the Marketplace listing links there.

## 1.0.0

First full release, upgrading the `bash-365.csv-grid-viewer` listing from the 0.0.1 preview. Existing installations receive this as an automatic update.

Everything below was developed across the 0.1.0 and 0.2.0 pre-release cycles and ships together in 1.0.0.

### Added in this release

- Marketplace metadata: icon, gallery banner, categories, keywords, and declared trust and virtual-workspace capabilities.
- Full documentation set under `docs/`: getting started, grid editor, filtering and search, analysis, pipelines, keyboard shortcuts, settings, troubleshooting, releasing and feature parity.
- `CONTRIBUTING.md` covering setup, architecture and conventions.
- Screenshots and an animated demo in `media/`.
- A `release` workflow that builds, tests, packages and publishes on a version tag, with Marketplace and Open VSX publishing gated on their secrets.
- A CSV container in the activity bar with three views. Settings lists every contributed option grouped and editable in place, with a User/Workspace scope toggle, per-setting reset, and the active file's header and delimiter overrides. Pipelines lists workspace pipelines with matching ones first and runs or edits them inline. Files lists the workspace's delimited files.
- Local publishing tokens in a git-ignored `.env`, created from the tracked `.env.example`, with `npm run publish:check` to verify them without publishing. `.vscodeignore` excludes `.env` so a token can never be packaged into the VSIX.

### Fixed in this release

- The find bar was visible on load because its `display: flex` overrode the `hidden` attribute.
- Histogram bucket labels printed four decimal places; label precision now follows the bucket width.

### Changed in this release

- Display name changed from "CSV Grid Viewer" to "CSV Grid Editor". The Marketplace identifier stays `bash-365.csv-grid-viewer` so the existing listing and its installed base upgrade in place.
- Dependencies updated and all reported vulnerabilities resolved. TypeScript stays on the 5.x line because 7.0 crashes typescript-eslint, and Vitest stays on 4.x because 5.0 requires Node 22 while CI runs Node 20.

## 0.2.0

- Excel parity pass: Rows / Columns / Data / View toolbar menus and a cell context menu; multi-row and multi-column delete, hide, duplicate and move (including drag-to-reorder columns written to the file); insert N rows; remove empty rows; remove duplicates by key columns; split column (Text to Columns); merge columns; transpose; multi-level Sort dialog; fill down/right/series (`Ctrl+D`/`Ctrl+R`); trim/case/fill-empty on selected columns; type-to-edit; cut (`Ctrl+X`); select all; go to cell (`Ctrl+G`); `Ctrl+Home`/`End`; wrap text; whitespace highlighting; auto-fit widths; undo/redo buttons; header double-click rename; filter by selected cell's value; ragged-row detection with one-click normalize and text-mode diagnostics.
- New no-code pipeline steps: split column, merge columns, transpose, remove empty rows, random sample. Multi-key sort in edit operations.
- `docs/FEATURE-PARITY.md`: comparison with Excel and existing CSV tools, with remaining gaps.
- Excel-style AutoFilter dropdown on every column: sort, searchable checkbox list of distinct values with counts, (Select All)/(Blanks), "Add current selection to filter", and Text/Number/Date Filters with two And/Or conditions and `*`/`?` wildcards. Value lists cascade from other columns' filters; `Alt+Down` opens the filter for the active column. Replaces the inline header filter inputs.
- Data-processing pipelines (`*.csvpipe.json`) with no-code steps (trim, case, fill, replace, rename, select, drop, sort, dedupe, limit), low-code expression steps (filter, compute) and code steps (inline JavaScript, script files, SQL, external commands via stdin/stdout).
- Pipeline builder panel in the grid with preview, apply, save/load, and step reports; `CSV: Run Pipeline…`, `New Pipeline`, `New Pipeline Script`, `Show Pipeline Log` commands.
- Triggers: manual, on open (pre-processing) and on save (post-processing); outputs to the document, a new document, a file, or the clipboard in any export format.
- JSON schema for pipeline files; CSV Pipelines output channel; code steps require a trusted workspace.

## 0.1.0

- CSV/TSV/PSV files now open in a spreadsheet-style grid backed by a custom text editor: native save, undo/redo, dirty state, and external change reload.
- Cell editing, range selection, copy/paste, row insert/duplicate/delete, column insert/rename/delete/hide, and sort-to-file.
- Find and replace with regex, match-case, and whole-cell modes; per-column header filters with comparison and regex expressions.
- Column statistics and charts (Chart.js); SQL queries over the file via sql.js (SQLite).
- Export to JSON, Markdown, HTML, SQL, and other delimiters; copy selection in several formats.
- Automatic delimiter detection, per-file header/delimiter overrides, large-file row cap.
- Text mode: rainbow column colouring, hover with column name, status bar column indicator.
- Build moved to esbuild; unit tests with Vitest; ESLint.

## 0.0.1

- Initial release of CSV Grid Viewer.
