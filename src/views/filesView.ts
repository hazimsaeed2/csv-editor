import * as vscode from "vscode";

const FILE_GLOB = "**/*.{csv,tsv,tab,psv,CSV,TSV,TAB,PSV}";
const MAX_FILES = 500;

interface FileNode {
  uri: vscode.Uri;
  relativePath: string;
}

/**
 * Every delimited file in the workspace, so a data-heavy project is
 * navigable without hunting through the file explorer.
 */
export class FilesViewProvider implements vscode.TreeDataProvider<FileNode> {
  private readonly emitter = new vscode.EventEmitter<FileNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private truncated = false;

  refresh(): void {
    this.emitter.fire(undefined);
  }

  get wasTruncated(): boolean {
    return this.truncated;
  }

  async getChildren(node?: FileNode): Promise<FileNode[]> {
    if (node) {
      return [];
    }
    if (!vscode.workspace.workspaceFolders?.length) {
      return [];
    }
    const found = await vscode.workspace.findFiles(FILE_GLOB, "**/{node_modules,.git,out,dist}/**", MAX_FILES + 1);
    this.truncated = found.length > MAX_FILES;
    return found
      .slice(0, MAX_FILES)
      .map((uri) => ({ uri, relativePath: vscode.workspace.asRelativePath(uri, false) }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));
  }

  getTreeItem(node: FileNode): vscode.TreeItem {
    const name = node.relativePath.split("/").pop() ?? node.relativePath;
    const directory = node.relativePath.slice(0, node.relativePath.length - name.length).replace(/\/$/, "");
    const item = new vscode.TreeItem(name);
    item.description = directory;
    item.resourceUri = node.uri;
    item.tooltip = node.relativePath;
    item.contextValue = "csvFile";
    item.command = { command: "csvEditor.openGrid", title: "Open in Grid Editor", arguments: [node.uri] };
    return item;
  }
}
