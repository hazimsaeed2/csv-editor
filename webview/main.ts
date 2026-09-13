import "tabulator-tables/dist/css/tabulator.min.css";
import "./styles.css";

import type { EditOp } from "../src/core/edits";
import { EXPORT_FORMATS, exportTable, toJson, toMarkdown, type ExportFormat } from "../src/core/export";
import { payloadToTable, type HostMessage, type PanelId, type TablePayload, type WebviewSettings } from "../src/core/messages";
import type { PipelineStep } from "../src/core/pipeline";
import { formatNumber, summarizeValues } from "../src/core/stats";
import {
  duplicateColumnOps,
  duplicateRowIndices,
  emptyRowIndices,
  fillDownOps,
  fillRightOps,
  fillSeriesOps,
  mergeColumnsOps,
  raggedRowIndices,
  splitColumnOps
} from "../src/core/transform";
import type { ColumnType, CsvTable } from "../src/core/types";
import { columnCount, columnName } from "../src/core/types";
import { dedupeDialog, goToDialog, mergeDialog, sortDialog, splitDialog } from "./dialogs";
import { button, clear, confirmDialog, h, promptDialog } from "./dom";
import { FindBar } from "./findBar";
import { CsvGrid, type ActionContext, type GridAction } from "./grid";
import { PipelinePanel } from "./pipelinePanel";
import { SqlPanel } from "./sqlPanel";
import { StatsPanel } from "./statsPanel";
import { post } from "./vscodeApi";

const DELIMITERS: { value: string; label: string }[] = [
  { value: ",", label: "Comma" },
  { value: "\t", label: "Tab" },
  { value: ";", label: "Semicolon" },
  { value: "|", label: "Pipe" }
];

interface MenuEntry {
  label: string;
  action?: GridAction;
  run?: () => void;
  shortcut?: string;
  separator?: boolean;
}

class App {
  grid: CsvGrid | undefined;
  private findBar!: FindBar;
  private statsPanel: StatsPanel | undefined;
  private sqlPanel: SqlPanel | undefined;
  private pipelinePanel: PipelinePanel | undefined;
  private payload: TablePayload | undefined;
  /** Row counts captured at load time; the model's arrays are mutated by edits afterwards. */
  private loadedRows = 0;
  private totalRows = 0;
  private settings: WebviewSettings = { maxRows: 100000, sqlResultLimit: 5000 };
  private activePanel: PanelId = "none";
  private wrap = false;
  private showWhitespace = false;

  private readonly root = document.getElementById("app") as HTMLElement;
  private readonly toolbar = h("div", { class: "toolbar", role: "toolbar" });
  private readonly banner = h("div", { class: "banner", hidden: true });
  private readonly gridArea = h("div", { class: "grid-area" });
  private readonly gridEl = h("div", { class: "grid" });
  private readonly sidePanel = h("aside", { class: "side-panel", hidden: true });
  private readonly panelTabs = h("div", { class: "panel-tabs" });
  private readonly panelBody = h("div", { class: "panel-body" });
  private readonly statusBar = h("div", { class: "status-bar" });
  private readonly statusRows = h("span", {});
  private readonly statusSelection = h("span", {});
  private readonly statusHidden = h("span", { class: "link", hidden: true }, "Show hidden columns");
  private readonly statusFilters = h("span", { class: "link", hidden: true }, "Clear filters and sort");
  private readonly statusRagged = h("span", { class: "link", hidden: true }, "");

  private readonly headerCheckbox = h("input", { type: "checkbox", id: "hdr" });
  private readonly delimiterSelect = h("select", { "aria-label": "Delimiter", title: "Delimiter" });
  private readonly fileName = h("span", { class: "file-name" });
  private readonly openMenus = new Set<HTMLElement>();

  constructor() {
    this.buildToolbar();
    this.buildPanel();
    this.gridArea.append(this.gridEl);
    this.statusBar.append(this.statusRows, this.statusSelection, h("span", { class: "spacer" }), this.statusRagged, this.statusFilters, this.statusHidden);
    this.statusHidden.addEventListener("click", () => this.dispatch("showAllColumns"));
    this.statusFilters.addEventListener("click", () => this.dispatch("clearFilters"));
    this.statusRagged.addEventListener("click", () => this.dispatch("normalizeRows"));
    this.root.append(this.toolbar, this.banner, this.findBar.element, this.gridArea, this.sidePanel, this.statusBar);

    window.addEventListener("message", (event: MessageEvent<HostMessage>) => this.onHostMessage(event.data));
    window.addEventListener("keydown", (e) => this.onKeyDown(e), true);
    document.addEventListener("mousedown", (e) => {
      for (const menu of this.openMenus) {
        if (!menu.parentElement?.contains(e.target as Node)) {
          menu.hidden = true;
        }
      }
    });
    post({ type: "ready" });
  }

