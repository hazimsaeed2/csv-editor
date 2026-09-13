import * as vscode from "vscode";
import { EXPORT_FORMATS, exportTable, type ExportFormat } from "./core/export";
import type { PipelineListItem, PipelineRunSummary } from "./core/messages";
import {
  matchesGlobs,
  resolveOutputPath,
  runPipeline,
  validatePipeline,
  type Pipeline,
  type PipelineResult,
  type PipelineTrigger
} from "./core/pipeline";
import type { CsvTable } from "./core/types";
import { columnNames } from "./core/types";
import type { CsvDocumentModel } from "./documentModel";
import { NodePipelineEvaluator } from "./pipelineEvaluator";
import { SqlEngine } from "./sqlEngine";
import { loadSqlJs } from "./sqlLoader";

const PIPELINE_GLOB = "**/*.csvpipe.json";

export interface PipelineSettings {
  folder: string;
  allowScripts: boolean;
  timeoutMs: number;
  previewRows: number;
}

export function getPipelineSettings(): PipelineSettings {
  const config = vscode.workspace.getConfiguration("csvPlus.pipelines");
  return {
    folder: config.get<string>("folder", ".vscode/csv-pipelines"),
    allowScripts: config.get<boolean>("allowScripts", true),
    timeoutMs: config.get<number>("timeoutMs", 10000),
    previewRows: config.get<number>("previewRows", 1000)
  };
}

const CODE_STEPS = new Set(["filter", "compute", "script", "scriptFile", "sql", "command"]);

/** Template for `CSV: New Pipeline`. */
export function pipelineTemplate(name: string, applyTo?: string): Pipeline {
  return {
    name,
    description: "Describe what this pipeline does.",
    applyTo: applyTo ? [applyTo] : [],
    trigger: "manual",
    output: { target: "newDocument", format: "csv" },
    steps: [
      { kind: "trim" },
      { kind: "filter", expression: "true", label: "Keep every row (edit me)" }
    ]
  };
}

export const SCRIPT_TEMPLATE = `// CSV Grid Editor pipeline script.
// Receives { columns, rows } where rows are objects keyed by column name
// (numeric/boolean columns are already coerced) and the helper library.
// Return an array of row objects, { columns, rows }, or nothing to keep
// in-place mutations.
module.exports = function transform({ columns, rows }, helpers) {
  return rows.map((row) => ({
    ...row,
    // example: add a computed column
    // total: helpers.round(row.price * row.qty, 2),
  }));
};
`;

/**
 * Discovers, loads, saves and runs pipelines, and handles their output.
 * Also wires the onOpen/onSave triggers.
 */
