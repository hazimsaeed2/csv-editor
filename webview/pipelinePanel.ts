import { TabulatorFull as Tabulator, type ColumnDefinition } from "tabulator-tables";
import { EXPORT_FORMATS, type ExportFormat } from "../src/core/export";
import type { PipelineListItem, PipelineRunSummary } from "../src/core/messages";
import {
  defaultStep,
  STEP_DEFINITIONS,
  stepDefinition,
  type Pipeline,
  type PipelineStep,
  type StepFieldDef,
  type StepKind
} from "../src/core/pipeline";
import type { CsvTable } from "../src/core/types";
import { columnNames } from "../src/core/types";
import { button, clear, h } from "./dom";
import { post } from "./vscodeApi";

const OUTPUT_TARGETS: { value: string; label: string }[] = [
  { value: "newDocument", label: "Open as new document" },
  { value: "replace", label: "Replace this document" },
  { value: "file", label: "Write to file (path below)" },
  { value: "clipboard", label: "Copy to clipboard" }
];

/**
 * Pipeline builder: no-code step forms, low-code expressions, code steps,
 * preview and apply. Pipelines are saved as `*.csvpipe.json` in the workspace.
 */
export class PipelinePanel {
  readonly element: HTMLElement;
  private pipeline: Pipeline = { name: "New pipeline", steps: [], trigger: "manual", output: { target: "newDocument", format: "csv" } };
  private path: string | undefined;
  private scriptsAllowed = true;
  private model: CsvTable;
  private requestId = 0;
  private pending: number | undefined;
  private resultTable: Tabulator | undefined;

  private readonly listSelect = h("select", { class: "panel-select", "aria-label": "Saved pipelines" });
  private readonly nameInput = h("input", { type: "text", class: "grow", placeholder: "Pipeline name", "aria-label": "Pipeline name" });
  private readonly triggerSelect = h(
    "select",
    { "aria-label": "Trigger", title: "When to run automatically" },
    h("option", { value: "manual" }, "Manual"),
    h("option", { value: "onOpen" }, "On open (pre-process)"),
    h("option", { value: "onSave" }, "On save (post-process)")
  );
  private readonly applyToInput = h("input", { type: "text", class: "grow", placeholder: "applyTo globs, e.g. data/*.csv", "aria-label": "Apply to" });
  private readonly targetSelect = h("select", { "aria-label": "Output target" });
  private readonly formatSelect = h("select", { "aria-label": "Output format" });
  private readonly pathInput = h("input", { type: "text", class: "grow", placeholder: "out/${name}.json", "aria-label": "Output path" });
  private readonly stepsEl = h("div", { class: "steps" });
  private readonly addKind = h("select", { "aria-label": "Step kind" });
  private readonly status = h("div", { class: "muted small pipeline-status" });
  private readonly report = h("div", { class: "pipeline-report" });
  private readonly results = h("div", { class: "sql-results" });
  private readonly pathLabel = h("span", { class: "muted small" });