  // --- UI construction ----------------------------------------------------

  private buildToolbar(): void {
    this.findBar = new FindBar({
      getModel: () => this.model(),
      highlight: (keys, current) => this.grid?.setMatches(keys, current),
      reveal: (row, col) => this.grid?.scrollToCell(row, col) ?? Promise.resolve(),
      applyEdits: (ops) => this.applyLocal(ops, false)
    });

    for (const d of DELIMITERS) {
      this.delimiterSelect.append(h("option", { value: d.value }, d.label));
    }
    this.delimiterSelect.addEventListener("change", () => post({ type: "setDelimiter", delimiter: this.delimiterSelect.value }));
    this.headerCheckbox.addEventListener("change", () => post({ type: "setHeader", hasHeader: this.headerCheckbox.checked }));

    const rowsMenu = this.dropdown("Rows ▾", [
      { label: "Insert row above", action: "insertAbove" },
      { label: "Insert row below", action: "insertBelow" },
      { label: "Insert rows…", action: "insertRows" },
      { label: "Duplicate row(s)", action: "duplicateRows" },
      { label: "Move row up", action: "moveRowUp" },
      { label: "Move row down", action: "moveRowDown" },
      { separator: true, label: "" },
      { label: "Delete selected row(s)", action: "deleteRows" },
      { label: "Remove empty rows", action: "removeEmptyRows" },
      { label: "Remove duplicate rows…", action: "removeDuplicates" }
    ]);
    const columnsMenu = this.dropdown("Columns ▾", [
      { label: "Insert column left", action: "insertLeft" },
      { label: "Insert column right", action: "insertRight" },
      { label: "Rename column…", action: "renameColumn" },
      { label: "Duplicate column", action: "duplicateColumn" },
      { label: "Move column left", action: "moveColumnLeft" },
      { label: "Move column right", action: "moveColumnRight" },
      { separator: true, label: "" },
      { label: "Delete selected column(s)", action: "deleteColumns" },
      { label: "Hide selected column(s)", action: "hideColumns" },
      { label: "Show all columns", action: "showAllColumns" },
      { separator: true, label: "" },
      { label: "Split column…", action: "splitColumn" },
      { label: "Merge columns…", action: "mergeColumns" },
      { label: "Auto-fit column widths", action: "autoFit" }
    ]);
    const dataMenu = this.dropdown("Data ▾", [
      { label: "Sort…", action: "sortDialog" },
      { label: "Filter column…", action: "filterColumn", shortcut: "Alt+↓" },
      { label: "Clear filters and sort", action: "clearFilters" },
      { separator: true, label: "" },
      { label: "Fill down", action: "fillDown", shortcut: "Ctrl+D" },
      { label: "Fill right", action: "fillRight", shortcut: "Ctrl+R" },
      { label: "Fill series", action: "fillSeries" },
      { label: "Clear contents", action: "clearContents", shortcut: "Del" },
      { separator: true, label: "" },
      { label: "Trim whitespace (selected columns)", action: "trim" },
      { label: "UPPER CASE (selected columns)", action: "upper" },
      { label: "lower case (selected columns)", action: "lower" },
      { label: "Title Case (selected columns)", action: "title" },
      { label: "Fill empty cells…", action: "fillEmpty" },
      { separator: true, label: "" },
      { label: "Transpose", action: "transpose" },
      { label: "Normalize ragged rows", action: "normalizeRows" }
    ]);
    const viewMenu = this.dropdown("View ▾", [
      { label: "Wrap text", action: "wrap" },
      { label: "Highlight leading/trailing whitespace", action: "whitespace" },
      { label: "Auto-fit column widths", action: "autoFit" },
      { label: "Show all columns", action: "showAllColumns" },
      { separator: true, label: "" },
      { label: "Go to cell…", action: "goTo", shortcut: "Ctrl+G" },
      { label: "Select all", action: "selectAll", shortcut: "Ctrl+A" },
      { label: "Find and replace", run: () => this.findBar.show(), shortcut: "Ctrl+F" }
    ]);
    const exportMenu = this.buildExportMenu();

    this.toolbar.append(
      button("↶", () => post({ type: "command", command: "undo" }), { class: "icon", title: "Undo (Ctrl+Z)" }),
      button("↷", () => post({ type: "command", command: "redo" }), { class: "icon", title: "Redo (Ctrl+Y)" }),
      h("span", { class: "sep" }),
      h("label", { class: "check", for: "hdr", title: "Treat the first row as column names" }, this.headerCheckbox, "Header row"),
      this.delimiterSelect,
      h("span", { class: "sep" }),
      button("Find", () => this.findBar.show(), { title: "Find and replace (Ctrl+F)" }),
      rowsMenu,
      columnsMenu,
      dataMenu,
      viewMenu,
      h("span", { class: "sep" }),
      button("Stats", () => this.showPanel("stats"), { title: "Column statistics" }),
      button("Chart", () => this.showPanel("chart"), { title: "Chart a column" }),
      button("SQL", () => this.showPanel("sql"), { title: "Query the file with SQL" }),
      button("Pipeline", () => this.showPanel("pipeline"), { title: "Build and run data-processing pipelines" }),
      exportMenu,
      h("span", { class: "spacer" }),
      this.fileName,
      button("Open as text", () => post({ type: "openAsText" }), { title: "Open this file in the text editor" })
    );
  }