export class PipelineService {
  private readonly output = vscode.window.createOutputChannel("CSV Pipelines");
  private sqlEngine: Promise<SqlEngine> | undefined;
  /** Documents currently being written by a pipeline, to avoid save loops. */
  private readonly running = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(this.output);
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (/\.(csv|tsv|tab|psv)$/i.test(document.uri.path)) {
          void this.runTriggered("onSave", document);
        }
      })
    );
  }

  log(message: string): void {
    this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
  }

  scriptsAllowed(): boolean {
    return vscode.workspace.isTrusted && getPipelineSettings().allowScripts;
  }

  private workspaceFolderFor(uri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
    return (uri && vscode.workspace.getWorkspaceFolder(uri)) ?? vscode.workspace.workspaceFolders?.[0];
  }

  private relative(uri: vscode.Uri): string {
    return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
  }

  // --- Discovery --------------------------------------------------------------

  async list(documentUri?: vscode.Uri): Promise<PipelineListItem[]> {
    const files = await vscode.workspace.findFiles(PIPELINE_GLOB, "**/node_modules/**", 200);
    const items: PipelineListItem[] = [];
    const docPath = documentUri ? this.relative(documentUri) : undefined;
    for (const file of files) {
      try {
        const { pipeline } = await this.load(file);
        items.push({
          name: pipeline.name,
          path: this.relative(file),
          trigger: pipeline.trigger ?? "manual",
          matches: docPath !== undefined && matchesGlobs(docPath, pipeline.applyTo)
        });
      } catch (error) {
        items.push({ name: `${this.relative(file)} (invalid: ${error instanceof Error ? error.message : String(error)})`, path: this.relative(file), trigger: "manual", matches: false });
      }
    }
    items.sort((a, b) => Number(b.matches) - Number(a.matches) || a.name.localeCompare(b.name));
    return items;
  }

  async load(target: vscode.Uri | string): Promise<{ pipeline: Pipeline; uri: vscode.Uri }> {
    const uri = typeof target === "string" ? this.resolveWorkspacePath(target) : target;
    const bytes = await vscode.workspace.fs.readFile(uri);
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const errors = validatePipeline(parsed);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    return { pipeline: parsed as Pipeline, uri };
  }

  resolveWorkspacePath(relativePath: string): vscode.Uri {
    const folder = this.workspaceFolderFor();
    if (!folder) {
      throw new Error("Open a workspace folder to use pipelines.");
    }
    return vscode.Uri.joinPath(folder.uri, relativePath);
  }

  async save(pipeline: Pipeline, relativePath?: string): Promise<vscode.Uri | undefined> {
    const errors = validatePipeline(pipeline);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    let target = relativePath;
    if (!target) {
      const slug = pipeline.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pipeline";
      const suggested = `${getPipelineSettings().folder.replace(/\/$/, "")}/${slug}.csvpipe.json`;
      target = await vscode.window.showInputBox({ prompt: "Save pipeline as (workspace-relative path)", value: suggested });
      if (!target) {
        return undefined;
      }
      if (!target.endsWith(".csvpipe.json")) {
        target = `${target.replace(/\.json$/, "")}.csvpipe.json`;
      }
    }
    const uri = this.resolveWorkspacePath(target);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
    const content = JSON.stringify(pipeline, null, 2) + "\n";
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    this.log(`Saved pipeline "${pipeline.name}" to ${target}`);
    return uri;
  }

  async createFromTemplate(name: string, applyTo?: string): Promise<vscode.Uri | undefined> {
    return this.save(pipelineTemplate(name, applyTo));
  }

  async createScript(relativePath: string): Promise<vscode.Uri> {
    const uri = this.resolveWorkspacePath(relativePath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(SCRIPT_TEMPLATE, "utf8"));
    return uri;
  }

  // --- Running -----------------------------------------------------------------

  private sql(): Promise<SqlEngine> {
    if (!this.sqlEngine) {
      this.sqlEngine = loadSqlJs(this.context.extensionPath).then((SQL) => new SqlEngine(SQL));
    }
    return this.sqlEngine;
  }

  async run(pipeline: Pipeline, table: CsvTable, sourceUri?: vscode.Uri): Promise<PipelineResult> {
    const usesCode = pipeline.steps.some((s) => !s.disabled && CODE_STEPS.has(s.kind));
    if (usesCode && !this.scriptsAllowed()) {
      throw new Error(
        vscode.workspace.isTrusted
          ? "Expression, script, SQL and command steps are disabled by the csvPlus.pipelines.allowScripts setting."
          : "Expression, script, SQL and command steps only run in trusted workspaces."
      );
    }
    const folder = this.workspaceFolderFor(sourceUri);
    const evaluator = new NodePipelineEvaluator({
      workspaceRoot: folder?.uri.fsPath ?? process.cwd(),
      sql: () => this.sql(),
      log: (m) => this.log(m),
      timeoutMs: getPipelineSettings().timeoutMs
    });
    this.log(`Running "${pipeline.name}" on ${sourceUri ? this.relative(sourceUri) : "data"} (${table.rows.length} rows)`);
    const result = await runPipeline(table, pipeline, evaluator);
    this.log(result.ok ? `Done: ${result.table.rows.length} rows, ${columnNames(result.table).length} columns` : "Pipeline stopped with an error");
    return result;
  }

  summarize(result: PipelineResult): PipelineRunSummary {
    const limit = getPipelineSettings().previewRows;
    return {
      columns: columnNames(result.table),
      rows: result.table.rows.slice(0, limit),
      totalRows: result.table.rows.length,
      steps: result.steps,
      ok: result.ok
    };
  }

  /** Send the result where the pipeline's output config (or an override) says. */
  async deliver(
    result: PipelineResult,
    pipeline: Pipeline,
    sourceUri: vscode.Uri | undefined,
    model: CsvDocumentModel | undefined,
    override?: { target?: Pipeline["output"] extends infer O ? (O extends { target: infer T } ? T : never) : never; format?: ExportFormat }
  ): Promise<string> {
    const target = override?.target ?? pipeline.output?.target ?? "newDocument";
    const format: ExportFormat = override?.format ?? pipeline.output?.format ?? "csv";
    const table = result.table;
    switch (target) {
      case "replace": {
        if (model) {
          const ok = await model.writeTable({ ...table, delimiter: model.getTable().delimiter, newline: model.getTable().newline });
          if (!ok) {
            throw new Error("The document could not be modified.");
          }
        } else if (sourceUri) {
          const document = await vscode.workspace.openTextDocument(sourceUri);
          const text = exportTable(table, delimiterFormat(table.delimiter));
          const edit = new vscode.WorkspaceEdit();
          edit.replace(sourceUri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
          if (!(await vscode.workspace.applyEdit(edit))) {
            throw new Error("The document could not be modified.");
          }
        } else {
          throw new Error("No document to replace.");
        }
        return "Applied to the document (save to keep, undo to revert).";
      }
      case "newDocument": {
        const info = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];
        const doc = await vscode.workspace.openTextDocument({ content: exportTable(table, format), language: info.language });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
        return "Opened the result in a new editor.";
      }
      case "clipboard":
        await vscode.env.clipboard.writeText(exportTable(table, format));
        return "Copied the result to the clipboard.";
      case "file": {
        const template = override?.target === "file" && !pipeline.output?.path ? undefined : pipeline.output?.path;
        const info = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];
        const sourceRel = sourceUri ? this.relative(sourceUri) : "output.csv";
        let relPath = template ? resolveOutputPath(template, sourceRel, pipeline.name) : undefined;
        if (!relPath) {
          const fallback = resolveOutputPath(`\${dir}/\${name}-\${pipeline}.${info.extension}`, sourceRel, pipeline.name);
          relPath = await vscode.window.showInputBox({ prompt: "Output file (workspace-relative)", value: fallback });
          if (!relPath) {
            return "Cancelled.";
          }
        }
        const uri = this.resolveWorkspacePath(relPath);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(exportTable(table, format), "utf8"));
        this.log(`Wrote ${relPath}`);
        return `Wrote ${relPath}`;
      }
    }
    return "";
  }

  /** Run every pipeline whose trigger and applyTo match the document. */
  async runTriggered(trigger: PipelineTrigger, document: vscode.TextDocument, model?: CsvDocumentModel, table?: CsvTable): Promise<void> {
    const key = document.uri.toString();
    if (this.running.has(key)) {
      return;
    }
    const docPath = this.relative(document.uri);
    let items: PipelineListItem[];
    try {
      items = await this.list(document.uri);
    } catch {
      return;
    }
    const matching = items.filter((i) => i.matches && i.trigger === trigger);
    if (matching.length === 0) {
      return;
    }
    this.running.add(key);
    try {
      for (const item of matching) {
        try {
          const { pipeline } = await this.load(item.path);
          const input = table ?? model?.getTable() ?? (await import("./core/parse")).parseCsv(document.getText());
          const result = await this.run(pipeline, input, document.uri);
          if (!result.ok) {
            const failed = result.steps.find((s) => s.error);
            throw new Error(failed ? `${failed.label}: ${failed.error}` : "unknown error");
          }
          const override = trigger === "onOpen" && !pipeline.output ? { target: "replace" as const } : undefined;
          const message = await this.deliver(result, pipeline, document.uri, model, override);
          vscode.window.setStatusBarMessage(`CSV pipeline "${pipeline.name}" (${trigger}): ${message}`, 5000);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.log(`${trigger} pipeline "${item.name}" failed on ${docPath}: ${message}`);
          void vscode.window.showErrorMessage(`CSV pipeline "${item.name}" failed: ${message}`, "Show log").then((choice) => {
            if (choice) {
              this.output.show();
            }
          });
        }
      }
    } finally {
      this.running.delete(key);
    }
  }

  showLog(): void {
    this.output.show();
  }
}

function delimiterFormat(delimiter: string): ExportFormat {
  switch (delimiter) {
    case "\t":
      return "tsv";
    case ";":
      return "semicolon";
    case "|":
      return "pipe";
    default:
      return "csv";
  }
}