  constructor(model: CsvTable) {
    this.model = model;
    for (const t of OUTPUT_TARGETS) {
      this.targetSelect.append(h("option", { value: t.value }, t.label));
    }
    for (const f of EXPORT_FORMATS) {
      this.formatSelect.append(h("option", { value: f.id }, f.label));
    }
    const tiers: Record<string, string> = { "no-code": "No-code", "low-code": "Low-code (expression)", code: "Code" };
    for (const tier of ["no-code", "low-code", "code"]) {
      const group = h("optgroup", { label: tiers[tier] });
      for (const def of STEP_DEFINITIONS.filter((d) => d.tier === tier)) {
        group.append(h("option", { value: def.kind, title: def.description }, def.label));
      }
      this.addKind.append(group);
    }

    this.element = h(
      "div",
      { class: "panel-content pipeline-panel" },
      h(
        "div",
        { class: "panel-row" },
        this.listSelect,
        button("Load", () => this.loadSelected(), { title: "Load the selected pipeline file" }),
        button("New", () => this.reset(), { title: "Start an empty pipeline" }),
        button("↻", () => post({ type: "pipelineListRequest" }), { class: "icon", title: "Refresh list" })
      ),
      h("div", { class: "panel-row" }, this.nameInput, this.triggerSelect),
      h("div", { class: "panel-row" }, this.applyToInput),
      h("h4", {}, "Steps"),
      this.stepsEl,
      h(
        "div",
        { class: "panel-row" },
        this.addKind,
        button("+ Add step", () => this.addStep(), { title: "Append a step" })
      ),
      h("h4", {}, "Output"),
      h("div", { class: "panel-row" }, this.targetSelect, this.formatSelect),
      h("div", { class: "panel-row" }, this.pathInput),
      h(
        "div",
        { class: "panel-row" },
        button("Preview", () => this.run("preview"), { class: "primary", title: "Run the pipeline and show the result below" }),
        button("Apply to document", () => this.run("apply"), { title: "Run and replace the document contents (undoable)" }),
        button("Run with output", () => this.run("output"), { title: "Run and deliver to the configured output" }),
        button("Save", () => this.save(), { title: "Save as a .csvpipe.json file in the workspace" }),
        button("Open JSON", () => post({ type: "pipelineOpenFile", path: this.path }), { title: "Open the pipeline file in the text editor" })
      ),
      this.pathLabel,
      this.status,
      this.report,
      this.results
    );

    this.nameInput.addEventListener("input", () => {
      this.pipeline.name = this.nameInput.value;
    });
    this.triggerSelect.addEventListener("change", () => {
      this.pipeline.trigger = this.triggerSelect.value as Pipeline["trigger"];
    });
    this.applyToInput.addEventListener("input", () => {
      this.pipeline.applyTo = this.applyToInput.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    });
    const syncOutput = (): void => {
      this.pipeline.output = {
        target: this.targetSelect.value as NonNullable<Pipeline["output"]>["target"],
        format: this.formatSelect.value as ExportFormat,
        path: this.pathInput.value.trim() || undefined
      };
      this.pathInput.hidden = this.targetSelect.value !== "file";
    };
    this.targetSelect.addEventListener("change", syncOutput);
    this.formatSelect.addEventListener("change", syncOutput);
    this.pathInput.addEventListener("input", syncOutput);

    this.renderHeader();
    this.renderSteps();
    post({ type: "pipelineListRequest" });
  }

  setModel(model: CsvTable): void {
    this.model = model;
    this.renderSteps();
  }

  setList(items: PipelineListItem[], scriptsAllowed: boolean): void {
    this.scriptsAllowed = scriptsAllowed;
    clear(this.listSelect);
    this.listSelect.append(h("option", { value: "" }, items.length === 0 ? "No *.csvpipe.json files in workspace" : "Saved pipelines…"));
    for (const item of items) {
      this.listSelect.append(h("option", { value: item.path, title: item.path }, `${item.matches ? "★ " : ""}${item.name} (${item.trigger})`));
    }
    if (this.path) {
      this.listSelect.value = this.path;
    }
    this.status.textContent = scriptsAllowed ? "" : "Expression, script, SQL and command steps are disabled (untrusted workspace or csvPlus.pipelines.allowScripts).";
  }

  setPipeline(pipeline: Pipeline, path?: string): void {
    this.pipeline = { ...pipeline, steps: pipeline.steps.map((s) => ({ ...s })) };
    this.path = path;
    this.renderHeader();
    this.renderSteps();
    this.pathLabel.textContent = path ? `File: ${path}` : "Unsaved pipeline";
    if (path) {
      this.listSelect.value = path;
    }
  }

  receive(requestId: number, result: PipelineRunSummary | undefined, error: string | undefined, applied: boolean | undefined): void {
    if (requestId !== this.pending) {
      return;
    }
    this.pending = undefined;
    clear(this.report);
    if (error) {
      this.status.textContent = error;
      this.status.classList.add("error");
      return;
    }
    this.status.classList.remove("error");
    if (!result) {
      return;
    }
    const failed = result.steps.find((s) => s.error);
    this.status.textContent = failed
      ? `Stopped at step ${failed.index + 1}: ${failed.error}`
      : `${result.totalRows.toLocaleString()} rows × ${result.columns.length} columns${applied ? " — applied to the document" : ""}`;
    this.status.classList.toggle("error", Boolean(failed));
    const list = h("ol", { class: "step-report" });
    for (const s of result.steps) {
      list.append(
        h(
          "li",
          { class: s.error ? "error" : s.skipped ? "muted" : "" },
          `${s.label}: ${s.skipped ? "skipped" : `${s.rowsIn.toLocaleString()} → ${s.rowsOut.toLocaleString()} rows, ${s.columnsOut} cols (${s.durationMs} ms)`}${s.error ? ` — ${s.error}` : ""}`
        )
      );
    }
    this.report.append(list);
    this.renderResult(result);
  }

