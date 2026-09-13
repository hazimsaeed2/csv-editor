import { TabulatorFull as Tabulator, type ColumnDefinition } from "tabulator-tables";
import type { SqlResult } from "../src/core/messages";
import type { CsvTable } from "../src/core/types";
import { columnNames } from "../src/core/types";
import { button, clear, h } from "./dom";
import { post } from "./vscodeApi";

/** SQL console: runs queries in the host (SQLite via sql.js) and shows results. */
export class SqlPanel {
  readonly element: HTMLElement;
  private readonly editor: HTMLTextAreaElement;
  private readonly status: HTMLElement;
  private readonly results: HTMLElement;
  private readonly columnsHint: HTMLElement;
  private readonly openButton: HTMLButtonElement;
  private table: Tabulator | undefined;
  private lastResult: SqlResult | undefined;
  private requestId = 0;
  private pending: number | undefined;

  constructor(private model: CsvTable) {
    this.editor = h("textarea", {
      class: "sql-editor",
      spellcheck: "false",
      "aria-label": "SQL query",
      placeholder: "SELECT * FROM csv LIMIT 100"
    });
    this.editor.value = "SELECT *\nFROM csv\nLIMIT 100";
    this.status = h("div", { class: "sql-status muted small" }, "Table name: csv. Ctrl+Enter runs the query.");
    this.results = h("div", { class: "sql-results" });
    this.columnsHint = h("div", { class: "sql-columns muted small" });
    this.openButton = button("Open result as CSV", () => this.openResult(), { disabled: true });

    this.element = h(
      "div",
      { class: "panel-content sql-panel" },
      this.columnsHint,
      this.editor,
      h(
        "div",
        { class: "panel-row" },
        button("Run", () => this.run(), { class: "primary", title: "Run query (Ctrl+Enter)" }),
        this.openButton,
        button("Copy result as TSV", () => this.copyResult(), { title: "Copy the result set" })
      ),
      this.status,
      this.results
    );

    this.editor.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        this.run();
      }
    });
    this.renderColumns();
  }

  setModel(model: CsvTable): void {
    this.model = model;
    this.renderColumns();
  }

  focus(): void {
    this.editor.focus();
  }

  private renderColumns(): void {
    clear(this.columnsHint);
    const names = columnNames(this.model);
    this.columnsHint.append("Columns: ");
    names.forEach((name, i) => {
      const chip = h("code", { class: "chip", title: "Insert into query" }, name);
      chip.addEventListener("click", () => this.insertText(`"${name.replace(/"/g, "\"\"")}"`));
      this.columnsHint.append(chip, i < names.length - 1 ? " " : "");
    });
  }

  private insertText(text: string): void {
    const start = this.editor.selectionStart;
    const end = this.editor.selectionEnd;
    this.editor.setRangeText(text, start, end, "end");
    this.editor.focus();
  }

  run(): void {
    const sql = this.editor.value.trim();
    if (sql.length === 0) {
      return;
    }
    this.requestId += 1;
    this.pending = this.requestId;
    this.status.textContent = "Running…";
    this.status.classList.remove("error");
    post({ type: "sql", sql, requestId: this.requestId });
  }

  /** Called by the app when the host answers. */
  receive(requestId: number, result: SqlResult | undefined, error: string | undefined): void {
    if (requestId !== this.pending) {
      return;
    }
    this.pending = undefined;
    if (error || !result) {
      this.status.textContent = error ?? "Unknown error";
      this.status.classList.add("error");
      return;
    }
    this.lastResult = result;
    this.openButton.disabled = result.columns.length === 0;
    const shown = result.rows.length.toLocaleString();
    const total = result.totalRows.toLocaleString();
    this.status.textContent = result.truncated
      ? `Showing ${shown} of ${total} rows (${result.durationMs} ms). Raise csvEditor.sqlResultLimit to see more.`
      : `${total} row${result.totalRows === 1 ? "" : "s"} (${result.durationMs} ms)`;
    this.renderResult(result);
  }

  private renderResult(result: SqlResult): void {
    this.table?.destroy();
    clear(this.results);
    if (result.columns.length === 0) {
      this.results.append(h("p", { class: "muted" }, "Statement executed; no rows returned."));
      return;
    }
    const container = h("div", { class: "sql-grid" });
    this.results.append(container);
    const columns: ColumnDefinition[] = result.columns.map((name, i) => ({
      title: name,
      field: `r${i}`,
      headerSort: true,
      maxInitialWidth: 300
    }));
    const data = result.rows.map((row) => {
      const obj: Record<string, string | number | null> = {};
      row.forEach((v, i) => {
        obj[`r${i}`] = v;
      });
      return obj;
    });
    this.table = new Tabulator(container, {
      data,
      columns,
      layout: "fitData",
      height: "100%",
      renderVertical: "virtual",
      renderHorizontal: "virtual",
      selectableRange: true,
      selectableRangeColumns: true,
      selectableRangeRows: true,
      headerSortClickElement: "icon",
      clipboard: true,
      clipboardCopyRowRange: "range",
      clipboardCopyConfig: { rowHeaders: false, columnHeaders: false },
      rowHeader: { formatter: "rownum", headerSort: false, hozAlign: "center", resizable: false, frozen: true, minWidth: 40 },
      columnDefaults: { headerHozAlign: "left", resizable: "header" }
    });
  }

  private openResult(): void {
    if (!this.lastResult) {
      return;
    }
    post({ type: "openSqlResultAsCsv", columns: this.lastResult.columns, rows: this.lastResult.rows });
  }

  private copyResult(): void {
    if (!this.lastResult) {
      return;
    }
    const lines = [this.lastResult.columns.join("\t")];
    for (const row of this.lastResult.rows) {
      lines.push(row.map((v) => (v === null ? "" : String(v))).join("\t"));
    }
    post({ type: "copy", text: lines.join("\n") });
    post({ type: "info", message: `Copied ${this.lastResult.rows.length.toLocaleString()} rows.` });
  }
}
