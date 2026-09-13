# Feature parity analysis

How CSV Grid Editor compares with Excel and with the tools people already use on CSV files, and what is still missing. Updated 2026-09-09 for version 0.2.0.

Legend: ✅ available · ◐ partial · ❌ missing · — not applicable to a plain-text CSV.

Compared against: Microsoft Excel (desktop), Rainbow CSV (VS Code), Edit CSV (VS Code, janisdd), Excel Viewer (VS Code, GrapeCity), Data Wrangler (VS Code, Microsoft), and the CLI tools csvkit, Miller (mlr) and qsv.

## Viewing and navigation

| Feature | Excel | Rainbow CSV | Edit CSV | Excel Viewer | Data Wrangler | csvkit / mlr / qsv | CSV Grid Editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Grid view with row numbers | ✅ | ❌ (text) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Virtualised rendering for 100k+ rows | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ (`csvPlus.maxRows`) |
| Column type inference | ✅ | ◐ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Frozen header row | ✅ | — | ✅ | ✅ | ✅ | — | ✅ |
| Frozen columns / freeze panes | ✅ | — | ✅ (fixed columns) | ✅ | ❌ | — | ◐ row numbers only (see gaps) |
| Resize / auto-fit column widths | ✅ | ◐ align | ✅ | ✅ | ✅ | — | ✅ |
| Hide / show columns | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (`select`) | ✅ |
| Reorder columns by drag | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (`select`) | ✅ (written to file) |
| Wrap text / multi-line cells | ✅ | ◐ | ✅ | ❌ | ❌ | — | ✅ |
| Go to cell (Ctrl+G) | ✅ | ◐ (Ctrl+G line) | ❌ | ❌ | ❌ | — | ✅ |
| Rainbow column colouring in text | — | ✅ | — | — | — | — | ✅ |
| Hover shows column name (text) | — | ✅ | — | — | — | — | ✅ |
| Field-count consistency lint | — | ✅ | ◐ | ❌ | ❌ | ✅ (`csvclean`) | ✅ (diagnostics + ragged-row banner) |
| Theme aware | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Zoom | ✅ | (VS Code) | (VS Code) | (VS Code) | (VS Code) | — | (VS Code) |

## Editing

| Feature | Excel | Rainbow CSV | Edit CSV | Excel Viewer | Data Wrangler | csvkit / mlr / qsv | CSV Grid Editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Edit cells in place, F2 / Enter | ✅ | text only | ✅ | ❌ (read-only) | ❌ | — | ✅ |
| Type to replace cell content | ✅ | — | ❌ | — | — | — | ✅ |
| Native save, undo/redo, dirty state | ✅ | ✅ | ◐ (own undo) | — | — | — | ✅ (VS Code text document) |
| Range selection, copy / cut / paste | ✅ | ◐ | ✅ | ◐ copy | ❌ | — | ✅ |
| Insert / delete / duplicate rows | ✅ | — | ✅ | — | ❌ | ✅ | ✅ (multi-row, "Insert rows…") |
| Insert / delete / rename / duplicate columns | ✅ | — | ✅ | — | ✅ | ✅ | ✅ (multi-column) |
| Move rows / columns | ✅ | — | ❌ | — | ❌ | — | ✅ |
| Fill down / fill right (Ctrl+D / Ctrl+R) | ✅ | — | ❌ | — | ❌ | — | ✅ |
| Fill series (fill handle) | ✅ | — | ❌ | — | ❌ | — | ◐ menu action, no drag handle |
| Clear contents (Delete) | ✅ | — | ✅ | — | — | — | ✅ |
| Select all (Ctrl+A), Ctrl+Home / End | ✅ | — | ◐ | — | — | — | ✅ |
| Header row toggle, delimiter override | ◐ (import wizard) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Quote / escape / comment options | ◐ | ✅ | ✅ | ❌ | ✅ | ✅ | ◐ RFC 4180 quoting only (see gaps) |
| Trim whitespace, change case | ✅ (functions) | — | ✅ trim | — | ✅ | ✅ | ✅ |
| Remove empty rows | ✅ (manual) | — | ✅ | — | ✅ | ✅ | ✅ |
| Remove duplicates | ✅ | — | ❌ | — | ✅ | ✅ (`dedup`) | ✅ (choose key columns) |
| Text to columns (split) | ✅ | — | ❌ | — | ✅ | ✅ (`nest`, `split`) | ✅ |
| Merge / concatenate columns | ✅ (formula) | — | ❌ | — | ✅ | ✅ | ✅ |
| Transpose | ✅ | — | ❌ | — | ❌ | ✅ (`transpose`) | ✅ |
| Fill empty cells | ✅ | — | ❌ | — | ✅ | ✅ (`fill-empty`) | ✅ |
| Formulas per cell | ✅ | — | ❌ | — | ✅ (pandas) | ✅ (DSL) | ◐ compute-column expressions, not per-cell formulas |
| Flash Fill | ✅ | — | ❌ | — | ❌ | — | ❌ |
| Number / date formatting | ✅ | — | ❌ | ◐ | ✅ | ✅ | ❌ (values are stored as text) |
| Data validation, comments, conditional formatting | ✅ | — | ❌ | ❌ | ❌ | — | ❌ (not representable in CSV) |
| Highlight leading/trailing whitespace | ❌ | ❌ | ✅ | ❌ | ❌ | — | ✅ |

## Search, filter and sort

