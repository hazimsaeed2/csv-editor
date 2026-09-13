import * as vscode from "vscode";

/**
 * Declarative description of every setting the extension contributes, used to
 * build the sidebar tree. Keeping this next to the tree rather than reading
 * the contribution schema at runtime lets each setting carry a short label and
 * a grouping that the schema has no place for.
 */
export type SettingType = "boolean" | "enum" | "number" | "string";

export interface SettingChoice {
  value: string;
  label: string;
}

export interface SettingDef {
  /** Full configuration key, e.g. `csvEditor.maxRows`. */
  key: string;
  label: string;
  type: SettingType;
  detail: string;
  group: string;
  choices?: SettingChoice[];
  /** Inclusive bounds for `number` settings. */
  min?: number;
  max?: number;
}

export const SETTING_GROUPS = ["Parsing", "Grid", "Text mode", "Pipelines"] as const;

export const SETTINGS: SettingDef[] = [
  {
    key: "csvEditor.hasHeaderRow",
    label: "Header row",
    type: "boolean",
    detail: "Treat the first row as column names.",
    group: "Parsing"
  },
  {
    key: "csvEditor.delimiter",
    label: "Delimiter",
    type: "enum",
    detail: "Field separator. Auto-detect scores each candidate against the file.",
    group: "Parsing",
    choices: [
      { value: "auto", label: "Auto-detect" },
      { value: ",", label: "Comma" },
      { value: "\t", label: "Tab" },
      { value: ";", label: "Semicolon" },
      { value: "|", label: "Pipe" }
    ]
  },
  {
    key: "csvEditor.maxRows",
    label: "Maximum rows in the grid",
    type: "number",
    detail: "Larger files still edit, query and export in full.",
    group: "Grid",
    min: 100
  },
  {
    key: "csvEditor.sqlResultLimit",
    label: "SQL result limit",
    type: "number",
    detail: "Rows returned to the SQL panel.",
    group: "Grid",
    min: 1
  },
  {
    key: "csvEditor.rainbowColumns",
    label: "Rainbow columns",
    type: "boolean",
    detail: "Colour each column when a CSV is open as text.",
    group: "Text mode"
  },
  {
    key: "csvEditor.rainbowMaxLines",
    label: "Rainbow line limit",
    type: "number",
    detail: "Only colour the first N lines, to stay responsive.",
    group: "Text mode",
    min: 0
  },
  {
    key: "csvEditor.lintFieldCount",
    label: "Report ragged rows",
    type: "boolean",
    detail: "Warn when a row's field count differs from the header.",
    group: "Text mode"
  },
  {
    key: "csvEditor.pipelines.allowScripts",
    label: "Allow code steps",
    type: "boolean",
    detail: "Expressions, scripts, SQL and commands. Never run in untrusted workspaces.",
    group: "Pipelines"
  },
  {
    key: "csvEditor.pipelines.folder",
    label: "Pipeline folder",
    type: "string",
    detail: "Where the builder saves new pipelines.",
    group: "Pipelines"
  },
  {
    key: "csvEditor.pipelines.timeoutMs",
    label: "Script timeout (ms)",
    type: "number",
    detail: "Commands are allowed six times this.",
    group: "Pipelines",
    min: 100
  },
  {
    key: "csvEditor.pipelines.previewRows",
    label: "Preview rows",
    type: "number",
    detail: "Rows shown in the pipeline preview.",
    group: "Pipelines",
    min: 10
  }
];

export type SettingScope = "user" | "workspace";

export function configurationTarget(scope: SettingScope): vscode.ConfigurationTarget {
  return scope === "user" ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
}

/** Current effective value of a setting. */
export function readValue(def: SettingDef): unknown {
  const lastDot = def.key.lastIndexOf(".");
  const section = def.key.slice(0, lastDot);
  const name = def.key.slice(lastDot + 1);
  return vscode.workspace.getConfiguration(section).get(name);
}

/** Whether the setting is explicitly set in the given scope, rather than inherited. */
export function isOverridden(def: SettingDef, scope: SettingScope): boolean {
  const lastDot = def.key.lastIndexOf(".");
  const info = vscode.workspace.getConfiguration(def.key.slice(0, lastDot)).inspect(def.key.slice(lastDot + 1));
  if (!info) {
    return false;
  }
  return scope === "user" ? info.globalValue !== undefined : info.workspaceValue !== undefined;
}

export async function writeValue(def: SettingDef, value: unknown, scope: SettingScope): Promise<void> {
  const lastDot = def.key.lastIndexOf(".");
  const section = def.key.slice(0, lastDot);
  const name = def.key.slice(lastDot + 1);
  await vscode.workspace.getConfiguration(section).update(name, value, configurationTarget(scope));
}

/** Human-readable rendering of a value, used as the tree item description. */
export function describeValue(def: SettingDef, value: unknown): string {
  if (value === undefined || value === null) {
    return "not set";
  }
  if (def.type === "boolean") {
    return value ? "on" : "off";
  }
  if (def.type === "enum") {
    return def.choices?.find((c) => c.value === value)?.label ?? String(value);
  }
  if (def.type === "number" && typeof value === "number") {
    return value.toLocaleString();
  }
  const text = String(value);
  return text.length === 0 ? "empty" : text;
}