  private dropdown(label: string, entries: MenuEntry[]): HTMLElement {
    const list = h("div", { class: "menu-list", hidden: true, role: "menu" });
    for (const entry of entries) {
      if (entry.separator) {
        list.append(h("div", { class: "menu-sep" }));
        continue;
      }
      const item = button(entry.label, () => {
        list.hidden = true;
        if (entry.action) {
          this.dispatch(entry.action);
        } else {
          entry.run?.();
        }
      }, { role: "menuitem" });
      if (entry.shortcut) {
        item.append(h("kbd", {}, entry.shortcut));
      }
      list.append(item);
    }
    const trigger = button(label, () => {
      for (const other of this.openMenus) {
        if (other !== list) {
          other.hidden = true;
        }
      }
      list.hidden = !list.hidden;
    }, { "aria-haspopup": "menu" });
    this.openMenus.add(list);
    return h("div", { class: "menu" }, trigger, list);
  }

  private buildExportMenu(): HTMLElement {
    const list = h("div", { class: "menu-list", hidden: true, role: "menu" });
    const item = (label: string, action: () => void): HTMLButtonElement =>
      button(label, () => {
        list.hidden = true;
        action();
      }, { role: "menuitem" });

    list.append(h("div", { class: "muted small", style: "padding: 2px 14px" }, "Whole file"));
    for (const format of EXPORT_FORMATS) {
      list.append(item(format.label, () => post({ type: "export", format: format.id })));
    }
    list.append(h("div", { class: "menu-sep" }), h("div", { class: "muted small", style: "padding: 2px 14px" }, "Selection"));
    list.append(
      item("Copy selection as TSV", () => this.copySelection("tsv")),
      item("Copy selection as CSV", () => this.copySelection("csv")),
      item("Copy selection as Markdown", () => this.copySelection("markdown")),
      item("Copy selection as JSON", () => this.copySelection("json")),
      item("Open selection as new CSV", () => this.exportSelection("csv"))
    );

    const trigger = button("Export ▾", () => {
      for (const other of this.openMenus) {
        if (other !== list) {
          other.hidden = true;
        }
      }
      list.hidden = !list.hidden;
    }, { title: "Export or copy data", "aria-haspopup": "menu" });
    this.openMenus.add(list);
    return h("div", { class: "menu" }, trigger, list);
  }

  private buildPanel(): void {
    const tab = (id: PanelId, label: string): HTMLButtonElement => button(label, () => this.showPanel(id), { "data-panel": id });
    this.panelTabs.append(
      tab("stats", "Statistics"),
      tab("chart", "Chart"),
      tab("sql", "SQL"),
      tab("pipeline", "Pipeline"),
      button("✕", () => this.hidePanel(), { class: "close", title: "Close panel" })
    );
    const resizer = h("div", { class: "panel-resizer", title: "Drag to resize" });
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = this.sidePanel.getBoundingClientRect().width;
      const move = (ev: MouseEvent): void => {
        this.sidePanel.style.width = `${Math.max(240, startWidth + (startX - ev.clientX))}px`;
      };
      const up = (): void => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        this.grid?.table.redraw();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
    this.panelBody.className = "panel-body";
    this.panelBody.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;";
    this.sidePanel.append(resizer, this.panelTabs, this.panelBody);
  }

  // --- State ----------------------------------------------------------------