| Feature | Excel | Rainbow CSV | Edit CSV | Excel Viewer | Data Wrangler | csvkit / mlr / qsv | CSV Grid Editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Find / replace with regex | ✅ (wildcards) | (VS Code) | ✅ | ❌ | ❌ | ✅ (`csvgrep`) | ✅ |
| AutoFilter value list with search | ✅ | ❌ | ❌ | ✅ | ✅ | — | ✅ (cascading, counts, blanks) |
| Text / number / date condition filters | ✅ | ❌ | ❌ | ◐ | ✅ | ✅ | ✅ (two conditions, And/Or, wildcards) |
| Filter by selected cell's value | ✅ | ❌ | ❌ | ❌ | ❌ | — | ✅ |
| Sort (view) | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sort written back to the file | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ (`csvsort`) | ✅ |
| Multi-level sort dialog | ✅ | ❌ | ❌ | ◐ | ✅ | ✅ | ✅ (3 levels) |
| Custom sort orders (lists) | ✅ | ❌ | ❌ | ❌ | ❌ | — | ❌ |
| Top-N / percent filter | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (`top`) | ◐ via SQL `LIMIT` or sort |

## Analysis and exploration

| Feature | Excel | Rainbow CSV | Edit CSV | Excel Viewer | Data Wrangler | csvkit / mlr / qsv | CSV Grid Editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selection sum / average / count / min / max | ✅ | ❌ | ◐ | ❌ | ❌ | — | ✅ |
| Column statistics (distinct, nulls, quartiles, std dev) | ◐ | ❌ | ◐ | ❌ | ✅ | ✅ (`csvstat`, `stats`) | ✅ |
| Frequency table / top values | ✅ (pivot) | ❌ | ❌ | ❌ | ✅ | ✅ (`frequency`) | ✅ |
| Charts | ✅ | ❌ | ❌ | ❌ | ✅ (histograms) | ❌ | ◐ histogram / top-values bar chart |
| SQL over the data | ◐ (Power Query) | ✅ (RBQL) | ❌ | ❌ | ✅ (pandas) | ✅ (`csvsql`) | ✅ (SQLite) |
| Pivot tables | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (`mlr`) | ◐ `GROUP BY` in SQL, no pivot UI |
| Random sample | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (`sample`) | ✅ (pipeline step) |
| Join with another file | ✅ (Power Query) | ❌ | ❌ | ❌ | ✅ | ✅ (`csvjoin`) | ❌ (see gaps) |
| Stack / append files | ✅ (Power Query) | ❌ | ❌ | ❌ | ✅ | ✅ (`csvstack`) | ❌ (see gaps) |

## Transformation, automation and export

| Feature | Excel | Rainbow CSV | Edit CSV | Excel Viewer | Data Wrangler | csvkit / mlr / qsv | CSV Grid Editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Recorded / reusable transformation steps | ✅ (Power Query, macros) | ❌ | ❌ | ❌ | ✅ (generates pandas) | ✅ (shell) | ✅ (`*.csvpipe.json`, no-code / low-code / code) |
| Run automatically on open / save | ◐ (VBA) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Scripting with a real language | ✅ (VBA, Python) | ❌ | ❌ | ❌ | ✅ (Python) | ✅ | ✅ (JavaScript, any CLI via stdin/stdout) |
| Export JSON / Markdown / HTML / SQL | ◐ | ❌ | ❌ | ❌ | ✅ | ✅ (`csvjson`, `mlr`) | ✅ |
| Change delimiter / quoting on export | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ (delimiter), ◐ quote-all |
| Excel (.xlsx) import / export | ✅ | ❌ | ❌ | ✅ (view) | ✅ | ✅ (`in2csv`) | ❌ (see gaps) |
| Encoding selection / BOM | ✅ | (VS Code) | ✅ | ❌ | ✅ | ✅ | (VS Code `files.encoding`) |

## Remaining gaps, in priority order

1. **Freeze columns.** Tabulator warns that frozen columns other than the row header behave unpredictably with range selection, so only row numbers are frozen today. Fixing it means either accepting that warning with testing or rendering a separate frozen pane.
2. **Join and append other files.** csvkit's `csvjoin` / `csvstack` and Data Wrangler cover this. Natural home: two pipeline steps (`join` with key columns and left/inner mode; `append` with a file glob) plus a Data-menu dialog.
3. **Fill handle drag.** Fill down/right/series exist as commands and shortcuts; the drag handle on the selection corner is not implemented.
4. **Per-cell formulas.** CSV cannot store formulas, but a computed column that re-evaluates from an expression (the pipeline `compute` step) could be surfaced as a "formula column" in the grid. Not planned for the file format itself.
5. **Number and date formatting.** Values are text in CSV; a display-only format (thousands separators, date locale) per column would help reading without changing the file.
6. **Custom sort lists and sort by colour.** Not planned; multi-level sort covers most needs.
7. **Pivot table UI.** SQL `GROUP BY` works today; a form-driven pivot (rows, columns, aggregate) would help non-SQL users.
8. **Quote character, escape character and comment lines** as parse options (Edit CSV, csvkit). PapaParse supports them; they need settings plus round-tripping on save.
9. **.xlsx import/export.** Would need SheetJS or ExcelJS; deliberately excluded to keep the bundle small.
10. **Drag rows to reorder.** Move up/down exists; drag conflicts with row-header range selection in Tabulator.
11. **Conditional formatting, data validation, comments.** Not representable in CSV; could exist as workspace-side metadata but is out of scope.

## Notes on the comparison

- Excel Viewer is read-only, so the editing rows are blank for it; Rainbow CSV works in the text editor and is compared on text-mode features.
- CLI tools are compared on capability, not interactivity. Any of them can be invoked from a pipeline `command` step, so their capabilities are reachable from the grid.
- Data Wrangler operates on pandas DataFrames and generates Python; it is the closest analogue to the pipeline builder here.
