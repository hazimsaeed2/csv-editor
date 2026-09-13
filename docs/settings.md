# Settings

All settings live under the `csv.` prefix and can be set globally, per workspace, or per language with a `[csv]` block.

## The Settings view

The quickest way to change any of them is the CSV icon in the activity bar. Its **Settings** view groups every option under Parsing, Grid, Text mode and Pipelines, and shows each one's current value beside its name.

- Click a setting to change it. Booleans toggle immediately; choices open a picker; numbers open a prompt that validates the range.
- A setting explicitly set in the current scope gets a discard action to reset it to the default. **Reset All Settings** in the view menu clears every one at once.
- The control in the view title chooses whether edits go to **User** or **Workspace** settings. The active scope is shown next to the view name, and defaults to Workspace when a folder is open.
- **Open in Settings Editor** opens VS Code's own settings UI filtered to this extension.

### File overrides

When a delimited file is active, the view gains a **This file** group at the top showing its header-row and delimiter overrides. These are the per-file choices made from the grid toolbar, and they take precedence over everything below. Each can be changed or returned to following the settings, and the group has an action to clear both at once.

## Parsing

### `csvEditor.hasHeaderRow`

Default `true`. Treat the first row as column names. The toolbar checkbox overrides this for a single file, and that override is remembered.

### `csvEditor.delimiter`

Default `auto`. One of `auto`, `,`, `\t`, `;` or `|`. With `auto`, the delimiter is detected by scoring each candidate on how consistently it splits the first records, with the file extension as a tie-breaker: `.tsv` and `.tab` prefer tab, `.psv` prefers pipe. The toolbar dropdown overrides this per file.

## Grid

### `csvEditor.maxRows`

Default `100000`. How many rows are loaded into the grid view. SQL still queries the whole file. Cell edits, find and statistics apply to the loaded rows. Whole-table rewrites run on the host against the full file. Raising this costs memory and initial render time.

### `csvEditor.sqlResultLimit`

Default `5000`. Maximum rows returned to the SQL results panel. The query still runs over the whole file and the panel reports the true total when a result is truncated.

## Text mode

### `csvEditor.rainbowColumns`

Default `true`. Give each column a distinct, theme-aware text colour in both the spreadsheet grid and text mode. Grid colors use separate high-contrast palettes for light and dark themes, while text mode uses your theme's semantic token colours.

### `csvEditor.rainbowMaxLines`

Default `20000`. Only colour the first N lines, which keeps very large files responsive.

### `csvEditor.lintFieldCount`

Default `true`. Report rows whose field count differs from the header row as warnings in the Problems panel. A mismatch usually means an unescaped quote or delimiter. Multi-line quoted fields are handled correctly and are not flagged.

## Pipelines

### `csvEditor.pipelines.folder`

Default `.vscode/csv-pipelines`. Where the pipeline builder proposes to save new pipelines. Any `*.csvpipe.json` file anywhere in the workspace is discovered regardless of this setting.

### `csvEditor.pipelines.allowScripts`

Default `true`. Allow steps that evaluate code: `filter`, `compute`, `script`, `scriptFile`, `sql` and `command`. These never run in an untrusted workspace whatever this is set to. Setting it to `false` disables them everywhere; no-code steps continue to work.

### `csvEditor.pipelines.timeoutMs`

Default `10000`. Time limit for expression and script steps. External commands get six times this value.

### `csvEditor.pipelines.previewRows`

Default `1000`. Rows shown in the pipeline preview grid. Does not affect what is written when the pipeline runs for real.

## Related VS Code settings

| Setting | Why it matters |
| --- | --- |
| `workbench.editorAssociations` | The grid opens matching files by default. Set `"*.csv": "default"` (and the same for `.tsv` / `.tab` / `.psv`) only when you want rainbow-colored text mode as the default. |
| `files.encoding` | The grid reads and writes with the encoding VS Code uses for the document |
| `files.autoSave` | With `afterDelay`, grid edits save automatically, and `onSave` pipelines fire accordingly |
| `editor.semanticHighlighting.enabled` | Required for rainbow columns; the extension enables it for `csv` and `tsv` by default |

## Example configuration

```json
{
  "csvEditor.delimiter": "auto",
  "csvEditor.maxRows": 250000,
  "csvEditor.pipelines.allowScripts": true,
  "[csv]": {
    "editor.semanticHighlighting.enabled": true
  },
  "workbench.editorAssociations": {
    "*.csv": "csvEditor.gridEditor",
    "*.tsv": "csvEditor.gridEditor",
    "*.tab": "csvEditor.gridEditor",
    "*.psv": "csvEditor.gridEditor"
  }
}
```