  private model(): CsvTable {
    return (
      this.grid?.getModel() ??
      payloadToTable({ headers: [], rows: [], delimiter: ",", hasHeader: true, types: [], totalRows: 0, truncated: false, fileName: "", readOnly: false })
    );
  }

  private async onHostMessage(message: HostMessage): Promise<void> {
    switch (message.type) {
      case "init":
        await this.loadTable(message.table, message.settings);
        break;
      case "sqlResult":
        this.sqlPanel?.receive(message.requestId, message.result, message.error);
        break;
      case "focusPanel":
        this.showPanel(message.panel);
        break;
      case "focusFind":
        this.findBar.show();
        break;
      case "setHeader":
        this.headerCheckbox.checked = message.hasHeader;
        break;
      case "setDelimiter":
        this.delimiterSelect.value = message.delimiter;
        break;
      case "pipelineList":
        this.pipelinePanel?.setList(message.items, message.scriptsAllowed);
        break;
      case "pipelineLoaded":
        this.showPanel("pipeline");
        this.pipelinePanel?.setPipeline(message.pipeline, message.path);
        break;
      case "pipelineResult":
        this.pipelinePanel?.receive(message.requestId, message.result, message.error, message.applied);
        break;
    }
  }

  private async loadTable(payload: TablePayload, settings: WebviewSettings): Promise<void> {
    this.payload = payload;
    this.settings = settings;
    this.loadedRows = payload.rows.length;
    this.totalRows = payload.totalRows;
    const model = payloadToTable(payload);
    const types: ColumnType[] = payload.types;

    this.headerCheckbox.checked = payload.hasHeader;
    this.delimiterSelect.value = payload.delimiter;
    if (this.delimiterSelect.value !== payload.delimiter) {
      this.delimiterSelect.append(h("option", { value: payload.delimiter }, JSON.stringify(payload.delimiter)));
      this.delimiterSelect.value = payload.delimiter;
    }
    this.fileName.textContent = payload.fileName;
    this.fileName.title = payload.fileName;

    if (payload.truncated) {
      this.banner.hidden = false;
      this.banner.textContent =
        `Showing the first ${this.loadedRows.toLocaleString()} of ${this.totalRows.toLocaleString()} rows ` +
        `(csvPlus.maxRows = ${this.settings.maxRows.toLocaleString()}). SQL still covers the whole file. ` +
        `Cell edits, find and statistics apply to the loaded rows. Whole-table rewrites ` +
        `(trim, case, fill empty, transpose, normalize) run on the host against the full file.`;
    } else {
      this.banner.hidden = true;
    }

    if (!this.grid) {
      this.grid = new CsvGrid(this.gridEl, model, types, {
        onEdit: (ops) => post({ type: "edit", ops }),
        onSelectionChange: () => this.updateStatus(),
        onAction: (action, ctx) => void this.onAction(action, ctx),
        onColumnMoved: (from, to) => void this.applyLocal([{ kind: "moveColumn", from, to }], true)
      });
      // Filter/sort events fire before Tabulator re-renders, so defer the count.
      const deferred = (): void => void window.setTimeout(() => this.updateStatus(), 0);
      this.grid.table.on("tableBuilt", () => this.updateStatus());
      this.grid.table.on("dataFiltered", deferred);
      this.grid.table.on("dataSorted", deferred);
      this.grid.table.on("columnVisibilityChanged", () => this.updateStatus());
    } else {
      await this.grid.load(model, types);
    }
    this.statsPanel?.setModel(model);
    this.sqlPanel?.setModel(model);
    this.pipelinePanel?.setModel(model);
    this.findBar.refresh();
    this.updateStatus();
  }

  /** Apply ops locally and send them to the host (the host writes the document). */
  private async applyLocal(ops: EditOp[], structural: boolean): Promise<void> {
    if (!this.grid || ops.length === 0) {
      return;
    }
    await this.grid.applyLocal(ops, structural);
    if (structural) {
      this.statsPanel?.setModel(this.grid.getModel());
      this.sqlPanel?.setModel(this.grid.getModel());
      this.pipelinePanel?.setModel(this.grid.getModel());
      this.findBar.refresh();
    }
    this.updateStatus();
  }

  /**
   * Run a no-code pipeline step on the host's full document model.
   * Never compute replaceAll from the (possibly truncated) webview rows.
   */
  private async applyStep(step: PipelineStep): Promise<void> {
    post({ type: "hostTransform", transform: { kind: "pipelineStep", step } });
  }

  // --- Actions ------------------------------------------------------------