  private reset(): void {
    this.setPipeline({ name: "New pipeline", steps: [], trigger: "manual", output: { target: "newDocument", format: "csv" } });
    this.listSelect.value = "";
  }

  private loadSelected(): void {
    const path = this.listSelect.value;
    if (path) {
      post({ type: "pipelineLoad", path });
    }
  }

  private save(): void {
    post({ type: "pipelineSave", pipeline: this.pipeline, path: this.path });
  }

  private run(mode: "preview" | "apply" | "output"): void {
    if (this.pipeline.steps.length === 0) {
      this.status.textContent = "Add at least one step.";
      return;
    }
    this.requestId += 1;
    this.pending = this.requestId;
    this.status.classList.remove("error");
    this.status.textContent = "Running…";
    post({ type: "pipelineRun", pipeline: this.pipeline, mode, requestId: this.requestId });
  }

  // --- Rendering ------------------------------------------------------------

  private renderHeader(): void {
    this.nameInput.value = this.pipeline.name;
    this.triggerSelect.value = this.pipeline.trigger ?? "manual";
    this.applyToInput.value = (this.pipeline.applyTo ?? []).join(", ");
    this.targetSelect.value = this.pipeline.output?.target ?? "newDocument";
    this.formatSelect.value = this.pipeline.output?.format ?? "csv";
    this.pathInput.value = this.pipeline.output?.path ?? "";
    this.pathInput.hidden = this.targetSelect.value !== "file";
  }

  private addStep(): void {
    const kind = this.addKind.value as StepKind;
    this.pipeline.steps.push(defaultStep(kind));
    this.renderSteps();
    const last = this.stepsEl.lastElementChild?.querySelector<HTMLElement>("input, textarea, select");
    last?.focus();
  }

  private renderSteps(): void {
    clear(this.stepsEl);
    if (this.pipeline.steps.length === 0) {
      this.stepsEl.append(h("p", { class: "muted small" }, "No steps yet. Pick a kind below and add one."));
      return;
    }
    this.pipeline.steps.forEach((step, index) => this.stepsEl.append(this.renderStep(step, index)));
  }

  private renderStep(step: PipelineStep, index: number): HTMLElement {
    const def = stepDefinition(step.kind);
    const record = step as unknown as Record<string, unknown>;
    const isCode = def.tier !== "no-code";
    const header = h(
      "div",
      { class: "step-header" },
      h("span", { class: "step-index" }, String(index + 1)),
      h("span", { class: "step-title", title: def.description }, def.label),
      h("span", { class: `tier tier-${def.tier}` }, def.tier),
      h("span", { class: "spacer" }),
      this.iconButton("↑", "Move up", () => this.moveStep(index, -1), index === 0),
      this.iconButton("↓", "Move down", () => this.moveStep(index, 1), index === this.pipeline.steps.length - 1),
      this.iconButton(step.disabled ? "◌" : "●", step.disabled ? "Enable" : "Disable", () => {
        step.disabled = !step.disabled;
        this.renderSteps();
      }),
      this.iconButton("✕", "Remove", () => {
        this.pipeline.steps.splice(index, 1);
        this.renderSteps();
      })
    );
    const fields = h("div", { class: "step-fields" });
    for (const field of def.fields) {
      fields.append(this.renderField(field, record));
    }
    if (isCode && !this.scriptsAllowed) {
      fields.append(h("div", { class: "error small" }, "This step will not run: scripts are disabled."));
    }
    return h("div", { class: `step${step.disabled ? " disabled" : ""}` }, header, fields);
  }

