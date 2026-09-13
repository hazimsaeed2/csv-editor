import * as vscode from "vscode";
import { delimiterForPath, detectDelimiter } from "./core/parse";
import { columnAtOffset, scanLine, type LineScan } from "./core/textScan";
import { getSettings } from "./settings";

/** Languages the text-mode helpers apply to. */
export const CSV_SELECTOR: vscode.DocumentSelector = [{ language: "csv" }, { language: "tsv" }];

export const RAINBOW_TOKEN_TYPES = Array.from({ length: 10 }, (_, i) => `csvColumn${i}`);

const delimiterCache = new WeakMap<vscode.TextDocument, { version: number; delimiter: string }>();

/** Delimiter for a text document, detected once per version. */
export function documentDelimiter(document: vscode.TextDocument): string {
  const cached = delimiterCache.get(document);
  if (cached && cached.version === document.version) {
    return cached.delimiter;
  }
  const settings = getSettings(document);
  const preferred = document.languageId === "tsv" ? "\t" : delimiterForPath(document.uri.path);
  const delimiter =
    settings.delimiter !== "auto"
      ? settings.delimiter
      : detectDelimiter(document.getText(new vscode.Range(0, 0, Math.min(document.lineCount, 200), 0)), preferred);
  delimiterCache.set(document, { version: document.version, delimiter });
  return delimiter;
}

/** Scan a line with quote state carried from preceding lines (bounded look-back). */
export function scanDocumentLine(document: vscode.TextDocument, line: number, delimiter: string): LineScan {
  let col = 0;
  let inQuote = false;
  const lookBack = Math.max(0, line - 50);
  for (let i = lookBack; i < line; i += 1) {
    const scan = scanLine(document.lineAt(i).text, delimiter, col, inQuote);
    if (scan.openQuote) {
      col = scan.fields[scan.fields.length - 1].col;
      inQuote = true;
    } else {
      col = 0;
      inQuote = false;
    }
  }
  return scanLine(document.lineAt(line).text, delimiter, col, inQuote);
}

/** Header names from the first line (empty when the header row is disabled). */
export function documentHeaders(document: vscode.TextDocument, delimiter: string): string[] {
  if (!getSettings(document).hasHeaderRow || document.lineCount === 0) {
    return [];
  }
  const first = document.lineAt(0).text;
  return scanLine(first, delimiter).fields.map((f) => first.slice(f.start, f.end).replace(/^"|"$/g, ""));
}

/** Colour every column differently in plain-text mode. */
export class RainbowTokensProvider implements vscode.DocumentSemanticTokensProvider {
  static readonly legend = new vscode.SemanticTokensLegend(RAINBOW_TOKEN_TYPES, []);

  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens | undefined {
    const settings = getSettings(document);
    if (!settings.rainbowColumns) {
      return undefined;
    }
    const delimiter = documentDelimiter(document);
    const builder = new vscode.SemanticTokensBuilder(RainbowTokensProvider.legend);
    const limit = Math.min(document.lineCount, settings.rainbowMaxLines);
    let col = 0;
    let inQuote = false;
    for (let line = 0; line < limit; line += 1) {
      const text = document.lineAt(line).text;
      const scan = scanLine(text, delimiter, col, inQuote);
      for (const field of scan.fields) {
        if (field.end > field.start) {
          builder.push(line, field.start, field.end - field.start, field.col % RAINBOW_TOKEN_TYPES.length, 0);
        }
      }
      if (scan.openQuote) {
        col = scan.fields[scan.fields.length - 1].col;
        inQuote = true;
      } else {
        col = 0;
        inQuote = false;
      }
    }
    return builder.build();
  }
}

/** Show the column name and row/column position when hovering a cell in text mode. */
export class CsvHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const delimiter = documentDelimiter(document);
    const scan = scanDocumentLine(document, position.line, delimiter);
    const col = columnAtOffset(scan, position.character);
    if (col === undefined) {
      return undefined;
    }
    const headers = documentHeaders(document, delimiter);
    const field = scan.fields.find((f) => f.col === col);
    const value = field ? document.lineAt(position.line).text.slice(field.start, field.end) : "";
    const name = headers[col] && headers[col].trim().length > 0 ? headers[col] : `Column ${col + 1}`;
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${name.replace(/\*/g, "\\*")}**  \n`);
    md.appendMarkdown(`Row ${position.line + 1}, column ${col + 1}  \n`);
    if (value.length > 0) {
      md.appendCodeblock(value.length > 200 ? `${value.slice(0, 200)}…` : value, "text");
    }
    return new vscode.Hover(md, field ? new vscode.Range(position.line, field.start, position.line, field.end) : undefined);
  }
}

/**
 * Rainbow CSV-style consistency check: flag lines whose field count differs
 * from the header row. Quoted multi-line fields are respected.
 */
export function registerFieldCountLinter(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("csvEditor");
  context.subscriptions.push(diagnostics);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const lint = (document: vscode.TextDocument): void => {
    if (document.languageId !== "csv" && document.languageId !== "tsv") {
      return;
    }
    const settings = getSettings(document);
    if (!settings.lintFieldCount) {
      diagnostics.delete(document.uri);
      return;
    }
    const delimiter = documentDelimiter(document);
    const limit = Math.min(document.lineCount, settings.rainbowMaxLines);
    const items: vscode.Diagnostic[] = [];
    let expected: number | undefined;
    let col = 0;
    let inQuote = false;
    let recordStart = 0;
    for (let line = 0; line < limit; line += 1) {
      const text = document.lineAt(line).text;
      if (!inQuote) {
        recordStart = line;
      }
      const scan = scanLine(text, delimiter, col, inQuote);
      if (scan.openQuote) {
        col = scan.fields[scan.fields.length - 1].col;
        inQuote = true;
        continue;
      }
      col = 0;
      inQuote = false;
      if (text.trim().length === 0) {
        continue;
      }
      const count = scan.fields[scan.fields.length - 1].col + 1;
      if (expected === undefined) {
        expected = count;
        continue;
      }
      if (count !== expected) {
        const range = new vscode.Range(recordStart, 0, line, text.length);
        const d = new vscode.Diagnostic(range, `Row has ${count} field${count === 1 ? "" : "s"}; the header has ${expected}.`, vscode.DiagnosticSeverity.Warning);
        d.source = "csvEditor";
        items.push(d);
        if (items.length >= 500) {
          break;
        }
      }
    }
    diagnostics.set(document.uri, items);
  };

  const schedule = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        lint(document);
      }, 300)
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(schedule),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("csvEditor")) {
        vscode.workspace.textDocuments.forEach(schedule);
      }
    })
  );
  vscode.workspace.textDocuments.forEach(schedule);
}