  /** Dispatch a toolbar/keyboard action using the current selection as context. */
  private dispatch(action: GridAction): void {
    const active = this.grid?.activeCell();
    void this.onAction(action, this.grid?.contextFor(active?.row, active?.col) ?? { rows: [], cols: [] });
  }

  private async onAction(action: GridAction, ctx: ActionContext): Promise<void> {
    const model = this.model();
    const names = (cols: number[]): string[] => cols.map((c) => columnName(model, c));
    const needRows = (): number[] | undefined => {
      if (ctx.rows.length === 0) {
        post({ type: "info", message: "Select one or more rows first (click a row number)." });
        return undefined;
      }
      return ctx.rows;
    };
    const needCols = (): number[] | undefined => {
      if (ctx.cols.length === 0) {
        post({ type: "info", message: "Select one or more columns first (click a column header)." });
        return undefined;
      }
      return ctx.cols;
    };
    const col = ctx.col ?? ctx.cols[0];
    const rowIndex = ctx.row ?? ctx.rows[0];
    const lastRow = ctx.rows.length > 0 ? ctx.rows[ctx.rows.length - 1] : model.rows.length - 1;

    switch (action) {
      // --- rows
      case "insertAbove":
        await this.applyLocal([{ kind: "insertRows", index: rowIndex ?? 0, count: 1 }], true);
        break;
      case "insertBelow":
        await this.applyLocal([{ kind: "insertRows", index: lastRow + 1, count: 1 }], true);
        break;
      case "insertRows": {
        const answer = await promptDialog("How many rows to insert below the selection?", "5");
        const count = Number(answer);
        if (Number.isInteger(count) && count > 0) {
          await this.applyLocal([{ kind: "insertRows", index: lastRow + 1, count }], true);
        }
        break;
      }
      case "duplicateRows": {
        const rows = needRows();
        if (rows) {
          await this.applyLocal([{ kind: "insertRows", index: rows[rows.length - 1] + 1, count: rows.length, rows: rows.map((r) => [...(model.rows[r] ?? [])]) }], true);
        }
        break;
      }
      case "moveRowUp":
      case "moveRowDown": {
        const rows = needRows();
        if (!rows) {
          break;
        }
        if (rows.length !== 1) {
          post({ type: "info", message: "Select a single row to move it." });
          break;
        }
        const to = action === "moveRowUp" ? rows[0] - 1 : rows[0] + 1;
        if (to >= 0 && to < model.rows.length) {
          await this.applyLocal([{ kind: "moveRow", from: rows[0], to }], true);
          await this.grid?.selectCell(to, col ?? 0);
        }
        break;
      }
      case "deleteRows": {
        const rows = needRows();
        if (rows && (rows.length < 2 || (await confirmDialog(`Delete ${rows.length.toLocaleString()} rows?`)))) {
          await this.applyLocal([{ kind: "deleteRows", indices: rows }], true);
        }
        break;
      }
      case "removeEmptyRows": {
        const indices = emptyRowIndices(model);
        if (indices.length === 0) {
          post({ type: "info", message: "No empty rows." });
        } else if (await confirmDialog(`Remove ${indices.length.toLocaleString()} empty rows?`)) {
          await this.applyLocal([{ kind: "deleteRows", indices }], true);
        }
        break;
      }
      case "removeDuplicates": {
        const columns = await dedupeDialog(model);
        if (!columns) {
          break;
        }
        const indices = duplicateRowIndices(model, columns.length === columnCount(model) ? undefined : columns);
        if (indices.length === 0) {
          post({ type: "info", message: "No duplicate rows found." });
        } else if (await confirmDialog(`Remove ${indices.length.toLocaleString()} duplicate rows? The first occurrence of each is kept.`)) {
          await this.applyLocal([{ kind: "deleteRows", indices }], true);
        }
        break;
      }
      // --- columns
      case "insertLeft":
      case "insertRight": {
        const index = col === undefined ? columnCount(model) : action === "insertLeft" ? col : col + 1;
        const name = model.hasHeader ? await promptDialog("New column name", `Column ${index + 1}`) : `Column ${index + 1}`;
        if (name !== undefined) {
          await this.applyLocal([{ kind: "insertColumn", index, name }], true);
        }
        break;
      }
      case "renameColumn": {
        if (col === undefined || !needCols()) {
          break;
        }
        if (!model.hasHeader) {
          post({ type: "info", message: "Enable the header row to name columns." });
          break;
        }
        const name = await promptDialog("Rename column", columnName(model, col));
        if (name !== undefined && name !== model.headers[col]) {
          await this.applyLocal([{ kind: "renameColumn", index: col, name }], true);
        }
        break;
      }
      case "duplicateColumn":
        if (col !== undefined && needCols()) {
          await this.applyLocal(duplicateColumnOps(model, col), true);
        }
        break;
      case "moveColumnLeft":
      case "moveColumnRight": {
        if (col === undefined || !needCols()) {
          break;
        }
        const to = action === "moveColumnLeft" ? col - 1 : col + 1;
        if (to >= 0 && to < columnCount(model)) {
          await this.applyLocal([{ kind: "moveColumn", from: col, to }], true);
        }
        break;
      }
      case "deleteColumns": {
        const cols = needCols();
        if (cols && (await confirmDialog(cols.length === 1 ? `Delete column "${names(cols)[0]}"?` : `Delete ${cols.length} columns (${names(cols).join(", ")})?`))) {
          await this.applyLocal([{ kind: "deleteColumns", indices: cols }], true);
        }
        break;
      }
      case "hideColumns": {
        const cols = needCols();
        if (cols) {
          this.grid?.hideColumns(cols);
          this.updateStatus();
        }
        break;
      }
      case "showAllColumns":
        this.grid?.showAllColumns();
        this.updateStatus();
        break;
      case "splitColumn": {
        if (col === undefined || !needCols()) {
          break;
        }
        const result = await splitDialog(model, col);
        if (result) {
          await this.applyLocal(splitColumnOps(model, result.col, result), true);
        }
        break;
      }
      case "mergeColumns": {
        const result = await mergeDialog(model, ctx.cols);
        if (result) {
          await this.applyLocal(mergeColumnsOps(model, result.columns, result.separator, result.name, result.removeSources), true);
        }
        break;
      }
      case "autoFit":
        this.grid?.autoFitColumns();
        break;
      case "sortAsc":
      case "sortDesc":
        if (col !== undefined && needCols()) {
          const numeric = this.grid?.numericColumns().has(col) ?? false;
          await this.applyLocal([{ kind: "sortRows", col, direction: action === "sortAsc" ? "asc" : "desc", numeric }], true);
        }
        break;
      case "columnStats":
        this.showPanel("stats", col);
        break;
      case "columnChart":
        this.showPanel("chart", col);
        break;
      case "filterColumn":
        if (col !== undefined && needCols()) {
          this.grid?.openFilter(col);
        }
        break;
      case "filterByValue":
        if (col !== undefined && rowIndex !== undefined) {
          this.grid?.filterByValue(col, model.rows[rowIndex]?.[col] ?? "");
        }
        break;
      // --- data
      case "sortDialog": {
        const result = await sortDialog(model, this.grid?.numericColumns() ?? new Set(), col);
        if (!result) {
          break;
        }
        if (result.applyToFile) {
          const [first, ...then] = result.keys;
          await this.applyLocal([{ kind: "sortRows", col: first.col, direction: first.direction, numeric: first.numeric, then }], true);
        } else {
          // Tabulator applies the last sorter in the array first, so reverse for "then by" semantics.
          this.grid?.table.setSort(result.keys.map((k) => ({ column: `c${k.col}`, dir: k.direction })).reverse());
        }
        break;
      }
      case "clearFilters":
        this.grid?.clearFilters();
        this.updateStatus();
        break;
      case "transpose": {
        const rowsLabel = this.payload?.truncated ? this.totalRows : model.rows.length;
        if (await confirmDialog(`Transpose the whole table (${rowsLabel.toLocaleString()} rows × ${columnCount(model)} columns)?`)) {
          post({ type: "hostTransform", transform: { kind: "transpose" } });
        }
        break;
      }
      case "trim":
      case "upper":
      case "lower":
      case "title": {
        const cols = needCols();
        if (!cols) {
          break;
        }
        const columns = names(cols);
        await this.applyStep(action === "trim" ? { kind: "trim", columns } : { kind: "changeCase", columns, case: action });
        break;
      }
      case "fillEmpty": {
        const cols = needCols();
        if (!cols) {
          break;
        }
        const value = await promptDialog(`Fill empty cells in ${names(cols).join(", ")} with`, "0");
        if (value !== undefined) {
          await this.applyStep({ kind: "fillEmpty", columns: names(cols), value });
        }
        break;
      }
      case "fillDown":
      case "fillRight":
      case "fillSeries": {
        if (!ctx.rect || (ctx.rect.top === ctx.rect.bottom && ctx.rect.left === ctx.rect.right)) {
          post({ type: "info", message: "Select the range to fill, starting with the source cell(s)." });
          break;
        }
        const op = action === "fillDown" ? fillDownOps(model, ctx.rect) : action === "fillRight" ? fillRightOps(model, ctx.rect) : fillSeriesOps(model, ctx.rect);
        if (op) {
          await this.applyLocal([op], false);
        }
        break;
      }
      case "normalizeRows": {
        // Ragged detection on a truncated view can miss unloaded rows; the host
        // re-checks and rewrites the full document.
        const { indices, expected } = raggedRowIndices(model);
        if (indices.length === 0 && !this.payload?.truncated) {
          post({ type: "info", message: "Every row already has the same number of fields." });
          break;
        }
        const message = this.payload?.truncated && indices.length === 0
          ? `Normalize every row in the full file to ${expected} fields? The loaded prefix looks even; unloaded rows may still be ragged.`
          : this.payload?.truncated
            ? `Pad or trim at least ${indices.length.toLocaleString()} loaded rows to ${expected} fields (host will normalize the whole file)? Non-empty extra cells are kept.`
            : `Pad or trim ${indices.length.toLocaleString()} rows to ${expected} fields? Non-empty extra cells are kept.`;
        if (await confirmDialog(message)) {
          post({ type: "hostTransform", transform: { kind: "normalizeRows", width: expected } });
        }
        break;
      }
      case "clearContents":
      case "cut": {
        if (!ctx.rect) {
          break;
        }
        if (action === "cut") {
          this.grid?.table.copyToClipboard("range");
        }
        const cells: { row: number; col: number; value: string }[] = [];
        for (const r of ctx.rows) {
          for (const c of ctx.cols) {
            if ((model.rows[r]?.[c] ?? "") !== "") {
              cells.push({ row: r, col: c, value: "" });
            }
          }
        }
        if (cells.length > 0) {
          await this.applyLocal([{ kind: "setCells", cells }], false);
        }
        break;
      }
      case "copy":
        this.grid?.table.copyToClipboard("range");
        break;
      case "copyRowsJson": {
        const rows = needRows();
        if (rows) {
          post({ type: "copy", text: toJson({ ...model, rows: rows.map((r) => model.rows[r] ?? []) }) });
        }
        break;
      }
      // --- view
      case "wrap":
        this.wrap = !this.wrap;
        this.grid?.setWrap(this.wrap);
        break;
      case "whitespace":
        this.showWhitespace = !this.showWhitespace;
        this.grid?.setHighlightWhitespace(this.showWhitespace);
        break;
      case "goTo": {
        const target = await goToDialog(model);
        if (target) {
          await this.grid?.selectCell(Math.min(target.row, model.rows.length - 1), Math.min(target.col, columnCount(model) - 1));
        }
        break;
      }
      case "selectAll":
        await this.grid?.selectAll();
        break;
    }
  }

