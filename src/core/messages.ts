import type { EditOp } from "./edits";
import type { HostTransform } from "./hostTransform";
import type { ExportFormat } from "./export";
import type { Pipeline, StepReport } from "./pipeline";
import type { ColumnType, CsvTable } from "./types";

/** Table payload sent to the webview (possibly truncated for huge files). */
export interface TablePayload {
  headers: string[];
  rows: string[][];
  delimiter: string;
  hasHeader: boolean;
  types: ColumnType[];
  /** Total rows in the document, which may exceed `rows.length`. */
  totalRows: number;
  truncated: boolean;
  fileName: string;
  readOnly: boolean;
}

export interface SqlResult {
  columns: string[];
  rows: (string | number | null)[][];
  truncated: boolean;
  totalRows: number;
  durationMs: number;
}

export type PanelId = "stats" | "sql" | "chart" | "pipeline" | "none";

export interface PipelineListItem {
  name: string;
  /** Workspace-relative path of the .csvpipe.json file. */
  path: string;
  trigger: string;
  /** Whether the pipeline's applyTo globs match the current document. */
  matches: boolean;
}

export interface PipelineRunSummary {
  columns: string[];
  /** Preview rows (capped). */
  rows: string[][];
  totalRows: number;
  steps: StepReport[];
  ok: boolean;
}

/** Messages from the extension host to the webview. */
export type HostMessage =
  | { type: "init"; table: TablePayload; settings: WebviewSettings }
  | { type: "sqlResult"; result?: SqlResult; error?: string; requestId: number }
  | { type: "focusPanel"; panel: PanelId }
  | { type: "focusFind" }
  | { type: "setHeader"; hasHeader: boolean }
  | { type: "setDelimiter"; delimiter: string }
  | { type: "pipelineList"; items: PipelineListItem[]; scriptsAllowed: boolean }
  | { type: "pipelineLoaded"; pipeline: Pipeline; path?: string }
  | { type: "pipelineResult"; requestId: number; result?: PipelineRunSummary; error?: string; applied?: boolean };

export interface WebviewSettings {
  maxRows: number;
  sqlResultLimit: number;
  rainbowColumns: boolean;
}

/** Messages from the webview to the extension host. */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "edit"; ops: EditOp[] }
  | { type: "setHeader"; hasHeader: boolean }
  | { type: "setDelimiter"; delimiter: string }
  | { type: "sql"; sql: string; requestId: number }
  | { type: "export"; format: ExportFormat; selectionOnly?: boolean; table?: Pick<CsvTable, "headers" | "rows"> }
  | { type: "copy"; text: string }
  | { type: "openAsText" }
  | { type: "command"; command: "undo" | "redo" }
  | { type: "openSqlResultAsCsv"; columns: string[]; rows: (string | number | null)[][] }
  | { type: "pipelineListRequest" }
  | { type: "pipelineLoad"; path: string }
  | { type: "pipelineSave"; pipeline: Pipeline; path?: string }
  | { type: "pipelineOpenFile"; path?: string }
  | { type: "pipelineRun"; pipeline: Pipeline; mode: "preview" | "apply" | "output" | "export"; format?: ExportFormat; requestId: number }
  | { type: "info"; message: string }
  | { type: "error"; message: string }
  | { type: "hostTransform"; transform: HostTransform };

export function payloadToTable(payload: TablePayload): CsvTable {
  return {
    headers: payload.headers,
    rows: payload.rows,
    delimiter: payload.delimiter,
    hasHeader: payload.hasHeader,
    newline: "\n",
    trailingNewline: true,
    quoteChar: "\""
  };
}
