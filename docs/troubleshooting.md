# Troubleshooting

## The file opens as text instead of a grid

The spreadsheet grid is the default. Open it with **Open in Grid Editor** in the title bar, the Explorer context menu, **CSV: Open in Grid Editor**, or **Open With…** → **CSV Editor**.

If a file still opens as text, another editor association is winning. Check `workbench.editorAssociations` for a pattern covering that file, remove it, or use **Open With…** → **Configure Default Editor…** → **CSV Editor**. See [Getting started](getting-started.md).

## Columns are split in the wrong places

The delimiter was detected incorrectly, which happens on files with very few rows or an unusual mix of punctuation. Override it from the toolbar dropdown, or set `csvEditor.delimiter` for the workspace. The override is remembered per file.

## The first data row is being used as headers

Uncheck **Header row** in the toolbar. If most of your files have no header, set `csvEditor.hasHeaderRow` to `false` for the workspace.

## Numbers sort or aggregate as text

Column types are inferred from the data. A column is only numeric when at least 95 percent of its non-empty values parse as numbers, so a single stray value such as `n/a` or `1,2` can tip it to text.

Find the offending values with the Statistics panel's frequency table, or filter the column with **Is not empty** plus a text condition. Clean them with a find and replace, or a `replace` pipeline step.

## Rows are flagged as ragged

A row has a different number of fields than the header. Almost always this is an unescaped quote or delimiter earlier in the file. Click the ragged-row count in the status bar to normalize, which pads short rows and trims trailing blank cells, or open the file as text where the offending lines are marked in the Problems panel.

Normalizing never discards non-empty data: extra cells beyond the header width are kept.

## Only some of my rows are shown

Two possibilities. Either a filter is active, in which case the status bar reports it and offers a link to clear it, or the file is larger than `csvEditor.maxRows` and a banner says so.

## Find does not match rows I know exist

Find covers the rows loaded in the grid. On a file larger than `csvEditor.maxRows`, raise that setting or use the SQL panel, which always queries the whole file.

## A pipeline step will not run

Steps that evaluate code require a trusted workspace. Check the trust banner, and check `csvEditor.pipelines.allowScripts`. The pipeline panel says explicitly when these steps are disabled.

## A pipeline fails and I cannot see why

Open the **CSV Pipelines** output channel with **CSV: Show Pipeline Log**. It records each step's row counts, timing and the full error text, including anything an external command wrote to standard error.

## An external command step produces nothing

The command must read from standard input and write the result to standard output. Anything written to standard error is logged but not treated as data. A non-zero exit code fails the step. Test it in a terminal first:

```bash
cat data.csv | python3 scripts/clean.py | head
```

## A script file is not found

Script paths are workspace-relative and must resolve inside the workspace folder. Paths escaping the workspace are refused.

## Editing feels slow on a very large file

Every edit rewrites the document text, which is proportional to file size. For bulk changes on large files, prefer a pipeline: it applies the whole transformation in one pass and one undo step, rather than one edit per cell.

## The grid is empty but the file has content

If the file uses an encoding VS Code did not detect, the text document itself will look wrong too. Use **Reopen with Encoding** from the Command Palette.

## Reporting a bug

Open an issue at https://github.com/hazimsaeed2/csv-editor/issues with the extension version, your VS Code version and platform, what you expected, and a small file that reproduces the problem. Output from the **CSV Pipelines** channel helps for pipeline issues.
