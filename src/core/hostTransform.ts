import { applyEdit, applyEdits, cloneTable, type EditOp } from "./edits";
import { applyPureStep, type PipelineStep } from "./pipeline";
import { normalizeRows, raggedRowIndices, transposeTable } from "./transform";
import type { CsvTable } from "./types";

/**
 * Whole-table rewrites that must run against the host's full document model.
 * The webview may only hold a `csvEditor.maxRows` prefix; computing these client-side
 * and pushing `{ kind: "replaceAll", rows }` would silently drop the unloaded tail.
 */
export type HostTransform =
  | { kind: "pipelineStep"; step: PipelineStep }
  | { kind: "transpose" }
  | { kind: "normalizeRows"; width?: number };

/** Apply a host-authoritative structural transform on a full table copy. */
export function applyHostTransform(table: CsvTable, transform: HostTransform): CsvTable {
  switch (transform.kind) {
    case "pipelineStep":
      return applyPureStep(cloneTable(table), transform.step);
    case "transpose": {
      const copy = cloneTable(table);
      return applyEdit(copy, transposeTable(copy));
    }
    case "normalizeRows": {
      const copy = cloneTable(table);
      const width = transform.width ?? raggedRowIndices(copy).expected;
      return applyEdit(copy, normalizeRows(copy, width));
    }
  }
}

/** True when the grid is showing a truncated prefix of the document. */
export function isTruncatedView(fullRowCount: number, maxRows: number): boolean {
  return fullRowCount > maxRows;
}

/**
 * Guard for webview `edit` messages: a `replaceAll` built from a truncated
 * webview model must never be applied to the host document.
 */
export function rejectReplaceAllWhileTruncated(
  ops: EditOp[],
  fullRowCount: number,
  maxRows: number
): string | undefined {
  if (!isTruncatedView(fullRowCount, maxRows)) {
    return undefined;
  }
  if (ops.some((op) => op.kind === "replaceAll")) {
    return (
      "CSV: refusing to replace the whole table while the grid is truncated. " +
      "Raise csvEditor.maxRows, or use a host-side transform / pipeline so unloaded rows are not dropped."
    );
  }
  return undefined;
}

/**
 * Reproduce the pre-fix failure mode: run a replaceAll-producing transform on a
 * sliced webview model, then apply that op to the full host table.
 * Used by regression tests; not called at runtime.
 */
export function applyTruncatedReplaceAllBug(full: CsvTable, maxRows: number, transform: HostTransform): CsvTable {
  const truncated = { ...cloneTable(full), rows: full.rows.slice(0, maxRows) };
  const after = applyHostTransform(truncated, transform);
  const host = cloneTable(full);
  return applyEdits(host, [
    {
      kind: "replaceAll",
      headers: after.hasHeader ? after.headers : host.headers,
      rows: after.rows
    }
  ]);
}