  private selectionTable(): CsvTable | undefined {
    const selection = this.grid?.selectionAsTable();
    if (!selection || selection.rows.length === 0) {
      post({ type: "info", message: "Select some cells first." });
      return undefined;
    }
    return { ...this.model(), headers: selection.headers, rows: selection.rows, hasHeader: true };
  }

  private copySelection(format: "tsv" | "csv" | "markdown" | "json"): void {
    const table = this.selectionTable();
    if (!table) {
      return;
    }
    const text = format === "markdown" ? toMarkdown(table) : exportTable(table, format);
    post({ type: "copy", text });
    post({ type: "info", message: `Copied ${table.rows.length.toLocaleString()} rows as ${format.toUpperCase()}.` });
  }

  private exportSelection(format: ExportFormat): void {
    const table = this.selectionTable();
    if (!table) {
      return;
    }
    post({ type: "export", format, table: { headers: table.headers, rows: table.rows } });
  }

  // --- Panels ---------------------------------------------------------------

  private showPanel(panel: PanelId, col?: number): void {
    if (panel === "none") {
      this.hidePanel();
      return;
    }
    this.activePanel = panel;
    this.sidePanel.hidden = false;
    for (const el of this.panelTabs.querySelectorAll<HTMLButtonElement>("button[data-panel]")) {
      el.classList.toggle("active", el.dataset.panel === panel);
    }
    clear(this.panelBody);
    if (panel === "sql") {
      this.sqlPanel ??= new SqlPanel(this.model());
      this.panelBody.append(this.sqlPanel.element);
      this.sqlPanel.focus();
    } else if (panel === "pipeline") {
      this.pipelinePanel ??= new PipelinePanel(this.model());
      this.panelBody.append(this.pipelinePanel.element);
      this.sidePanel.style.width = `${Math.max(this.sidePanel.getBoundingClientRect().width, 480)}px`;
    } else {
      this.statsPanel ??= new StatsPanel(this.model(), () =>
        this.payload?.truncated ? `Statistics cover the ${this.loadedRows.toLocaleString()} loaded rows.` : undefined
      );
      this.panelBody.append(this.statsPanel.element);
      this.statsPanel.show(panel, col ?? this.grid?.activeCell()?.col);
    }
    this.grid?.table.redraw();
  }