  private iconButton(label: string, title: string, onClick: () => void, disabled = false): HTMLButtonElement {
    return button(label, onClick, { class: "icon", title, disabled });
  }

  private renderField(field: StepFieldDef, record: Record<string, unknown>): HTMLElement {
    const label = h("label", { class: "field-label" }, field.label);
    let input: HTMLElement;
    const columns = columnNames(this.model);
    const listId = `cols-${Math.random().toString(36).slice(2)}`;
    switch (field.type) {
      case "boolean": {
        const cb = h("input", { type: "checkbox" });
        cb.checked = Boolean(record[field.key]);
        cb.addEventListener("change", () => {
          record[field.key] = cb.checked;
        });
        input = cb;
        break;
      }
      case "select": {
        const sel = h("select", {});
        for (const opt of field.options ?? []) {
          sel.append(h("option", { value: opt.value }, opt.label));
        }
        sel.value = String(record[field.key] ?? field.options?.[0]?.value ?? "");
        sel.addEventListener("change", () => {
          record[field.key] = sel.value;
        });
        input = sel;
        break;
      }
      case "number": {
        const num = h("input", { type: "number", value: String(record[field.key] ?? "") });
        num.addEventListener("input", () => {
          record[field.key] = num.value === "" ? undefined : Number(num.value);
        });
        input = num;
        break;
      }
      case "code": {
        const ta = h("textarea", { class: "code", spellcheck: "false", placeholder: field.placeholder ?? "" });
        ta.value = String(record[field.key] ?? "");
        ta.addEventListener("input", () => {
          record[field.key] = ta.value;
        });
        input = ta;
        break;
      }
      case "columns": {
        const text = h("input", { type: "text", list: listId, placeholder: field.hint ?? "Comma-separated column names" });
        text.value = ((record[field.key] as string[] | undefined) ?? []).join(", ");
        text.addEventListener("input", () => {
          record[field.key] = text.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        });
        input = h("span", { class: "grow" }, text, this.columnList(listId, columns));
        break;
      }
      case "column": {
        const text = h("input", { type: "text", list: listId, placeholder: field.placeholder ?? "Column name" });
        text.value = String(record[field.key] ?? "");
        text.addEventListener("input", () => {
          record[field.key] = text.value;
        });
        input = h("span", { class: "grow" }, text, this.columnList(listId, columns));
        break;
      }
      default: {
        const text = h("input", { type: "text", placeholder: field.placeholder ?? "", class: field.type === "expression" ? "code" : "" });
        text.value = String(record[field.key] ?? "");
        text.addEventListener("input", () => {
          record[field.key] = text.value;
        });
        input = text;
      }
    }
    const hint = field.type === "expression" ? h("div", { class: "muted small" }, "Columns are variables; helpers: round(), upper(), contains(), iif(), date()…") : undefined;
    return h("div", { class: "field" }, label, input, hint);
  }

  private columnList(id: string, columns: string[]): HTMLDataListElement {
    const list = h("datalist", { id });
    for (const c of columns) {
      list.append(h("option", { value: c }));
    }
    return list;
  }

  private moveStep(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= this.pipeline.steps.length) {
      return;
    }
    const [step] = this.pipeline.steps.splice(index, 1);
    this.pipeline.steps.splice(to, 0, step);
    this.renderSteps();
  }

  private renderResult(result: PipelineRunSummary): void {
    this.resultTable?.destroy();
    clear(this.results);
    if (result.columns.length === 0) {
      return;
    }
    const container = h("div", { class: "sql-grid" });
    this.results.append(
      h("div", { class: "muted small" }, result.rows.length < result.totalRows ? `Preview of the first ${result.rows.length.toLocaleString()} rows` : "Result"),
      container
    );
    const columns: ColumnDefinition[] = result.columns.map((name, i) => ({ title: name, field: `r${i}`, headerSort: true }));
    const data = result.rows.map((row) => {
      const obj: Record<string, string> = {};
      row.forEach((v, i) => {
        obj[`r${i}`] = v;
      });
      return obj;
    });
    this.resultTable = new Tabulator(container, {
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
}
