import * as vscode from "vscode";
import { CsvEditorProvider, GridSession, VIEW_TYPE } from "./csvEditorProvider";
import { pickFormatAndExport } from "./exportCommands";
import { CsvHoverProvider, CSV_SELECTOR, RainbowTokensProvider, registerFieldCountLinter } from "./textMode";
import { DELIMITER_CHOICES, describeDelimiter, isCsvLikeUri } from "./settings";
import { registerStatusBar } from "./statusBar";
import { CsvDocumentModel } from "./documentModel";
import type { PanelId } from "./core/messages";
import { PipelineService } from "./pipelines";
import { FilesViewProvider } from "./views/filesView";
import { PipelinesViewProvider } from "./views/pipelinesView";
import { SettingsViewProvider } from "./views/settingsView";
import type { SettingScope } from "./views/settingsModel";

export function activate(context: vscode.ExtensionContext): void {
  const pipelines = new PipelineService(context);
  const provider = CsvEditorProvider.register(context, pipelines);
  registerStatusBar(context, provider);

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      CSV_SELECTOR,
      new RainbowTokensProvider(),
      RainbowTokensProvider.legend
    ),
    vscode.languages.registerHoverProvider(CSV_SELECTOR, new CsvHoverProvider())
  );
  registerFieldCountLinter(context);
  const views = registerSidebar(context, pipelines);

  /** Resolve the CSV the user means: explicit URI, active grid, or active text editor. */
  const resolveUri = (uri?: vscode.Uri): vscode.Uri | undefined => {
    if (uri) {
      return uri;
    }
    if (provider.active) {
      return provider.active.document.uri;
    }
    const editorUri = vscode.window.activeTextEditor?.document.uri;
    if (editorUri && (isCsvLikeUri(editorUri) || vscode.window.activeTextEditor?.document.languageId === "csv")) {
      return editorUri;
    }
    return undefined;
  };

  /** Open (or reveal) the grid for a URI and return its session once ready. */
  const openGrid = async (uri?: vscode.Uri): Promise<GridSession | undefined> => {
    const target = resolveUri(uri);
    if (!target) {
      vscode.window.showErrorMessage("Open a CSV file first.");
      return undefined;
    }
    const existing = provider.sessionFor(target);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }
    await vscode.commands.executeCommand("vscode.openWith", target, VIEW_TYPE);
    return provider.sessionFor(target);
  };

  const withGridPanel = (panel: PanelId) => async (uri?: unknown) => {
    const session = await openGrid(uri instanceof vscode.Uri ? uri : undefined);
    session?.focusPanel(panel);
  };

  const register = (command: string, callback: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };

  register("csvPlus.openGrid", (uri?: unknown) => openGrid(uri instanceof vscode.Uri ? uri : undefined));

  // Internal: re-read a document after its per-file overrides changed.
  register("csvPlus.reloadDocument", (uri?: unknown) => {
    if (!(uri instanceof vscode.Uri)) {
      return;
    }
    const session = provider.sessionFor(uri);
    if (session) {
      session.model.invalidate();
      session.sendTable();
    }
  });

  register("csvPlus.openAsText", async (uri?: unknown) => {
    const target = resolveUri(uri instanceof vscode.Uri ? uri : undefined);
    if (target) {
      await vscode.commands.executeCommand("vscode.openWith", target, "default");
    }
  });

  register("csvPlus.runSql", withGridPanel("sql"));
  register("csvPlus.columnStats", withGridPanel("stats"));
  register("csvPlus.chart", withGridPanel("chart"));

  register("csvPlus.find", async (uri?: unknown) => {
    const session = await openGrid(uri instanceof vscode.Uri ? uri : undefined);
    session?.focusFind();
  });

  register("csvPlus.export", async (uri?: unknown) => {
    const target = resolveUri(uri instanceof vscode.Uri ? uri : undefined);
    if (!target) {
      vscode.window.showErrorMessage("Open a CSV file first.");
      return;
    }
    const session = provider.sessionFor(target);
    const model = session?.model ?? new CsvDocumentModel(await vscode.workspace.openTextDocument(target), context.workspaceState);
    await pickFormatAndExport(model.getTable(), target);
  });

  register("csvPlus.toggleHeaderRow", async () => {
    const session = provider.active ?? (await openGrid());
    if (!session) {
      return;
    }
    const next = !session.model.hasHeader;
    await session.model.setHasHeader(next);
    session.sendTable();
    session.post({ type: "setHeader", hasHeader: next });
  });

  register("csvPlus.setDelimiter", async () => {
    const session = provider.active ?? (await openGrid());
    if (!session) {
      return;
    }
    const pick = await vscode.window.showQuickPick(
      DELIMITER_CHOICES.map((c) => ({
        label: c.label,
        description: c.value !== "auto" && c.value === session.model.delimiter ? "current" : undefined,
        value: c.value
      })),
      { placeHolder: `Delimiter (currently ${describeDelimiter(session.model.delimiter)})` }
    );
    if (!pick) {
      return;
    }
    await session.model.setDelimiter(pick.value);
    session.sendTable();
  });

  register("csvPlus.openPipelinePanel", withGridPanel("pipeline"));
  register("csvPlus.showPipelineLog", () => pipelines.showLog());

  register("csvPlus.runPipeline", async (arg?: unknown) => {
    const argUri = arg instanceof vscode.Uri ? arg : undefined;
    let pipelinePath: string | undefined;
    let target: vscode.Uri | undefined;
    if (argUri && argUri.path.endsWith(".csvpipe.json")) {
      pipelinePath = vscode.workspace.asRelativePath(argUri, false);
      target = resolveUri();
      if (!target) {
        const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Delimited files": ["csv", "tsv", "tab", "psv"] }, title: "CSV file to process" });
        target = picked?.[0];
      }
    } else {
      target = resolveUri(argUri);
    }
    if (!target) {
      vscode.window.showErrorMessage("Open a CSV file first.");
      return;
    }
    if (!pipelinePath) {
      const items = await pipelines.list(target);
      if (items.length === 0) {
        const create = await vscode.window.showInformationMessage("No *.csvpipe.json pipelines found in the workspace.", "Create one", "Open pipeline panel");
        if (create === "Create one") {
          await vscode.commands.executeCommand("csvPlus.newPipeline");
        } else if (create) {
          await vscode.commands.executeCommand("csvPlus.openPipelinePanel", target);
        }
        return;
      }
      const pick = await vscode.window.showQuickPick(
        items.map((i) => ({ label: `${i.matches ? "$(star-full) " : ""}${i.name}`, description: i.path, detail: `trigger: ${i.trigger}`, path: i.path })),
        { placeHolder: `Run a pipeline on ${vscode.workspace.asRelativePath(target, false)}` }
      );
      if (!pick) {
        return;
      }
      pipelinePath = pick.path;
    }
    try {
      const { pipeline } = await pipelines.load(pipelinePath);
      const session = provider.sessionFor(target);
      const model = session?.model ?? new CsvDocumentModel(await vscode.workspace.openTextDocument(target), context.workspaceState);
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `CSV pipeline: ${pipeline.name}` }, () =>
        pipelines.run(pipeline, model.getTable(), target)
      );
      if (!result.ok) {
        const failed = result.steps.find((s) => s.error);
        void vscode.window.showErrorMessage(`Pipeline stopped: ${failed?.label}: ${failed?.error}`, "Show log").then((c) => c && pipelines.showLog());
        return;
      }
      const info = await pipelines.deliver(result, pipeline, target, session?.model);
      vscode.window.showInformationMessage(`Pipeline "${pipeline.name}": ${result.table.rows.length.toLocaleString()} rows. ${info}`);
    } catch (error) {
      void vscode.window.showErrorMessage(`CSV pipeline: ${error instanceof Error ? error.message : String(error)}`, "Show log").then((c) => c && pipelines.showLog());
    }
  });

  register("csvPlus.newPipeline", async () => {
    const name = await vscode.window.showInputBox({ prompt: "Pipeline name", value: "My pipeline" });
    if (!name) {
      return;
    }
    const current = resolveUri();
    try {
      const uri = await pipelines.createFromTemplate(name, current ? vscode.workspace.asRelativePath(current, false) : undefined);
      if (uri) {
        views.pipelines.refresh();
        await vscode.window.showTextDocument(uri);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`CSV pipeline: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  register("csvPlus.newPipelineScript", async () => {
    const path = await vscode.window.showInputBox({ prompt: "Script path (workspace-relative)", value: "scripts/transform.js" });
    if (!path) {
      return;
    }
    try {
      const uri = await pipelines.createScript(path);
      await vscode.window.showTextDocument(uri);
    } catch (error) {
      vscode.window.showErrorMessage(`CSV pipeline: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  register("csvPlus.showActions", async () => {
    const actions: { label: string; command: string }[] = [
      { label: "$(search) Find and replace", command: "csvPlus.find" },
      { label: "$(graph) Column statistics", command: "csvPlus.columnStats" },
      { label: "$(pie-chart) Chart a column", command: "csvPlus.chart" },
      { label: "$(database) Run SQL query", command: "csvPlus.runSql" },
      { label: "$(export) Export as…", command: "csvPlus.export" },
      { label: "$(run-all) Run pipeline…", command: "csvPlus.runPipeline" },
      { label: "$(tools) Pipeline builder", command: "csvPlus.openPipelinePanel" },
      { label: "$(list-flat) Toggle header row", command: "csvPlus.toggleHeaderRow" },
      { label: "$(symbol-operator) Set delimiter", command: "csvPlus.setDelimiter" },
      { label: "$(file-code) Open as text", command: "csvPlus.openAsText" }
    ];
    const pick = await vscode.window.showQuickPick(actions, { placeHolder: "CSV actions" });
    if (pick) {
      await vscode.commands.executeCommand(pick.command);
    }
  });
}

interface SidebarViews {
  settings: SettingsViewProvider;
  pipelines: PipelinesViewProvider;
  files: FilesViewProvider;
  refreshAll(): void;
}

/**
 * The CSV container in the activity bar: settings, pipelines and the
 * workspace's delimited files.
 */
function registerSidebar(context: vscode.ExtensionContext, pipelineService: PipelineService): SidebarViews {
  const settings = new SettingsViewProvider(context);
  const pipelines = new PipelinesViewProvider(pipelineService);
  const files = new FilesViewProvider();

  const settingsTree = vscode.window.createTreeView("csvPlus.settingsView", { treeDataProvider: settings, showCollapseAll: true });
  const pipelinesTree = vscode.window.createTreeView("csvPlus.pipelinesView", { treeDataProvider: pipelines });
  const filesTree = vscode.window.createTreeView("csvPlus.filesView", { treeDataProvider: files });
  context.subscriptions.push(settingsTree, pipelinesTree, filesTree);

  const syncScopeLabel = (): void => {
    settingsTree.description = settings.scope === "user" ? "User" : "Workspace";
  };
  syncScopeLabel();

  const refreshAll = (): void => {
    settings.refresh();
    pipelines.refresh();
    files.refresh();
  };

  // Keep the views honest as the workspace changes underneath them.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("csvPlus")) {
        settings.refresh();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      settings.refresh();
      pipelines.refresh();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.path.endsWith(".csvpipe.json")) {
        pipelines.refresh();
      }
    })
  );

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{csv,tsv,tab,psv,csvpipe.json}");
  const onFileChange = (): void => {
    files.refresh();
    pipelines.refresh();
  };
  watcher.onDidCreate(onFileChange);
  watcher.onDidDelete(onFileChange);
  context.subscriptions.push(watcher);

  const register = (command: string, callback: (...args: never[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback as (...args: unknown[]) => unknown));
  };

  register("csvPlus.views.refresh", () => refreshAll());

  register("csvPlus.settings.edit", (key: string) => settings.edit(key));
  register("csvPlus.settings.reset", (node: { def?: { key: string } }) => (node?.def ? settings.reset(node.def.key) : undefined));
  register("csvPlus.settings.resetAll", () => settings.resetAll());
  register("csvPlus.settings.openNative", () => vscode.commands.executeCommand("workbench.action.openSettings", "@ext:bash-365.csv-grid-viewer"));
  register("csvPlus.settings.selectScope", async () => {
    const picked = await vscode.window.showQuickPick(
      [
        { label: "Workspace", description: "applies to this project only", value: "workspace" as SettingScope },
        { label: "User", description: "applies everywhere", value: "user" as SettingScope }
      ],
      { placeHolder: "Which settings does the sidebar edit?" }
    );
    if (picked) {
      await settings.setScope(picked.value);
      syncScopeLabel();
    }
  });
  register("csvPlus.settings.editFileOverride", (which: "header" | "delimiter", uri: vscode.Uri) => settings.editFileOverride(which, uri));
  register("csvPlus.settings.clearFileOverride", (node: { uri?: vscode.Uri }) => (node?.uri ? settings.clearFileOverrides(node.uri) : undefined));

  register("csvPlus.pipelines.run", (node: unknown) => {
    const path = pipelines.pathOf(node as Parameters<typeof pipelines.pathOf>[0]);
    return vscode.commands.executeCommand("csvPlus.runPipeline", path ? pipelineService.resolveWorkspacePath(path) : undefined);
  });
  register("csvPlus.pipelines.edit", async (node: unknown) => {
    const path = pipelines.pathOf(node as Parameters<typeof pipelines.pathOf>[0]);
    if (path) {
      await vscode.window.showTextDocument(pipelineService.resolveWorkspacePath(path));
    }
  });

  register("csvPlus.files.openAsText", async (node: { uri?: vscode.Uri }) => {
    if (node?.uri) {
      await vscode.commands.executeCommand("vscode.openWith", node.uri, "default");
    }
  });

  return { settings, pipelines, files, refreshAll };
}

export function deactivate(): void {
  // Disposables are released through context.subscriptions.
}