  private hidePanel(): void {
    this.activePanel = "none";
    this.sidePanel.hidden = true;
    this.grid?.table.redraw();
  }

  // --- Status ---------------------------------------------------------------

  private updateStatus(): void {
    const model = this.model();
    const total = this.payload?.truncated ? this.totalRows + (model.rows.length - this.loadedRows) : model.rows.length;
    const cols = columnCount(model);
    if (!this.grid?.isReady) {
      // Tabulator module functions are only available once the table is built.
      this.statusRows.textContent = `${total.toLocaleString()} rows × ${cols.toLocaleString()} columns`;
      return;
    }
    const visible = this.grid.visibleRowCount();
    const filtered = visible !== model.rows.length;
    const filterCount = this.grid.activeFilterCount();
    this.statusRows.textContent =
      `${total.toLocaleString()} rows × ${cols.toLocaleString()} columns` +
      (filtered ? ` · ${visible.toLocaleString()} shown` : "") +
      (filterCount > 0 ? ` · filtered on ${filterCount} column${filterCount === 1 ? "" : "s"}` : "");
    this.statusFilters.hidden = !filtered && this.grid.table.getSorters().length === 0;
    this.statusHidden.hidden = this.grid.hiddenColumnCount() === 0;
    const ragged = raggedRowIndices(model);
    this.statusRagged.hidden = ragged.indices.length === 0;
    this.statusRagged.textContent = `${ragged.indices.length.toLocaleString()} ragged row${ragged.indices.length === 1 ? "" : "s"}`;
    this.statusRagged.title = `${ragged.indices.length} rows have a different number of fields than the header (${ragged.expected}). Click to normalize.`;

    const selection = this.grid.selectionAsTable();
    if (!selection || selection.values.length <= 1) {
      this.statusSelection.textContent = "";
      return;
    }
    const summary = summarizeValues(selection.values);
    const parts = [`Selected: ${summary.cells.toLocaleString()} cells`];
    if (summary.numeric > 0) {
      parts.push(`Sum ${formatNumber(summary.sum)}`, `Avg ${formatNumber(summary.mean)}`, `Min ${formatNumber(summary.min)}`, `Max ${formatNumber(summary.max)}`);
      if (summary.numeric !== summary.cells) {
        parts.push(`(${summary.numeric.toLocaleString()} numeric)`);
      }
    }
    this.statusSelection.textContent = parts.join(" · ");
  }

