import * as vscode from "vscode";
import { inferColumnTypes } from "./core/infer";
import type { HostMessage, PanelId, TablePayload, WebviewMessage } from "./core/messages";
import { applyHostTransform, rejectReplaceAllWhileTruncated } from "./core/hostTransform";
import type { CsvTable } from "./core/types";
import { CsvDocumentModel } from "./documentModel";
import { exportToNewDocument, openTableAsCsv } from "./exportCommands";
import type { PipelineService } from "./pipelines";
import { getSettings } from "./settings";
import { SqlEngine } from "./sqlEngine";
import { loadSqlJs } from "./sqlLoader";

export const VIEW_TYPE = "csvEditor.gridEditor";

/** One open grid editor: the webview panel plus its document model. */
export class GridSession {
  private sql: SqlEngine | undefined;

  constructor(
    public readonly model: CsvDocumentModel,
    public readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext
  ) {}

  get document(): vscode.TextDocument {
    return this.model.document;
  }

  post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  sendTable(): void {
    const settings = getSettings(this.document);
    const table = this.model.getTable();
    const truncated = table.rows.length > settings.maxRows;
    const payload: TablePayload = {
      headers: table.headers,
      rows: truncated ? table.rows.slice(0, settings.maxRows) : table.rows,
      delimiter: table.delimiter,
      hasHeader: table.hasHeader,
      types: inferColumnTypes(table),
      totalRows: table.rows.length,
      truncated,
      fileName: vscode.workspace.asRelativePath(this.document.uri, false),
      readOnly: false
    };
    this.post({
      type: "init",
      table: payload,
      settings: {
        maxRows: settings.maxRows,
        sqlResultLimit: settings.sqlResultLimit,
        rainbowColumns: settings.rainbowColumns
      }
    });
  }

  focusPanel(panel: PanelId): void {
    this.panel.reveal(undefined, false);
    this.post({ type: "focusPanel", panel });
  }

  focusFind(): void {
    this.panel.reveal(undefined, false);
    this.post({ type: "focusFind" });
  }

  async runSql(sql: string, requestId: number): Promise<void> {
    try {
      if (!this.sql) {
        const SQL = await loadSqlJs(this.context.extensionPath);
        this.sql = new SqlEngine(SQL);
      }
      const table = this.model.getTable();
      this.sql.load(table, `${this.document.version}:${table.hasHeader}:${table.delimiter}`);
      const result = this.sql.query(sql, getSettings(this.document).sqlResultLimit);
      this.post({ type: "sqlResult", result, requestId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.post({ type: "sqlResult", error: message, requestId });
    }
  }

  dispose(): void {
    this.sql?.dispose();
    this.sql = undefined;
  }
}

export class CsvEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly sessions = new Set<GridSession>();
  private activeSession: GridSession | undefined;
  private readonly onDidChangeActiveEmitter = new vscode.EventEmitter<GridSession | undefined>();
  readonly onDidChangeActiveSession = this.onDidChangeActiveEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly pipelines: PipelineService
  ) {}

