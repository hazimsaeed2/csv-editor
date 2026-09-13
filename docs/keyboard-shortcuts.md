# Keyboard shortcuts

Shortcuts apply inside the grid editor. On macOS, use `Cmd` wherever `Ctrl` is listed.

## Editing

| Shortcut | Action | Same as Excel |
| --- | --- | --- |
| `F2` | Edit the selected cell | Yes |
| `Enter` | Edit the selected cell, or confirm an edit | Yes |
| Any character | Start editing, replacing the cell's contents | Yes |
| `Escape` | Cancel the current edit | Yes |
| `Delete` | Clear the selected range | Yes |
| `Ctrl+X` | Cut the selection | Yes |
| `Ctrl+C` | Copy the selection | Yes |
| `Ctrl+V` | Paste | Yes |
| `Ctrl+Z` | Undo | Yes |
| `Ctrl+Y` | Redo | Yes |
| `Ctrl+D` | Fill down | Yes |
| `Ctrl+R` | Fill right | Yes |

## Selection and navigation

| Shortcut | Action | Same as Excel |
| --- | --- | --- |
| `Ctrl+A` | Select every cell | Yes |
| `Ctrl+Home` | Go to the first cell | Yes |
| `Ctrl+End` | Go to the last cell | Yes |
| `Ctrl+G` | Go to a cell by row and column | Yes |
| Arrow keys | Move the selection | Yes |
| `Shift` plus arrows | Extend the selection | Yes |
| Click a row number | Select the whole row | Yes |
| Click a column header | Select the whole column | Yes |

**Go to cell** accepts `120` for a row, or `120:price` and `120:5` for a row and column. Column names are matched case-insensitively.

## Filtering and search

| Shortcut | Action | Same as Excel |
| --- | --- | --- |
| `Ctrl+F` | Find and replace | Yes |
| `Enter` in the find box | Next match | Yes |
| `Shift+Enter` in the find box | Previous match | Yes |
| `Alt+Down` | Open the AutoFilter for the current column | Yes |
| `Escape` | Close the find bar, or the open panel | Yes |

## Commands without a default binding

Everything else is on the toolbar menus and in the Command Palette under the **CSV** category. To bind one, open **Preferences: Open Keyboard Shortcuts** and search for `csv.`.

| Command | Identifier |
| --- | --- |
| Open in Grid Editor | `csv.openGrid` |
| Open as Text | `csv.openAsText` |
| Find and Replace in Grid | `csv.find` |
| Column Statistics | `csv.columnStats` |
| Chart a Column | `csv.chart` |
| Run SQL Query | `csv.runSql` |
| Export As… | `csv.export` |
| Toggle Header Row | `csv.toggleHeaderRow` |
| Set Delimiter | `csv.setDelimiter` |
| Run Pipeline… | `csv.runPipeline` |
| Open Pipeline Builder | `csv.openPipelinePanel` |
| New Pipeline | `csv.newPipeline` |
| New Pipeline Script | `csv.newPipelineScript` |
| Show Pipeline Log | `csv.showPipelineLog` |
| Show Actions | `csv.showActions` |

Example binding in `keybindings.json`:

```json
{
  "key": "ctrl+shift+q",
  "command": "csv.runSql",
  "when": "activeCustomEditorId == csvPlus.gridEditor"
}
```
