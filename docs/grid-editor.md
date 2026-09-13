# The grid editor

## How editing works

The grid is a `CustomTextEditorProvider` over the file's text document. Every change you make in the grid is applied as a workspace edit to that document, which is why save, undo, redo, the dirty dot and external file changes all behave normally. If another editor or an external tool changes the file, the grid reloads.

Quoting, the delimiter and the line ending are preserved when the file is written back. A field is quoted only when it needs to be, matching RFC 4180.

Alternating rows use distinct theme-aware bands. Moving the pointer over a row adds a full-width focus stripe that continues through the frozen row-number gutter, making the same record easy to follow while scrolling across wide files.

## Editing cells

| Action | How |
| --- | --- |
| Edit a cell | Double-click, press `F2`, or press `Enter` |
| Replace a cell's contents | Select it and start typing, as in Excel |
| Confirm an edit | `Enter` |
| Cancel an edit | `Escape` |
| Clear the selected range | `Delete` |
| Cut the selection | `Ctrl+X` |
| Copy the selection | `Ctrl+C` |
| Paste | `Ctrl+V`, including from Excel or another spreadsheet |

Selection is a spreadsheet range. Drag across cells, click a row number to take the whole row, or click a column header to take the whole column. The status bar summarises the selection and, for numeric cells, gives count, sum, average, minimum and maximum.

## Rows

The **Rows** toolbar menu and the right-click menu on any cell both offer:

- Insert a row above or below, or insert several at once
- Duplicate the selected rows
- Move a row up or down
- Delete the selected rows
- Remove every empty row in the file
- Remove duplicate rows, choosing which columns define a duplicate

Deleting more than one row asks for confirmation, and every one of these operations is a single undo step.

## Columns

The **Columns** toolbar menu, the header caret menu and the right-click menu offer:

- Insert a column to the left or right
- Rename a column, or double-click the header text
- Duplicate a column
- Move a column left or right, or drag the header to reorder
- Delete or hide the selected columns
- Show all hidden columns
- Split a column on a separator, the equivalent of Excel's Text to Columns
- Merge several columns into one with a separator
- Auto-fit column widths

Dragging a header to reorder writes the new column order to the file. Hiding a column only affects the view.

### Split and merge

**Split column** takes a separator (optionally a regular expression), an optional maximum number of parts, and can remove the source column. New columns are inserted immediately after the source and named after it.

**Merge columns** concatenates the chosen columns with a separator into a new column, and can remove the sources.

## Data cleaning

The **Data** menu applies to the selected columns:

- Trim leading and trailing whitespace
- Convert to UPPER CASE, lower case or Title Case
- Fill empty cells with a value

And to the whole table:

- Transpose rows and columns
- Normalize ragged rows, padding short rows and trimming trailing blank cells so every row has the header's field count

### Fill

Fill works on the selected rectangle, taking the first cell or row as the source.

| Command | Shortcut | Behaviour |
| --- | --- | --- |
| Fill down | `Ctrl+D` | Copies the top cell of each column down the selection |
| Fill right | `Ctrl+R` | Copies the leftmost cell of each row across the selection |
| Fill series | menu | Continues a numeric run (`1, 3` becomes `5, 7`), increments a trailing number (`item01` becomes `item02`), or repeats a constant |

## Ragged rows

A CSV row with a different number of fields than the header usually means a quoting problem. The status bar shows a count of such rows and clicking it offers to normalize them. In text mode the same rows appear as warnings in the Problems panel; set `csvPlus.lintFieldCount` to `false` to turn that off.

## View options

The **View** menu toggles:

- **Wrap text**, which shows multi-line cell contents in full
- **Highlight leading/trailing whitespace**, which marks cells with stray spaces
- **Auto-fit column widths**
- **Show all columns**

## Header row and delimiter

The toolbar has a **Header row** checkbox and a delimiter dropdown. Both override the automatic detection for that file only, and both are remembered for the file. The workspace defaults are `csvPlus.hasHeaderRow` and `csvPlus.delimiter`.

With the header row off, columns are named `Column 1`, `Column 2` and so on, and the first line is treated as data.

## Export

The **Export** menu writes the whole file or the current selection to:

- JSON, as an array of objects with numeric columns converted to numbers
- Markdown table
- HTML table
- SQL `CREATE TABLE` plus `INSERT` statements, with inferred column types
- A different delimiter: comma, tab, semicolon or pipe

Whole-file exports open in a new editor beside the grid. Selection actions can copy to the clipboard instead, which is the quickest way to paste a slice of a CSV into a document or a chat.