  static register(context: vscode.ExtensionContext, pipelines: PipelineService): CsvEditorProvider {
    const provider = new CsvEditorProvider(context, pipelines);
    context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: true
      })
    );
    return provider;
  }

  get active(): GridSession | undefined {
    return this.activeSession;
  }

  /** Find the session showing a document, if any. */
  sessionFor(uri: vscode.Uri): GridSession | undefined {
    for (const session of this.sessions) {
      if (session.document.uri.toString() === uri.toString()) {
        return session;
      }
    }
    return undefined;
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const model = new CsvDocumentModel(document, this.context.workspaceState);
    const session = new GridSession(model, panel, this.context);
    this.sessions.add(session);

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "out", "webview")]
    };
    panel.webview.html = this.getHtml(panel.webview);

    const subscriptions: vscode.Disposable[] = [];

    subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== document.uri.toString()) {
          return;
        }
        if (model.consumeEcho(e.document.getText())) {
          return;
        }
        model.invalidate();
        session.sendTable();
      })
    );

    subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("csvEditor", document)) {
          model.invalidate();
          session.sendTable();
        }
      })
    );

    subscriptions.push(
      panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void this.handleMessage(session, message);
      })
    );

    subscriptions.push(
      panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.active) {
          this.setActive(session);
        } else if (this.activeSession === session) {
          this.setActive(undefined);
        }
      })
    );

    panel.onDidDispose(() => {
      subscriptions.forEach((d) => d.dispose());
      session.dispose();
      this.sessions.delete(session);
      if (this.activeSession === session) {
        this.setActive(undefined);
      }
    });

    if (panel.active) {
      this.setActive(session);
    }

    // Pre-processing: pipelines with trigger "onOpen" whose applyTo matches.
    void this.pipelines.runTriggered("onOpen", document, model);
  }

  private setActive(session: GridSession | undefined): void {
    if (this.activeSession !== session) {
      this.activeSession = session;
      this.onDidChangeActiveEmitter.fire(session);
    }
  }

  private async handleMessage(session: GridSession, message: WebviewMessage): Promise<void> {
    const { model } = session;
    switch (message.type) {
      case "ready":
        session.sendTable();
        break;
      case "edit": {
        const settings = getSettings(session.document);
        const rejection = rejectReplaceAllWhileTruncated(message.ops, model.getTable().rows.length, settings.maxRows);
        if (rejection) {
          vscode.window.showErrorMessage(rejection);
          session.sendTable();
          break;
        }
        const ok = await model.applyEdits(message.ops);
        if (!ok) {
          vscode.window.showErrorMessage("CSV: the document could not be modified (is it read-only?).");
          session.sendTable();
        }
        break;
      }
      case "hostTransform": {
        try {
          const next = applyHostTransform(model.getTable(), message.transform);
          const ok = await model.writeTable(next);
          if (!ok) {
            vscode.window.showErrorMessage("CSV: the document could not be modified (is it read-only?).");
          }
          session.sendTable();
        } catch (error) {
          vscode.window.showErrorMessage(`CSV: ${error instanceof Error ? error.message : String(error)}`);
          session.sendTable();
        }
        break;
      }
      case "setHeader":
        await model.setHasHeader(message.hasHeader);
        session.sendTable();
        this.onDidChangeActiveEmitter.fire(this.activeSession);
        break;
      case "setDelimiter":
        await model.setDelimiter(message.delimiter);
        session.sendTable();
        this.onDidChangeActiveEmitter.fire(this.activeSession);
        break;
      case "sql":
        await session.runSql(message.sql, message.requestId);
        break;
      case "export": {
        const base = model.getTable();
        const table: CsvTable = message.table
          ? { ...base, headers: message.table.headers, rows: message.table.rows, hasHeader: true }
          : base;
        await exportToNewDocument(table, message.format, session.document.uri);
        break;
      }
      case "copy":
        await vscode.env.clipboard.writeText(message.text);
        break;
      case "openAsText":
        await vscode.commands.executeCommand("vscode.openWith", session.document.uri, "default");
        break;
      case "command":
        if (message.command === "undo" || message.command === "redo") {
          session.panel.reveal(undefined, false);
          await vscode.commands.executeCommand(message.command);
        }
        break;
      case "openSqlResultAsCsv":
        await openTableAsCsv(message.columns, message.rows);
        break;
      case "pipelineListRequest":
        await this.sendPipelineList(session);
        break;
      case "pipelineLoad": {
        try {
          const { pipeline } = await this.pipelines.load(message.path);
          session.post({ type: "pipelineLoaded", pipeline, path: message.path });
        } catch (error) {
          vscode.window.showErrorMessage(`CSV pipeline: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      }
      case "pipelineSave": {
        try {
          const uri = await this.pipelines.save(message.pipeline, message.path);
          if (uri) {
            session.post({ type: "pipelineLoaded", pipeline: message.pipeline, path: vscode.workspace.asRelativePath(uri, false) });
            await this.sendPipelineList(session);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`CSV pipeline: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      }
      case "pipelineOpenFile": {
        if (message.path) {
          await vscode.window.showTextDocument(this.pipelines.resolveWorkspacePath(message.path), { viewColumn: vscode.ViewColumn.Beside });
        } else {
          vscode.window.showInformationMessage("Save the pipeline first to open its JSON file.");
        }
        break;
      }
      case "pipelineRun": {
        try {
          const result = await this.pipelines.run(message.pipeline, model.getTable(), session.document.uri);
          let applied = false;
          if (result.ok && message.mode === "apply") {
            await this.pipelines.deliver(result, message.pipeline, session.document.uri, model, { target: "replace" });
            applied = true;
          } else if (result.ok && message.mode === "output") {
            const info = await this.pipelines.deliver(result, message.pipeline, session.document.uri, model);
            vscode.window.setStatusBarMessage(`CSV pipeline: ${info}`, 5000);
          } else if (result.ok && message.mode === "export") {
            await this.pipelines.deliver(result, message.pipeline, session.document.uri, model, { target: "newDocument", format: message.format });
          }
          session.post({ type: "pipelineResult", requestId: message.requestId, result: this.pipelines.summarize(result), applied });
        } catch (error) {
          session.post({ type: "pipelineResult", requestId: message.requestId, error: error instanceof Error ? error.message : String(error) });
        }
        break;
      }
      case "info":
        vscode.window.showInformationMessage(message.message);
        break;
      case "error":
        vscode.window.showErrorMessage(message.message);
        break;
    }
  }

  private async sendPipelineList(session: GridSession): Promise<void> {
    try {
      const items = await this.pipelines.list(session.document.uri);
      session.post({ type: "pipelineList", items, scriptsAllowed: this.pipelines.scriptsAllowed() });
    } catch (error) {
      session.post({ type: "pipelineList", items: [], scriptsAllowed: this.pipelines.scriptsAllowed() });
      this.pipelines.log(`Could not list pipelines: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(this.context.extensionUri, "out", "webview");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(base, "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(base, "main.css"));
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>CSV Grid</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
