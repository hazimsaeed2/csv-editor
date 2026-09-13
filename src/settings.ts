import * as vscode from "vscode";

export interface CsvSettings {
  hasHeaderRow: boolean;
  delimiter: string;
  maxRows: number;
  sqlResultLimit: number;
  rainbowColumns: boolean;
  rainbowMaxLines: number;
  lintFieldCount: boolean;
}

export function getSettings(scope?: vscode.ConfigurationScope): CsvSettings {
  const config = vscode.workspace.getConfiguration("csvPlus", scope);
  return {
    hasHeaderRow: config.get<boolean>("hasHeaderRow", true),
    delimiter: config.get<string>("delimiter", "auto"),
    maxRows: config.get<number>("maxRows", 100000),
    sqlResultLimit: config.get<number>("sqlResultLimit", 5000),
    rainbowColumns: config.get<boolean>("rainbowColumns", true),
    rainbowMaxLines: config.get<number>("rainbowMaxLines", 20000),
    lintFieldCount: config.get<boolean>("lintFieldCount", true)
  };
}

/** Per-document overrides (header row / delimiter) remembered across sessions. */
export interface DocumentOverrides {
  hasHeader?: boolean;
  delimiter?: string;
}

const OVERRIDE_KEY = "csv.documentOverrides";

export function getDocumentOverrides(state: vscode.Memento, uri: vscode.Uri): DocumentOverrides {
  const all = state.get<Record<string, DocumentOverrides>>(OVERRIDE_KEY, {});
  return all[uri.toString()] ?? {};
}

export async function setDocumentOverrides(
  state: vscode.Memento,
  uri: vscode.Uri,
  overrides: DocumentOverrides
): Promise<void> {
  const all = { ...state.get<Record<string, DocumentOverrides>>(OVERRIDE_KEY, {}) };
  const merged = { ...all[uri.toString()], ...overrides };
  if (merged.hasHeader === undefined && merged.delimiter === undefined) {
    delete all[uri.toString()];
  } else {
    all[uri.toString()] = merged;
  }
  await state.update(OVERRIDE_KEY, all);
}

export function isCsvLikeUri(uri: vscode.Uri): boolean {
  return /\.(csv|tsv|tab|psv)$/i.test(uri.path);
}

/** Delimiter as the user should read it. */
export function describeDelimiter(delimiter: string): string {
  switch (delimiter) {
    case ",":
      return "comma";
    case "\t":
      return "tab";
    case ";":
      return "semicolon";
    case "|":
      return "pipe";
    default:
      return JSON.stringify(delimiter);
  }
}

export const DELIMITER_CHOICES: { label: string; value: string }[] = [
  { label: "Auto-detect", value: "auto" },
  { label: "Comma ( , )", value: "," },
  { label: "Tab ( \\t )", value: "\t" },
  { label: "Semicolon ( ; )", value: ";" },
  { label: "Pipe ( | )", value: "|" }
];
