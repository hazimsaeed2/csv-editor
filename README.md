# CSV Grid Editor Plus

This project is an MIT-licensed fork of [CSV Grid Editor](https://github.com/bamr87/csv-vscoode), maintained by `hazimsaeed2`. It adds clearer, theme-aware alternating row bands and a full-width hover stripe so a row remains easy to follow across wide CSV files.

Open CSV, TSV and other delimited files in a spreadsheet-style grid inside VS Code. Edit cells with real undo and save, filter columns the way Excel does, query the file with SQL, and turn repeated cleanup into pipelines you can re-run.

Wide tables are easier to follow with visible alternating row bands and a hover stripe that continues through the frozen row-number gutter as you scroll horizontally.

[![CI](https://github.com/hazimsaeed2/csv-grid-editor-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/hazimsaeed2/csv-grid-editor-plus/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-MIT-0e7c6b)](LICENSE)

![CSV Grid Editor in action](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/demo.gif)

## Why

CSV files are the format everyone actually exchanges, and reading one in a text editor means counting commas. Opening it in a spreadsheet means leaving your editor, and often means the spreadsheet silently reformats your data on the way back out.

This extension puts the grid inside VS Code, on top of the file itself. The text document stays the source of truth, so `Ctrl+S`, `Ctrl+Z`, the dirty indicator, file watching and Git all behave exactly as they do for any other file. Nothing reformats your dates or drops your leading zeros.

## Features

### A real grid over a real file

![Grid](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/screenshots/grid.png)

- Virtualised rendering that stays smooth on files with 100,000 rows and more.
- Automatic delimiter detection for comma, tab, semicolon and pipe, with a per-file override.
- Column types inferred as integer, number, boolean, date or text, driving right-aligned numbers, numeric sorting and the right filter operators.
- Spreadsheet range selection with copy and paste to and from Excel. The status bar summarises the selection: count, sum, average, minimum and maximum.
- Edit with a double-click, `F2`, `Enter`, or by simply typing. `Ctrl+S` saves. `Ctrl+Z` undoes.

### Excel-style AutoFilter

![AutoFilter](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/screenshots/autofilter.png)

Click the caret in any column header, or press `Alt+Down`.

- A searchable list of the column's distinct values with row counts, tri-state `(Select All)`, and `(Blanks)`.
- Text, Number and Date condition filters: contains, begins with, greater than, between, before, is empty, and the rest, two at a time joined by And or Or, with `*` and `?` wildcards.
- Value lists cascade from the other columns' filters, so you never pick a combination that matches nothing.
- Sorting, and a one-click clear per column.

### Find, replace and sort

![Find and replace](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/screenshots/find-replace.png)

`Ctrl+F` opens find and replace with match case, whole cell and regular expression modes, live highlighting of every match, and replace-all in a single undo step. The Sort dialog does up to three levels and can either sort the view or write the new order to the file.

### Edit rows and columns

![Cell menu](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/screenshots/cell-menu.png)

Toolbar menus and right-click menus cover insert, duplicate, move, delete and hide for both rows and columns, on single items or whole selections. Beyond that: split a column into several, merge columns together, transpose the table, remove empty or duplicate rows, fill down and right with `Ctrl+D` and `Ctrl+R`, fill a series, trim whitespace, change case, and normalize rows whose field count does not match the header.

### Understand the data

![Statistics](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/screenshots/statistics.png)

The Statistics panel gives per-column counts, distinct values, blanks, minimum and maximum, sum, mean, median, standard deviation, quartiles and the most frequent values. The Chart panel draws a histogram for numeric columns and a top-values bar chart for the rest.

### Query it with SQL

![SQL](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/screenshots/sql.png)

The SQL panel loads the whole file into an in-memory SQLite database named `csv` and runs real queries against it, including joins onto itself, window functions and aggregates. Results can be copied or opened as a new CSV.

### Pipelines: repeatable transformations

![Pipeline builder](https://raw.githubusercontent.com/bamr87/csv-vscoode/main/media/screenshots/pipeline.png)

The same cleanup usually happens more than once. Describe it once as a `*.csvpipe.json` file and run it on demand, when the file opens, or when it is saved.

| Tier | Steps |
| --- | --- |
| No-code | trim, change case, fill empty, find and replace, rename, select, drop, sort, dedupe, limit, split column, merge columns, transpose, remove empty rows, random sample |
| Low-code | `filter` and `compute`, one-line expressions where columns are variables and 38 helpers are available |
| Code | inline JavaScript, a workspace script file, a SQLite query, or any external command over stdin and stdout |

```json
{
  "name": "Clean sales export",
  "applyTo": ["data/sales-*.csv"],
  "trigger": "onSave",
  "output": { "target": "file", "format": "json", "path": "out/${name}-summary.json" },
  "steps": [
    { "kind": "trim" },
    { "kind": "filter", "expression": "in_stock && units_sold > 0" },
    { "kind": "compute", "column": "margin", "expression": "round(revenue * 0.18, 2)" },
    { "kind": "sql", "query": "SELECT category, SUM(revenue) AS revenue FROM csv GROUP BY category" }
  ]
}
```

Because a `command` step just pipes the data through your shell, anything already installed works: pandas, R, jq, awk, csvkit, Miller, qsv. Steps that evaluate code only run in trusted workspaces.

Full reference: [docs/pipelines.md](docs/pipelines.md).

### Export

The whole file or just the selection, to JSON, Markdown, HTML, SQL inserts, or a different delimiter. Selections can go straight to the clipboard.

### A sidebar for settings, pipelines and files

The CSV icon in the activity bar opens three views. **Settings** lists every option the extension contributes, grouped, showing its current value; click one to change it, with a toggle for booleans, a picker for choices and a validated prompt for numbers. It also surfaces the per-file header and delimiter overrides for the file you are looking at, which are otherwise invisible once set from the grid toolbar. **Pipelines** lists the workspace's pipelines with the ones matching the current file first, and runs or edits them in one click. **Files** lists every delimited file in the workspace and opens it in the grid.

A control in the Settings view title chooses whether edits go to User or Workspace settings, and the current scope is shown next to the view name.

### Text mode

Open any CSV as text and each column gets its own colour, hovering a cell names its column, the status bar tracks the column under the cursor, and rows with the wrong field count are reported in the Problems panel.

## Getting started

Install from the Marketplace, then open any `.csv`, `.tsv`, `.tab` or `.psv` file in the text editor as usual. Open the grid with **Open in Grid Editor** in the editor title bar, from the Explorer context menu, or via **CSV: Open in Grid Editor**.

To make the grid the default for those extensions:

```json
"workbench.editorAssociations": {
  "*.csv": "csvPlus.gridEditor",
  "*.tsv": "csvPlus.gridEditor",
  "*.tab": "csvPlus.gridEditor",
  "*.psv": "csvPlus.gridEditor"
}
```

You can also use **Open With…** → **CSV Grid Editor** → **Configure default editor…**. Details: [Getting started](docs/getting-started.md).

## Documentation

Full documentation, a feature tour and a live in-browser demo: **[apps.bash-365.com/csv-vscode](https://apps.bash-365.com/csv-vscode/)**.

The same guides are readable here in the repository:

| Guide | Covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | Installing, opening files, grid and text mode |
| [The grid editor](docs/grid-editor.md) | Editing, rows, columns, cleaning, export |
| [Filtering, search and sort](docs/filtering-and-search.md) | AutoFilter, find and replace, sorting |
| [Analysis](docs/analysis.md) | Statistics, charts, SQL |
| [Pipelines](docs/pipelines.md) | The full pipeline reference |
| [Keyboard shortcuts](docs/keyboard-shortcuts.md) | Every shortcut and its Excel equivalent |
| [Settings](docs/settings.md) | Every configuration option |
| [Troubleshooting](docs/troubleshooting.md) | Common problems |
| [Feature parity](docs/FEATURE-PARITY.md) | Comparison with Excel and other CSV tools |
| [Live demo](https://apps.bash-365.com/csv-vscode/demo/) | A working grid in your browser, no install needed |

## Commands

Every command is under the **CSV** category in the Command Palette.

| Command | Description |
| --- | --- |
| `CSV: Open in Grid Editor` | Open the active or selected file in the grid |
| `CSV: Open as Text` | Switch the current grid to the text editor |
| `CSV: Find and Replace in Grid` | Focus the find bar |
| `CSV: Column Statistics` | Open the statistics panel |
| `CSV: Chart a Column` | Open the chart panel |
| `CSV: Run SQL Query` | Open the SQL panel |
| `CSV: Export As…` | Export to JSON, Markdown, HTML, SQL or another delimiter |
| `CSV: Toggle Header Row` | Treat or stop treating the first row as headers |
| `CSV: Set Delimiter` | Override the detected delimiter |
| `CSV: Run Pipeline…` | Run a pipeline on the current file |
| `CSV: Open Pipeline Builder` | Open the visual pipeline panel |
| `CSV: New Pipeline` | Create a pipeline from a template |
| `CSV: New Pipeline Script` | Create a pipeline script from a template |
| `CSV: Show Pipeline Log` | Open the CSV Pipelines output channel |
| `CSV: Show Actions` | Quick pick of everything above |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `csvPlus.hasHeaderRow` | `true` | Treat the first row as column headers |
| `csvPlus.delimiter` | `auto` | Field delimiter: `auto`, `,`, `\t`, `;` or `\|` |
| `csvPlus.maxRows` | `100000` | Rows rendered in the grid |
| `csvPlus.sqlResultLimit` | `5000` | Maximum rows returned to the SQL panel |
| `csvPlus.rainbowColumns` | `true` | Colour columns in text mode |
| `csvPlus.rainbowMaxLines` | `20000` | Only colour the first N lines in text mode |
| `csvPlus.lintFieldCount` | `true` | Warn about rows whose field count differs from the header |
| `csvPlus.pipelines.folder` | `.vscode/csv-pipelines` | Where the builder saves new pipelines |
| `csvPlus.pipelines.allowScripts` | `true` | Allow steps that evaluate code |
| `csvPlus.pipelines.timeoutMs` | `10000` | Time limit for expression and script steps |
| `csvPlus.pipelines.previewRows` | `1000` | Rows shown in the pipeline preview |

Details in [docs/settings.md](docs/settings.md).

## Requirements

VS Code 1.90 or later. No other dependencies; everything ships in the extension.

## Built with

| Library | Role |
| --- | --- |
| [PapaParse](https://www.papaparse.com/) | RFC 4180 parsing and serialisation |
| [Tabulator](https://tabulator.info/) | Virtualised grid, range selection, clipboard |
| [sql.js](https://sql.js.org/) | SQLite compiled to WebAssembly |
| [Chart.js](https://www.chartjs.org/) | Charts |

## Contributing

Development setup, architecture and conventions are in [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome at https://github.com/bamr87/csv-vscoode.

The documentation site lives in [`site/`](site/) and is published from `main` to [apps.bash-365.com/csv-vscode](https://apps.bash-365.com/csv-vscode/). Its guides are generated from the markdown in `docs/`, so a documentation change belongs there, not in the site.

## License

[MIT](LICENSE)
