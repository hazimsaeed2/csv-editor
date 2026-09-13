# CSV Editor documentation

Everything the extension can do, grouped by task. Start with [Getting started](getting-started.md) if this is your first time.

These files are also the source of the published documentation site at **[apps.bash-365.com/csv-vscode](https://apps.bash-365.com/csv-vscode/)**, which adds a searchable index, a feature tour and a [live in-browser demo](https://apps.bash-365.com/csv-vscode/demo/). Edit the markdown here; the site regenerates from it on every push to `main`. The site itself lives in [`site/`](../site/).

## Guides

| Guide | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Installing, opening a file, choosing between grid and text mode |
| [The grid editor](grid-editor.md) | Viewing, editing cells, rows and columns, saving and undo |
| [Filtering, search and sort](filtering-and-search.md) | AutoFilter dropdowns, find and replace, multi-level sort |
| [Analysis](analysis.md) | Column statistics, charts, SQL queries |
| [Pipelines](pipelines.md) | Reusable no-code, low-code and code transformations |
| [Keyboard shortcuts](keyboard-shortcuts.md) | Every shortcut, next to its Excel equivalent |
| [Settings](settings.md) | Every configuration option |

## Reference

| Document | What it covers |
| --- | --- |
| [Feature parity](FEATURE-PARITY.md) | Comparison with Excel and other CSV tools, and the remaining gaps |
| [Troubleshooting](troubleshooting.md) | Common problems and their fixes |
| [Releasing](RELEASING.md) | How a new version is built, packaged and published |
| [Contributing](../CONTRIBUTING.md) | Development setup, architecture, and how to add a feature |
| [The documentation site](../site/README.md) | How the site is built, which pages are generated, and how to run it |

## The short version

The CSV icon in the activity bar opens a sidebar with three views: Settings, Pipelines and Files. Open any `.csv`, `.tsv`, `.tab` or `.psv` file and it appears in a spreadsheet-style grid. Edit cells directly and save with `Ctrl+S`; undo works exactly as it does in a text editor because the grid edits the underlying text document. Click the caret in any column header for Excel-style filtering. Use the toolbar menus for row and column operations, the side panels for statistics, charts and SQL, and pipelines when a transformation needs to be repeatable.
