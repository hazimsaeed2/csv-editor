import * as vscode from "vscode";
import { columnCount } from "./core/types";
import type { CsvEditorProvider } from "./csvEditorProvider";
import { describeDelimiter, isCsvLikeUri } from "./settings";
import { columnAtOffset } from "./core/textScan";
import { documentDelimiter, documentHeaders, scanDocumentLine } from "./textMode";

/** Status bar item summarizing the active CSV (grid or text mode). */
export function registerStatusBar(context: vscode.ExtensionContext, provider: CsvEditorProvider): void {
  const item = vscode.window.createStatusBarItem("csvPlus.status", vscode.StatusBarAlignment.Right, 100);
  item.name = "CSV";
  context.subscriptions.push(item);

  const update = (): void => {
    const session = provider.active;
    if (session) {
      const table = session.model.getTable();
      const rows = table.rows.length.toLocaleString();
      const cols = columnCount(table).toLocaleString();
      item.text = `$(table) ${rows} × ${cols} · ${describeDelimiter(table.delimiter)}`;
      item.tooltip = `${session.document.fileName}\n${rows} rows, ${cols} columns, ${describeDelimiter(table.delimiter)}-separated. Click for CSV actions.`;
      item.command = "csvPlus.showActions";
      item.show();
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (editor && (isCsvLikeUri(editor.document.uri) || editor.document.languageId === "csv" || editor.document.languageId === "tsv")) {
      const document = editor.document;
      const delimiter = documentDelimiter(document);
      const position = editor.selection.active;
      const scan = scanDocumentLine(document, position.line, delimiter);
      const col = columnAtOffset(scan, position.character);
      const headers = documentHeaders(document, delimiter);
      const name = col !== undefined ? (headers[col]?.trim() || `Column ${col + 1}`) : "";
      item.text = `$(table) ${name ? `${name} (${(col ?? 0) + 1})` : "CSV"} · ${describeDelimiter(delimiter)}`;
      item.tooltip = "Click to open in the CSV grid editor";
      item.command = "csvPlus.openGrid";
      item.show();
      return;
    }

    item.hide();
  };

  context.subscriptions.push(
    provider.onDidChangeActiveSession(update),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === vscode.window.activeTextEditor) {
        update();
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (provider.active?.document === e.document || vscode.window.activeTextEditor?.document === e.document) {
        update();
      }
    })
  );
  update();
}
