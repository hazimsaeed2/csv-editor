# Getting started

## Install

From the VS Code Marketplace, search for **CSV Grid Editor** and select Install. From a `.vsix` file, run `code --install-extension csv-grid-editor-<version>.vsix`, or use **Extensions: Install from VSIX** in the Command Palette.

## Open a file

`.csv`, `.tsv`, `.tab` and `.psv` files open in the normal text editor by default. The grid is available as an optional custom editor so it does not replace text-first workflows.

Open the grid any of these ways:

- Click **Open in Grid Editor** in the editor title bar
- Right-click the file in the Explorer and choose **Open in Grid Editor**
- Run **CSV: Open in Grid Editor** from the Command Palette
- Right-click the editor tab, choose **Open With…**, then **CSV Grid Editor**

The grid reads the file, detects the delimiter, decides whether the first row is a header, and infers a type for each column. All three decisions are shown in the toolbar and all three can be overridden per file.

## Grid mode and text mode

The grid is a custom editor over the same text document VS Code already has open. That means **Save**, **Undo**, **Redo**, the dirty indicator, file watching and source control all behave exactly as they do for a text file. Nothing is cached in a separate model that can drift out of sync.

To switch to the plain text editor from the grid, use the **Open as text** button in the editor title bar, or run **CSV: Open as Text**. To come back, use **CSV: Open in Grid Editor**.

Text mode has its own features: each column gets a distinct colour, hovering a cell shows its column name and position, the status bar names the column under the cursor, and rows whose field count differs from the header are reported as warnings in the Problems panel.

## Make the grid the default

If you prefer every matching file to open in the grid, either:

1. Use **Open With…** → **CSV Grid Editor**, then choose **Configure default editor for '*.csv'…** (and the same for `.tsv` / `.tab` / `.psv` if you want), or
2. Add associations in your settings:

```json
"workbench.editorAssociations": {
  "*.csv": "csvPlus.gridEditor",
  "*.tsv": "csvPlus.gridEditor",
  "*.tab": "csvPlus.gridEditor",
  "*.psv": "csvPlus.gridEditor"
}
```

To undo that and return to the text editor as the default, remove those entries or set them to `"default"`.

## First steps

1. **Select a range of numbers.** The status bar shows count, sum, average, minimum and maximum, like the Excel status bar.
2. **Click the caret in a column header.** You get sorting, a searchable list of the column's distinct values with counts, and Text, Number or Date condition filters.
3. **Double-click a cell** (or press `F2`, or just start typing) to edit it. Press `Ctrl+S` to save.
4. **Open the Stats panel** from the toolbar to see the shape of a column: distinct values, blanks, quartiles, standard deviation and the most frequent values.
5. **Open the SQL panel** and run `SELECT * FROM csv LIMIT 10`. The whole file is loaded into an in-memory SQLite database named `csv`.

## Large files

The grid renders rows virtually, so scrolling stays smooth on large files. By default the first 100,000 rows are loaded into the view; the setting is `csvPlus.maxRows`.

When a file is larger than that, a banner tells you so. SQL still operates on the whole file. Cell edits, find and statistics operate on the loaded rows. Whole-table rewrites (trim, change case, fill empty, transpose, normalize rows) run on the host against the full file so unloaded rows are not dropped.

## Where to next

- Day-to-day editing: [The grid editor](grid-editor.md)
- Narrowing down data: [Filtering, search and sort](filtering-and-search.md)
- Understanding a dataset: [Analysis](analysis.md)
- Repeating a transformation: [Pipelines](pipelines.md)
