import {
  TabulatorFull as Tabulator,
  type CellComponent,
  type ColumnComponent,
  type ColumnDefinition,
  type MenuObject,
  type MenuSeparator,
  type RowComponent
} from "tabulator-tables";
import {
  buildRowPredicate,
  describeFilter,
  distinctValues,
  filterKindFor,
  isFilterActive,
  type ColumnFilter
} from "../src/core/columnFilter";
import type { EditOp } from "../src/core/edits";
import { applyEdit } from "../src/core/edits";
import { toNumber } from "../src/core/infer";
import type { CellRect } from "../src/core/transform";
import type { ColumnType, CsvTable } from "../src/core/types";
import { columnCount, columnName } from "../src/core/types";
import { closeFilterPopup, openFilterPopup } from "./filterPopup";

export type RowObject = { _id: number } & Record<string, string | number>;

/** Every user-triggered action that needs the app's involvement. */
export type GridAction =
  // rows
  | "insertAbove"
  | "insertBelow"
  | "insertRows"
  | "duplicateRows"
  | "moveRowUp"
  | "moveRowDown"
  | "deleteRows"
  | "removeEmptyRows"
  | "removeDuplicates"
  // columns
  | "insertLeft"
  | "insertRight"
  | "renameColumn"
  | "duplicateColumn"
  | "moveColumnLeft"
  | "moveColumnRight"
  | "deleteColumns"
  | "hideColumns"
  | "showAllColumns"
  | "splitColumn"
  | "mergeColumns"
  | "autoFit"
  | "sortAsc"
  | "sortDesc"
  | "columnStats"
  | "columnChart"
  | "filterColumn"
  | "filterByValue"
  // data
  | "sortDialog"
  | "clearFilters"
  | "transpose"
  | "trim"
  | "upper"
  | "lower"
  | "title"
  | "fillEmpty"
  | "fillDown"
  | "fillRight"
  | "fillSeries"
  | "normalizeRows"
  | "clearContents"
  | "cut"
  | "copy"
  | "copyRowsJson"
  // view
  | "wrap"
  | "whitespace"
  | "goTo"
  | "selectAll";

/** What an action applies to: the clicked cell (if any) and the selection. */
export interface ActionContext {
  row?: number;
  col?: number;
  rows: number[];
  cols: number[];
  rect?: CellRect;
}

export interface GridCallbacks {
  onEdit(ops: EditOp[]): void;
  onSelectionChange(): void;
  onAction(action: GridAction, ctx: ActionContext): void;
  onColumnMoved(from: number, to: number): void;
}

export function fieldFor(col: number): string {
  return `c${col}`;
}

export function colFromField(field: string): number {
  return Number(field.slice(1));
}

function numericSorter(a: unknown, b: unknown): number {
  const na = toNumber(String(a ?? ""));
  const nb = toNumber(String(b ?? ""));
  const aNan = Number.isNaN(na);
  const bNan = Number.isNaN(nb);
  if (aNan && bNan) {
    return String(a ?? "").localeCompare(String(b ?? ""));
  }
  if (aNan) {
    return 1;
  }
  if (bNan) {
    return -1;
  }
  return na - nb;
}

/**
 * Wraps a Tabulator instance and keeps it in sync with a `CsvTable` model.
 * All user edits are turned into `EditOp`s and reported through callbacks.
 */
export class CsvGrid {
  readonly table: Tabulator;
  private model: CsvTable;
  private types: ColumnType[] = [];
  private matchKeys = new Set<string>();
  private currentMatch: string | undefined;
  private suppressEvents = false;
  private ready = false;
  private wrap = false;
  /** Excel-style AutoFilter state per column index. */
  private readonly filters = new Map<number, ColumnFilter>();
  private readonly filterButtons = new Map<number, HTMLButtonElement>();

