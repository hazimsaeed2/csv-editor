# Getting started

## Install

From the VS Code Marketplace, search for **CSV Editor: Spreadsheet & SQL** and select Install. From a `.vsix` file, run `code --install-extension csv-editor-by-hazim-<version>.vsix`, or use **Extensions: Install from VSIX** in the Command Palette.

## Open a file

`.csv`, `.tsv`, `.tab` and `.psv` files open automatically in the spreadsheet grid. The complete editor—cell editing, rows and columns, filters, statistics, charts, SQL, export and pipelines—is available from that grid.

Open the grid any of these ways:

- Click **Open in Grid Editor** in the editor title bar
- Right-click the file in the Explorer and choose **Open in Grid Editor**
- Run **CSV: Open in Grid Editor** from the Command Palette
- Right-click the editor tab, choose **Open With…**, then **CSV Editor**

The grid reads the file, detects the delimiter, decides whether the first row is a header, and infers a type for each column. All three decisions are shown in the toolbar and all three can be overridden per file.

## Grid mode and text mode

The grid is a custom editor over the same text document VS Code already has open. That means **Save**, **Undo**, **Redo**, the dirty indicator, file watching and source control all behave exactly as they do for a text file. Nothing is cached in a separate model that can drift out of sync.

To switch to the plain text editor from the grid, use the **Open as text** button in the editor title bar, or run **CSV: Open as Text**. To come back, use **CSV: Open in Grid Editor**.

Text mode has its own features: each column gets a distinct colour, hovering a cell shows its column name and position, the status bar names the column under the cursor, and rows whose field count differs from the header are reported as warnings in the Problems panel.

## Make text mode the default

The grid is the default. If you prefer every matching file to open as rainbow-colored text, add these associations in your settings:

```json
"workbench.editorAssociations": {
  "*.csv": "default",
  "*.tsv": "default",
  "*.tab": "default",
  "*.psv": "default"
}
```

To return to the spreadsheet grid as the default, remove those entries or use **Open With…** → **Configure Default Editor…** → **CSV Editor**.

## First steps

1. **Select a range of numbers.** The status bar shows count, sum, average, minimum and maximum, like the Excel status bar.
2. **Click the caret in a column header.** You get sorting, a searchable list of the column's distinct values with counts, and Text, Number or Date condition filters.
3. **Double-click a cell** (or press `F2`, or just start typing) to edit it. Press `Ctrl+S` to save.
4. **Open the Stats panel** from the toolbar to see the shape of a column: distinct values, blanks, quartiles, standard deviation and the most frequent values.
5. **Open the SQL panel** and run `SELECT * FROM csv LIMIT 10`. The whole file is loaded into an in-memory SQLite database named `csv`.

## Large files

The grid renders rows virtually, so scrolling stays smooth on large files. By default the first 100,000 rows are loaded into the view; the setting is `csvEditor.maxRows`.

When a file is larger than that, a banner tells you so. SQL still operates on the whole file. Cell edits, find and statistics operate on the loaded rows. Whole-table rewrites (trim, change case, fill empty, transpose, normalize rows) run on the host against the full file so unloaded rows are not dropped.

## Where to next

- Day-to-day editing: [The grid editor](grid-editor.md)
- Narrowing down data: [Filtering, search and sort](filtering-and-search.md)
- Understanding a dataset: [Analysis](analysis.md)
- Repeating a transformation: [Pipelines](pipelines.md)
