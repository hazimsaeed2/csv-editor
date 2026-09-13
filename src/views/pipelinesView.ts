import * as vscode from "vscode";
import type { PipelineListItem } from "../core/messages";
import type { PipelineService } from "../pipelines";

interface PipelineNode {
  item: PipelineListItem;
}

/**
 * Lists every `*.csvpipe.json` in the workspace, with the ones that apply to
 * the active file first. Without this the only way to reach a pipeline is the
 * command palette or the grid's side panel.
 */
export class PipelinesViewProvider implements vscode.TreeDataProvider<PipelineNode> {
  private readonly emitter = new vscode.EventEmitter<PipelineNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private cached: PipelineListItem[] = [];

  constructor(private readonly pipelines: PipelineService) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  async getChildren(node?: PipelineNode): Promise<PipelineNode[]> {
    if (node) {
      return [];
    }
    const active = vscode.window.activeTextEditor?.document.uri;
    try {
      this.cached = await this.pipelines.list(active);
    } catch {
      this.cached = [];
    }
    return this.cached.map((item) => ({ item }));
  }

  getTreeItem(node: PipelineNode): vscode.TreeItem {
    const { item } = node;
    const treeItem = new vscode.TreeItem(item.name);
    const trigger = item.trigger === "onOpen" ? "on open" : item.trigger === "onSave" ? "on save" : "manual";
    treeItem.description = item.matches ? `${trigger} · matches this file` : trigger;
    treeItem.tooltip = new vscode.MarkdownString(`\`${item.path}\`\n\nTrigger: ${trigger}`);
    treeItem.resourceUri = safeUri(item.path);
    treeItem.iconPath = new vscode.ThemeIcon(
      item.trigger === "manual" ? "play-circle" : "sync",
      item.matches ? new vscode.ThemeColor("charts.green") : undefined
    );
    treeItem.contextValue = "csvPipeline";
    treeItem.command = { command: "csvEditor.pipelines.run", title: "Run", arguments: [node] };
    return treeItem;
  }

  pathOf(node: PipelineNode | undefined): string | undefined {
    return node?.item.path;
  }
}

function safeUri(relativePath: string): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, relativePath) : undefined;
}