  constructor(
    private readonly container: HTMLElement,
    model: CsvTable,
    types: ColumnType[],
    private readonly callbacks: GridCallbacks
  ) {
    this.model = model;
    this.types = types;
    // Options Tabulator 6 supports but its typings omit.
    const untypedRowHeader: Record<string, unknown> = {
      contextMenu: (_e: Event, cell: CellComponent) => this.cellMenu(cell)
    };
    this.table = new Tabulator(container, {
      data: this.toRows(),
      columns: this.buildColumns(),
      index: "_id",
      layout: "fitData",
      height: "100%",
      renderVertical: "virtual",
      renderHorizontal: "virtual",
      placeholder: "No rows in this file",
      selectableRange: true,
      selectableRangeColumns: true,
      selectableRangeRows: true,
      selectableRangeClearCells: true,
      selectableRangeClearCellsValue: "",
      editTriggerEvent: "dblclick",
      headerSortClickElement: "icon",
      movableColumns: true,
      clipboard: true,
      clipboardCopyStyled: false,
      clipboardCopyRowRange: "range",
      clipboardPasteParser: "range",
      clipboardPasteAction: "range",
      clipboardCopyConfig: { rowHeaders: false, columnHeaders: false },
      rowHeader: {
        ...untypedRowHeader,
        formatter: "rownum",
        headerSort: false,
        hozAlign: "center",
        resizable: false,
        frozen: true,
        minWidth: 48
      },
      columnDefaults: {
        headerHozAlign: "left",
        resizable: "header",
        headerSortTristate: true
      }
    });

    this.table.on("tableBuilt", () => {
      this.ready = true;
      this.applyFilters();
    });
    this.table.on("cellEdited", (cell: CellComponent) => this.handleCellEdited(cell));
    this.table.on("clipboardPasted", () => this.syncFromTableData());
    this.table.on("columnMoved", (column: ColumnComponent, columns: ColumnComponent[]) => {
      if (this.suppressEvents) {
        return;
      }
      const field = column.getField();
      if (!field?.startsWith("c")) {
        return;
      }
      const dataColumns = columns.filter((c) => c.getField()?.startsWith("c"));
      const to = dataColumns.indexOf(column);
      const from = colFromField(field);
      if (to >= 0 && to !== from) {
        this.callbacks.onColumnMoved(from, to);
      }
    });
    const selection = (): void => {
      if (!this.suppressEvents) {
        this.callbacks.onSelectionChange();
      }
    };
    this.table.on("rangeAdded", selection);
    this.table.on("rangeChanged", selection);
    this.table.on("rangeRemoved", selection);
  }

  get isReady(): boolean {
    return this.ready;
  }

  getModel(): CsvTable {
    return this.model;
  }

  getTypes(): ColumnType[] {
    return this.types;
  }

  numericColumns(): Set<number> {
    const set = new Set<number>();
    this.types.forEach((t, i) => {
      if (t === "number" || t === "integer") {
        set.add(i);
      }
    });
    return set;
  }

  /** Replace the model (after an external document change) and re-render. */
  async load(model: CsvTable, types: ColumnType[]): Promise<void> {
    const structureChanged =
      columnCount(model) !== columnCount(this.model) ||
      model.hasHeader !== this.model.hasHeader ||
      model.headers.join(" ") !== this.model.headers.join(" ") ||
      types.join(",") !== this.types.join(",");
    this.model = model;
    this.types = types;
    this.suppressEvents = true;
    try {
      if (structureChanged) {
        this.resetFilters();
        this.table.setColumns(this.buildColumns());
      }
      await this.table.replaceData(this.toRows());
    } finally {
      this.suppressEvents = false;
    }
    this.callbacks.onSelectionChange();
  }