  // --- Keyboard -------------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === "f" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      this.findBar.show();
      return;
    }
    if (inField) {
      return;
    }
    if (e.key === "Escape") {
      if (this.findBar.visible) {
        this.findBar.hide();
      } else if (this.activePanel !== "none") {
        this.hidePanel();
      }
      return;
    }
    if (e.key === "ArrowDown" && e.altKey) {
      // Excel: Alt+Down opens the AutoFilter of the active column.
      const cell = this.grid?.activeCell();
      if (cell) {
        e.preventDefault();
        this.grid?.openFilter(cell.col);
      }
      return;
    }
    if (mod && !e.shiftKey && !e.altKey) {
      const shortcuts: Record<string, GridAction> = { d: "fillDown", r: "fillRight", g: "goTo", a: "selectAll", x: "cut" };
      const action = shortcuts[key];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        this.dispatch(action);
        return;
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        void this.grid?.scrollToEdge(e.key === "Home" ? "start" : "end");
        return;
      }
      return;
    }
    const cell = this.grid?.activeCell();
    if (!cell) {
      return;
    }
    if ((e.key === "F2" || e.key === "Enter") && !e.altKey) {
      e.preventDefault();
      this.grid?.editCell(cell.row, cell.col);
      return;
    }
    // Excel: typing on a selected cell starts editing with that character.
    if (!e.altKey && e.key.length === 1) {
      e.preventDefault();
      this.grid?.editCell(cell.row, cell.col, e.key);
    }
  }
}

declare global {
  interface Window {
    /** Debug hook so the grid can be driven from the developer console. */
    __csvApp?: App;
  }
}

window.__csvApp = new App();
