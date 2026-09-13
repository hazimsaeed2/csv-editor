import * as vscode from "vscode";
import { DELIMITER_CHOICES, describeDelimiter, getDocumentOverrides, isCsvLikeUri, setDocumentOverrides } from "../settings";
import {
  describeValue,
  isOverridden,
  readValue,
  SETTINGS,
  SETTING_GROUPS,
  writeValue,
  type SettingDef,
  type SettingScope
} from "./settingsModel";

const SCOPE_KEY = "csvEditor.settingsScope";

type Node =
  | { kind: "group"; label: string }
  | { kind: "setting"; def: SettingDef }
  | { kind: "fileGroup" }
  | { kind: "fileOverride"; which: "header" | "delimiter"; uri: vscode.Uri }
  | { kind: "message"; label: string; detail?: string };

/**
 * The Settings view in the CSV sidebar: every setting the extension
 * contributes, grouped, with its current value, editable in place. Also
 * surfaces the per-file header and delimiter overrides for the active CSV,
 * which are otherwise invisible once set from the grid toolbar.
 */
export class SettingsViewProvider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get scope(): SettingScope {
    const stored = this.context.globalState.get<SettingScope>(SCOPE_KEY);
    if (stored) {
      return stored;
    }
    // Default to workspace when there is one, so a change stays with the project.
    return vscode.workspace.workspaceFolders?.length ? "workspace" : "user";
  }

  async setScope(scope: SettingScope): Promise<void> {
    await this.context.globalState.update(SCOPE_KEY, scope);
    this.refresh();
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  /** The CSV the file-override group applies to, if any. */
  private activeCsv(): vscode.Uri | undefined {
    const tabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (tabInput && typeof tabInput === "object" && "uri" in tabInput) {
      const uri = (tabInput as { uri: vscode.Uri }).uri;
      if (uri && isCsvLikeUri(uri)) {
        return uri;
      }
    }
    const document = vscode.window.activeTextEditor?.document;
    if (document && (isCsvLikeUri(document.uri) || document.languageId === "csv" || document.languageId === "tsv")) {
      return document.uri;
    }
    return undefined;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      const groups: Node[] = SETTING_GROUPS.map((label) => ({ kind: "group", label }));
      if (this.activeCsv()) {
        groups.unshift({ kind: "fileGroup" });
      }
      return groups;
    }
    if (node.kind === "group") {
      return SETTINGS.filter((def) => def.group === node.label).map((def) => ({ kind: "setting", def }));
    }
    if (node.kind === "fileGroup") {
      const uri = this.activeCsv();
      if (!uri) {
        return [];
      }
      return [
        { kind: "fileOverride", which: "header", uri },
        { kind: "fileOverride", which: "delimiter", uri }
      ];
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "group": {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.contextValue = "csvSettingGroup";
        return item;
      }
      case "fileGroup": {
        const uri = this.activeCsv();
        const item = new vscode.TreeItem("This file", vscode.TreeItemCollapsibleState.Expanded);
        item.description = uri ? vscode.workspace.asRelativePath(uri, false) : undefined;
        item.tooltip = "Overrides that apply only to the active file. They take precedence over the settings below.";
        item.iconPath = new vscode.ThemeIcon("file");
        item.contextValue = "csvFileOverrideGroup";
        return item;
      }
      case "fileOverride":
        return this.fileOverrideItem(node);
      case "setting":
        return this.settingItem(node.def);
      case "message": {
        const item = new vscode.TreeItem(node.label);
        item.description = node.detail;
        return item;
      }
    }
  }

  private settingItem(def: SettingDef): vscode.TreeItem {
    const value = readValue(def);
    const item = new vscode.TreeItem(def.label);
    item.description = describeValue(def, value);
    item.contextValue = isOverridden(def, this.scope) ? "csvSettingOverridden" : "csvSetting";

    const overridden = isOverridden(def, this.scope);
    item.tooltip = new vscode.MarkdownString(
      `${def.detail}\n\n\`${def.key}\`\n\nCurrent: **${describeValue(def, value)}**\n\n` +
        (overridden ? `Set in ${this.scope} settings.` : `Inherited; not set in ${this.scope} settings.`)
    );

    if (def.type === "boolean") {
      item.iconPath = new vscode.ThemeIcon(value ? "check" : "close");
    } else if (def.type === "enum") {
      item.iconPath = new vscode.ThemeIcon("list-selection");
    } else if (def.type === "number") {
      item.iconPath = new vscode.ThemeIcon("symbol-number");
    } else {
      item.iconPath = new vscode.ThemeIcon("symbol-string");
    }

    item.command = { command: "csvEditor.settings.edit", title: "Edit", arguments: [def.key] };
    return item;
  }

  private fileOverrideItem(node: Extract<Node, { kind: "fileOverride" }>): vscode.TreeItem {
    const overrides = getDocumentOverrides(this.context.workspaceState, node.uri);
    const isHeader = node.which === "header";
    const value = isHeader ? overrides.hasHeader : overrides.delimiter;
    const item = new vscode.TreeItem(isHeader ? "Header row" : "Delimiter");

    if (value === undefined) {
      item.description = "follows settings";
      item.iconPath = new vscode.ThemeIcon("dash");
      item.contextValue = "csvFileOverride";
    } else {
      item.description = isHeader ? (value ? "on" : "off") : describeDelimiter(String(value));
      item.iconPath = new vscode.ThemeIcon("pinned");
      item.contextValue = "csvFileOverrideSet";
    }
    item.tooltip = `Applies only to ${vscode.workspace.asRelativePath(node.uri, false)}.`;
    item.command = {
      command: "csvEditor.settings.editFileOverride",
      title: "Edit",
      arguments: [node.which, node.uri]
    };
    return item;
  }

  // --- Editing ---------------------------------------------------------------

  /** Edit one setting, choosing the prompt from its declared type. */
  async edit(key: string): Promise<void> {
    const def = SETTINGS.find((s) => s.key === key);
    if (!def) {
      return;
    }
    const current = readValue(def);
    const scope = this.scope;

    switch (def.type) {
      case "boolean":
        await writeValue(def, !current, scope);
        break;
      case "enum": {
        const picked = await vscode.window.showQuickPick(
          (def.choices ?? []).map((c) => ({
            label: c.label,
            description: c.value === current ? "current" : undefined,
            value: c.value
          })),
          { placeHolder: def.label, title: def.detail }
        );
        if (!picked) {
          return;
        }
        await writeValue(def, picked.value, scope);
        break;
      }
      case "number": {
        const answer = await vscode.window.showInputBox({
          prompt: def.detail,
          title: def.label,
          value: String(current ?? ""),
          validateInput: (raw) => {
            const n = Number(raw);
            if (raw.trim() === "" || !Number.isFinite(n)) {
              return "Enter a number.";
            }
            if (def.min !== undefined && n < def.min) {
              return `Must be at least ${def.min}.`;
            }
            if (def.max !== undefined && n > def.max) {
              return `Must be at most ${def.max}.`;
            }
            return undefined;
          }
        });
        if (answer === undefined) {
          return;
        }
        await writeValue(def, Number(answer), scope);
        break;
      }
      case "string": {
        const answer = await vscode.window.showInputBox({ prompt: def.detail, title: def.label, value: String(current ?? "") });
        if (answer === undefined) {
          return;
        }
        await writeValue(def, answer, scope);
        break;
      }
    }
    this.refresh();
  }

  /** Clear one setting in the current scope so it falls back to the default. */
  async reset(key: string): Promise<void> {
    const def = SETTINGS.find((s) => s.key === key);
    if (!def) {
      return;
    }
    await writeValue(def, undefined, this.scope);
    this.refresh();
  }

  async resetAll(): Promise<void> {
    const scope = this.scope;
    const set = SETTINGS.filter((def) => isOverridden(def, scope));
    if (set.length === 0) {
      vscode.window.showInformationMessage(`No CSV settings are set in ${scope} settings.`);
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Reset ${set.length} CSV setting${set.length === 1 ? "" : "s"} in ${scope} settings to their defaults?`,
      { modal: true },
      "Reset"
    );
    if (confirmed !== "Reset") {
      return;
    }
    for (const def of set) {
      await writeValue(def, undefined, scope);
    }
    this.refresh();
  }

  /** Edit a per-file override, or clear it. */
  async editFileOverride(which: "header" | "delimiter", uri: vscode.Uri): Promise<void> {
    const state = this.context.workspaceState;
    if (which === "header") {
      const picked = await vscode.window.showQuickPick(
        [
          { label: "On", description: "first row is column names", value: true as boolean | undefined },
          { label: "Off", description: "first row is data", value: false as boolean | undefined },
          { label: "Follow settings", description: "remove the override", value: undefined }
        ],
        { placeHolder: "Header row for this file" }
      );
      if (!picked) {
        return;
      }
      await setDocumentOverrides(state, uri, { hasHeader: picked.value });
    } else {
      const picked = await vscode.window.showQuickPick(
        [
          ...DELIMITER_CHOICES.filter((c) => c.value !== "auto").map((c) => ({ label: c.label, value: c.value as string | undefined })),
          { label: "Follow settings", value: undefined }
        ],
        { placeHolder: "Delimiter for this file" }
      );
      if (!picked) {
        return;
      }
      await setDocumentOverrides(state, uri, { delimiter: picked.value });
    }
    // The grid re-reads overrides when the document changes; nudge open editors.
    await vscode.commands.executeCommand("csvEditor.reloadDocument", uri);
    this.refresh();
  }

  async clearFileOverrides(uri: vscode.Uri): Promise<void> {
    await setDocumentOverrides(this.context.workspaceState, uri, { hasHeader: undefined, delimiter: undefined });
    await vscode.commands.executeCommand("csvEditor.reloadDocument", uri);
    this.refresh();
  }
}