  /** Apply ops locally (model + grid) and notify the host. */
  async applyLocal(ops: EditOp[], structural: boolean): Promise<void> {
    for (const op of ops) {
      applyEdit(this.model, op);
    }
    this.callbacks.onEdit(ops);
    if (structural) {
      this.suppressEvents = true;
      try {
        this.resetFilters();
        this.table.setColumns(this.buildColumns());
        await this.table.replaceData(this.toRows());
      } finally {
        this.suppressEvents = false;
      }
      return;
    }
    for (const op of ops) {
      if (op.kind === "setCell") {
        this.updateCellSilently(op.row, op.col, op.value);
      } else if (op.kind === "setCells") {
        for (const cell of op.cells) {
          this.updateCellSilently(cell.row, cell.col, cell.value);
        }
      }
    }
  }

  private updateCellSilently(row: number, col: number, value: string): void {
    const component = this.table.getRow(row);
    if (!component) {
      return;
    }
    const field = fieldFor(col);
    if (String((component.getData() as RowObject)[field] ?? "") !== value) {
      this.suppressEvents = true;
      try {
        void component.update({ [field]: value });
      } finally {
        this.suppressEvents = false;
      }
    }
  }

  // --- Selection --------------------------------------------------------------

  /** Row indices (model order) covered by the current selection ranges. */
  selectedRows(): number[] {
    const ids = new Set<number>();
    for (const range of this.table.getRanges()) {
      for (const row of range.getRows()) {
        ids.add((row.getData() as RowObject)._id);
      }
    }
    return [...ids].sort((a, b) => a - b);
  }

  /** Column indices covered by the current selection ranges. */
  selectedColumns(): number[] {
    const cols = new Set<number>();
    for (const range of this.table.getRanges()) {
      for (const column of range.getColumns()) {
        const field = column.getField();
        if (field && field.startsWith("c")) {
          cols.add(colFromField(field));
        }
      }
    }
    return [...cols].sort((a, b) => a - b);
  }

  /** Bounding rectangle of the selection in model coordinates (visible rows only). */
  selectionRect(): CellRect | undefined {
    const rows = this.selectedRows();
    const cols = this.selectedColumns();
    if (rows.length === 0 || cols.length === 0) {
      return undefined;
    }
    return { top: rows[0], bottom: rows[rows.length - 1], left: cols[0], right: cols[cols.length - 1] };
  }

  /** Selected cell values as a rectangular table (rows x columns of the ranges). */
  selectionAsTable(): { headers: string[]; rows: string[][]; values: string[] } {
    const rowIds = this.selectedRows();
    const cols = this.selectedColumns();
    const headers = cols.map((c) => columnName(this.model, c));
    const rows: string[][] = [];
    const values: string[] = [];
    for (const range of this.table.getRanges()) {
      for (const line of range.getStructuredCells()) {
        for (const cell of line) {
          values.push(String(cell.getValue() ?? ""));
        }
      }
    }
    for (const id of rowIds) {
      rows.push(cols.map((c) => this.model.rows[id]?.[c] ?? ""));
    }
    return { headers, rows, values };
  }

  activeCell(): { row: number; col: number } | undefined {
    const ranges = this.table.getRanges();
    const last = ranges[ranges.length - 1];
    if (!last) {
      return undefined;
    }
    // getBounds() returns internal cells and getCells() is nested at runtime
    // (both differ from the typings), so read the first structured cell.
    const start = last.getStructuredCells()[0]?.[0];
    if (!start) {
      return undefined;
    }
    const field = start.getField();
    if (!field || !field.startsWith("c")) {
      return undefined;
    }
    return { row: (start.getRow().getData() as RowObject)._id, col: colFromField(field) };
  }

  /**
   * Select a single cell (and scroll to it). Selection is driven through the
   * same mouse events Tabulator listens to, because `addRange()` lays ranges
   * out asynchronously and fails for cells outside the rendered window.
   */
  async selectCell(row: number, col: number): Promise<void> {
    const rowComponent = this.table.getRow(row);
    const cell = rowComponent?.getCell(fieldFor(col));
    if (!rowComponent || !cell) {
      return;
    }
    await this.scrollToCell(row, col);
    const el = cell.getElement();
    if (!el.isConnected) {
      return;
    }
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    this.callbacks.onSelectionChange();
  }

  /** Excel Ctrl+A: select every visible cell. */
  async selectAll(): Promise<void> {
    const rows = this.table.getRows("active");
    const columns = this.table.getColumns().filter((c) => c.isVisible() && c.getField()?.startsWith("c"));
    if (rows.length === 0 || columns.length === 0) {
      return;
    }
    const firstRow = (rows[0].getData() as RowObject)._id;
    const lastRow = (rows[rows.length - 1].getData() as RowObject)._id;
    const firstCol = colFromField(columns[0].getField());
    const lastCol = colFromField(columns[columns.length - 1].getField());
    await this.scrollToCell(firstRow, firstCol);
    const first = this.table.getRow(firstRow)?.getCell(fieldFor(firstCol))?.getElement();
    if (!first?.isConnected) {
      return;
    }
    first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await this.scrollToCell(lastRow, lastCol);
    const last = this.table.getRow(lastRow)?.getCell(fieldFor(lastCol))?.getElement();
    if (last?.isConnected) {
      last.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));
      last.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    } else {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    }
    this.callbacks.onSelectionChange();
  }

  /** Ctrl+Home / Ctrl+End. */
  async scrollToEdge(edge: "start" | "end"): Promise<void> {
    const rows = this.table.getRows("active");
    if (rows.length === 0) {
      return;
    }
    const cols = this.table.getColumns().filter((c) => c.isVisible() && c.getField()?.startsWith("c"));
    const row = edge === "start" ? rows[0] : rows[rows.length - 1];
    const col = edge === "start" ? cols[0] : cols[cols.length - 1];
    if (!col) {
      return;
    }
    await this.selectCell((row.getData() as RowObject)._id, colFromField(col.getField()));
  }

  /** Context for an action: clicked cell plus current selection. */
  contextFor(row?: number, col?: number): ActionContext {
    let rows = this.selectedRows();
    let cols = this.selectedColumns();
    if (row !== undefined && !rows.includes(row)) {
      rows = [row];
    }
    if (col !== undefined && !cols.includes(col)) {
      cols = [col];
    }
    if (rows.length === 0 && row !== undefined) {
      rows = [row];
    }
    if (cols.length === 0 && col !== undefined) {
      cols = [col];
    }
    const rect = rows.length > 0 && cols.length > 0 ? { top: rows[0], bottom: rows[rows.length - 1], left: cols[0], right: cols[cols.length - 1] } : undefined;
    return { row, col, rows, cols, rect };
  }

  // --- Find highlighting ----------------------------------------------------

  /** Highlight find matches. Keys are `${row}:${col}`. */
  setMatches(keys: Set<string>, current: string | undefined): void {
    this.matchKeys = keys;
    this.currentMatch = current;
    this.table.redraw(true);
  }

  async scrollToCell(row: number, col: number): Promise<void> {
    const component = this.table.getRow(row);
    if (!component) {
      return;
    }
    // Tabulator's scroll promises do not always settle (e.g. when nothing
    // needs to scroll), so never await them unbounded.
    const scrolls = Promise.all([
      this.table.scrollToRow(component, "center", false).catch(() => undefined),
      this.table.scrollToColumn(fieldFor(col), "middle", false).catch(() => undefined)
    ]);
    await Promise.race([scrolls, new Promise((resolve) => setTimeout(resolve, 120))]);
  }

  // --- Editing ----------------------------------------------------------------

  /** Begin editing a cell (used by F2/Enter). */
  editCell(row: number, col: number, initialValue?: string): void {
    const component = this.table.getRow(row);
    const cell = component?.getCell(fieldFor(col));
    if (!cell) {
      return;
    }
    cell.edit(true);
    if (initialValue !== undefined) {
      // Excel: typing on a selected cell replaces its content with the keystroke.
      const input = cell.getElement().querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
      if (input) {
        input.value = initialValue;
        input.setSelectionRange(initialValue.length, initialValue.length);
      }
    }
  }

  // --- Columns ----------------------------------------------------------------

  hiddenColumnCount(): number {
    return this.table.getColumns().filter((c) => !c.isVisible() && c.getField()?.startsWith("c")).length;
  }

  showAllColumns(): void {
    for (const column of this.table.getColumns()) {
      if (!column.isVisible()) {
        column.show();
      }
    }
  }

  hideColumns(cols: number[]): void {
    for (const col of cols) {
      this.table.getColumn(fieldFor(col))?.hide();
    }
  }

  /** Reset every column to its content-based width. */
  autoFitColumns(): void {
    for (const column of this.table.getColumns()) {
      if (column.getField()?.startsWith("c")) {
        column.setWidth(true);
      }
    }
    this.table.redraw(true);
  }

  setWrap(wrap: boolean): void {
    this.wrap = wrap;
    this.container.classList.toggle("csv-wrap", wrap);
    this.suppressEvents = true;
    try {
      this.table.setColumns(this.buildColumns());
    } finally {
      this.suppressEvents = false;
    }
    this.applyFilters();
  }

  setHighlightWhitespace(on: boolean): void {
    this.container.classList.toggle("csv-show-ws", on);
  }

  // --- Filters ----------------------------------------------------------------

  /** Remove every column filter and sort. */
  clearFilters(): void {
    this.resetFilters();
    this.table.clearSort();
  }

  activeFilterCount(): number {
    let n = 0;
    for (const f of this.filters.values()) {
      if (isFilterActive(f)) {
        n += 1;
      }
    }
    return n;
  }

  /** Filter a column to a single value (Excel "Filter by Selected Cell's Value"). */
  filterByValue(col: number, value: string): void {
    this.filters.set(col, { values: [value] });
    this.applyFilters();
  }

  /** Open the AutoFilter dropdown for a column (anchored to its header). */
  openFilter(col: number, anchor?: HTMLElement): void {
    const field = fieldFor(col);
    const column = this.table.getColumn(field);
    const target = anchor ?? this.filterButtons.get(col) ?? column?.getElement();
    if (!target) {
      return;
    }
    const kind = filterKindFor(this.types[col] ?? "string");
    // Cascade: only rows accepted by the *other* columns' filters contribute values.
    const others = new Map(this.filters);
    others.delete(col);
    const include = buildRowPredicate(others, this.types);
    const { values, truncated } = distinctValues(this.model, col, kind, include);
    openFilterPopup({
      columnName: columnName(this.model, col),
      kind,
      current: this.filters.get(col),
      values,
      truncated,
      anchor: target,
      onSort: (direction) => this.table.setSort(field, direction),
      onApply: (filter) => {
        if (filter) {
          this.filters.set(col, filter);
        } else {
          this.filters.delete(col);
        }
        this.applyFilters();
      },
      onClose: () => undefined
    });
  }

  private resetFilters(): void {
    closeFilterPopup();
    this.filters.clear();
    this.applyFilters();
  }

  private applyFilters(): void {
    if (!this.ready) {
      return;
    }
    if (this.activeFilterCount() === 0) {
      this.table.clearFilter(true);
    } else {
      const predicate = buildRowPredicate(this.filters, this.types);
      const rows = this.model.rows;
      this.table.setFilter((data: RowObject) => predicate(rows[data._id] ?? []));
    }
    for (const [col, btn] of this.filterButtons) {
      const filter = this.filters.get(col);
      const active = isFilterActive(filter);
      btn.classList.toggle("active", active);
      btn.title = active ? describeFilter(filter, filterKindFor(this.types[col] ?? "string")) : "Filter";
      btn.setAttribute("aria-pressed", String(active));
    }
    this.callbacks.onSelectionChange();
  }

  visibleRowCount(): number {
    return this.table.getDataCount("active");
  }

  // --- Rendering --------------------------------------------------------------

  private toRows(): RowObject[] {
    const width = columnCount(this.model);
    return this.model.rows.map((row, i) => {
      const obj: RowObject = { _id: i };
      for (let c = 0; c < width; c += 1) {
        obj[fieldFor(c)] = row[c] ?? "";
      }
      return obj;
    });
  }

  private titleElement(col: number): HTMLElement {
    const name = columnName(this.model, col);
    const label = document.createElement("span");
    label.className = "csv-col-name";
    label.textContent = name;
    label.title = `${name} (${this.types[col] ?? "string"}). Double-click to rename.`;
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.callbacks.onAction("renameColumn", this.contextFor(undefined, col));
    });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "csv-filter-btn";
    btn.title = "Filter";
    btn.setAttribute("aria-label", `Filter ${name}`);
    btn.textContent = "▾";
    const stop = (e: Event): void => e.stopPropagation();
    btn.addEventListener("mousedown", stop);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openFilter(col, btn);
    });
    this.filterButtons.set(col, btn);
    const wrap = document.createElement("span");
    wrap.className = "csv-col-title";
    wrap.append(label, btn);
    return wrap;
  }

  private buildColumns(): ColumnDefinition[] {
    const width = columnCount(this.model);
    const defs: ColumnDefinition[] = [];
    // Supported by Tabulator 6 but missing from (or mistyped in) its type definitions.
    const untyped: Record<string, unknown> = {
      maxInitialWidth: 360,
      contextMenu: (_e: Event, cell: CellComponent) => this.cellMenu(cell)
    };
    this.filterButtons.clear();
    for (let c = 0; c < width; c += 1) {
      const type = this.types[c] ?? "string";
      const numeric = type === "number" || type === "integer";
      defs.push({
        ...untyped,
        title: columnName(this.model, c),
        titleFormatter: () => this.titleElement(c),
        field: fieldFor(c),
        editor: this.wrap ? "textarea" : "input",
        variableHeight: this.wrap,
        sorter: numeric ? numericSorter : "string",
        hozAlign: numeric ? "right" : "left",
        headerMenu: () => this.columnMenu(c),
        formatter: (cell: CellComponent) => this.formatCell(cell, c),
        cssClass: `csv-type-${type} csv-rainbow-col-${c % 10}`
      });
    }
    return defs;
  }

  private formatCell(cell: CellComponent, col: number): HTMLElement {
    const value = String(cell.getValue() ?? "");
    const el = cell.getElement();
    const key = `${(cell.getRow().getData() as RowObject)._id}:${col}`;
    el.classList.toggle("csv-match", this.matchKeys.has(key));
    el.classList.toggle("csv-match-current", this.currentMatch === key);
    el.classList.toggle("csv-empty", value.length === 0);
    el.classList.toggle("csv-ws", value.length > 0 && value.trim() !== value);
    // Return an element so the value is inserted as text, never as HTML.
    const span = document.createElement("span");
    span.textContent = value;
    return span;
  }

  private handleCellEdited(cell: CellComponent): void {
    if (this.suppressEvents) {
      return;
    }
    const field = cell.getField();
    if (!field.startsWith("c")) {
      return;
    }
    const row = (cell.getRow().getData() as RowObject)._id;
    const col = colFromField(field);
    const value = String(cell.getValue() ?? "");
    if ((this.model.rows[row]?.[col] ?? "") === value) {
      return;
    }
    const op: EditOp = { kind: "setCell", row, col, value };
    applyEdit(this.model, op);
    this.callbacks.onEdit([op]);
  }

  /** After a paste, diff the grid's data against the model and emit the changes. */
  private syncFromTableData(): void {
    const width = columnCount(this.model);
    const cells: { row: number; col: number; value: string }[] = [];
    for (const data of this.table.getData() as RowObject[]) {
      const row = data._id;
      for (let c = 0; c < width; c += 1) {
        const value = String(data[fieldFor(c)] ?? "");
        if ((this.model.rows[row]?.[c] ?? "") !== value) {
          cells.push({ row, col: c, value });
        }
      }
    }
    if (cells.length === 0) {
      return;
    }
    const op: EditOp = { kind: "setCells", cells };
    applyEdit(this.model, op);
    this.callbacks.onEdit([op]);
  }

  // --- Menus ------------------------------------------------------------------

  private item<T extends RowComponent | CellComponent | ColumnComponent>(label: string, action: GridAction, ctx: () => ActionContext): MenuObject<T> {
    return { label, action: () => this.callbacks.onAction(action, ctx()) };
  }

  private columnMenu(col: number): (MenuObject<ColumnComponent> | MenuSeparator)[] {
    const ctx = (): ActionContext => this.contextFor(undefined, col);
    const it = (label: string, action: GridAction): MenuObject<ColumnComponent> => this.item(label, action, ctx);
    const selected = this.selectedColumns();
    const multi = selected.length > 1 && selected.includes(col);
    return [
      it("Sort ascending (rewrite file)", "sortAsc"),
      it("Sort descending (rewrite file)", "sortDesc"),
      it("Filter…", "filterColumn"),
      { separator: true },
      it("Rename column", "renameColumn"),
      it("Insert column left", "insertLeft"),
      it("Insert column right", "insertRight"),
      it("Duplicate column", "duplicateColumn"),
      it("Move left", "moveColumnLeft"),
      it("Move right", "moveColumnRight"),
      it(multi ? `Delete ${selected.length} selected columns` : "Delete column", "deleteColumns"),
      it(multi ? "Hide selected columns" : "Hide column", "hideColumns"),
      { separator: true },
      it("Split column…", "splitColumn"),
      it("Merge columns…", "mergeColumns"),
      it("Trim whitespace", "trim"),
      it("UPPER CASE", "upper"),
      it("lower case", "lower"),
      it("Title Case", "title"),
      it("Fill empty cells…", "fillEmpty"),
      { separator: true },
      it("Column statistics", "columnStats"),
      it("Chart this column", "columnChart")
    ];
  }

  private cellMenu(cell: CellComponent): (MenuObject<CellComponent> | MenuSeparator)[] {
    const field = cell.getField();
    const row = (cell.getRow().getData() as RowObject)._id;
    const col = field?.startsWith("c") ? colFromField(field) : undefined;
    const ctx = (): ActionContext => this.contextFor(row, col);
    const it = (label: string, action: GridAction): MenuObject<CellComponent> => this.item(label, action, ctx);
    const rows = this.selectedRows();
    const multiRows = rows.length > 1 && rows.includes(row);
    const selectedCols = this.selectedColumns();
    const items: (MenuObject<CellComponent> | MenuSeparator)[] = [it("Cut", "cut"), it("Copy", "copy"), it("Clear contents", "clearContents"), { separator: true }];
    if (col !== undefined) {
      items.push(
        it("Filter by this value", "filterByValue"),
        it("Fill down (Ctrl+D)", "fillDown"),
        it("Fill right (Ctrl+R)", "fillRight"),
        it("Fill series", "fillSeries"),
        { separator: true }
      );
    }
    items.push(
      it("Insert row above", "insertAbove"),
      it("Insert row below", "insertBelow"),
      it("Insert rows…", "insertRows"),
      it(multiRows ? "Duplicate rows" : "Duplicate row", "duplicateRows"),
      it("Move row up", "moveRowUp"),
      it("Move row down", "moveRowDown"),
      it(multiRows ? `Delete ${rows.length} rows` : "Delete row", "deleteRows"),
      it(multiRows ? "Copy rows as JSON" : "Copy row as JSON", "copyRowsJson")
    );
    if (col !== undefined) {
      items.push(
        { separator: true },
        it("Insert column left", "insertLeft"),
        it("Insert column right", "insertRight"),
        it(selectedCols.length > 1 && selectedCols.includes(col) ? `Delete ${selectedCols.length} selected columns` : "Delete column", "deleteColumns")
      );
    }
    return items;
  }
}
