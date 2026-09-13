import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const endpoint = "http://127.0.0.1:9333/json";

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function connectTarget(target) {
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  return client;
}

const targets = await fetch(endpoint).then((response) => response.json());
const mainTarget = targets.find((target) => target.type === "page" && target.title.includes("sales.csv"));
const webviewTarget = targets.find((target) => target.type === "iframe" && target.url.startsWith("vscode-webview://"));
if (!mainTarget) throw new Error("The isolated CSV Editor capture window is not available.");

const main = await connectTarget(mainTarget);
const webview = webviewTarget ? await connectTarget(webviewTarget) : undefined;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const innerEvaluate = async (body) => {
  if (!webview) throw new Error("The CSV grid webview is not open.");
  return webview.evaluate(`(() => {
    const d = document.getElementById('active-frame')?.contentDocument;
    if (!d) throw new Error('No active CSV frame');
    ${body}
  })()`);
};
const capture = async (output) => {
  await main.send("Page.enable");
  await main.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 886,
    deviceScaleFactor: 1,
    mobile: false
  });
  const screenshot = await main.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(output, Buffer.from(screenshot.data, "base64"));
};

const command = process.argv[2] ?? "inspect";
if (command === "inspect") {
  if (!webview) throw new Error("The CSV grid webview is not open.");
  const details = await webview.evaluate(`(() => {
    const document = globalThis.document.getElementById('active-frame')?.contentDocument;
    if (!document) return { error: 'No active frame' };
    return {
      title: document.title,
      text: document.body.innerText,
      buttons: [...document.querySelectorAll('button')].map((element, index) => ({index, text: element.innerText, title: element.title, aria: element.getAttribute('aria-label')})),
      headers: [...document.querySelectorAll('.tabulator-col')].slice(0, 8).map((element, index) => ({index, title: element.innerText, sort: element.getAttribute('aria-sort')})),
      panels: [...document.querySelectorAll('[class]')].filter(element => /panel|dialog|popup|menu/.test(element.className)).slice(0, 40).map(element => ({tag: element.tagName, className: element.className, text: element.innerText?.slice(0, 120)}))
    };
  })()`);
  console.log(JSON.stringify(details, null, 2));
} else if (command === "capture") {
  const output = process.argv[3];
  if (!output) throw new Error("Capture output path is required.");
  await capture(output);
  console.log(output);
} else if (command === "capture-all") {
  if (!webview) throw new Error("The CSV grid webview is not open.");
  const outputDir = process.argv[3] ?? path.resolve("media", "screenshots");
  await mkdir(outputDir, { recursive: true });

  const shot = async (name, delay = 350) => {
    await wait(delay);
    const output = path.join(outputDir, `${name}.png`);
    await capture(output);
    console.log(output);
  };

  const reset = async () => {
    await innerEvaluate(`
      d.querySelector('.filter-popup .secondary')?.click();
      d.querySelector('.dialog-overlay .secondary')?.click();
      const findClose = [...d.querySelectorAll('button')].find(e => e.title === 'Close (Escape)');
      if (findClose && !findClose.closest('.find-bar')?.hidden) findClose.click();
      const panelClose = d.querySelector('button[title="Close panel"]');
      if (panelClose && !d.querySelector('.side-panel')?.hidden) panelClose.click();
      d.querySelectorAll('.menu-list').forEach(e => e.hidden = true);
      const clearState = [...d.querySelectorAll('.status-bar .link')].find(e => e.textContent === 'Clear filters and sort');
      if (clearState && !clearState.hidden) clearState.click();
      return true;
    `);
    await wait(250);
  };

  await reset();
  await shot("grid");

  await innerEvaluate(`
    const header = [...d.querySelectorAll('.tabulator-col')].find(e => e.textContent.includes('product'));
    header.querySelector('.tabulator-col-sorter').click();
    return header.getAttribute('aria-sort');
  `);
  await shot("sorting");

  await reset();
  await innerEvaluate(`d.querySelectorAll('.csv-filter-btn')[2].click(); return true;`);
  await shot("autofilter");

  await reset();
  await innerEvaluate(`
    d.querySelectorAll('.csv-filter-btn')[2].click();
    const popup = d.querySelector('.filter-popup');
    const all = popup.querySelector('#filter-select-all');
    all.checked = false;
    all.dispatchEvent(new Event('change', { bubbles: true }));
    const widgets = [...popup.querySelectorAll('.filter-value')].find(e => e.textContent.trim().startsWith('Widgets'));
    const checkbox = widgets.querySelector('input');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    [...popup.querySelectorAll('button')].find(e => e.textContent === 'OK').click();
    return true;
  `);
  await shot("filtered", 600);

  await reset();
  await innerEvaluate(`
    [...d.querySelectorAll('button')].find(e => e.title === 'Find and replace (Ctrl+F)').click();
    const input = d.querySelector('.find-input[aria-label="Find"]');
    input.value = 'Gadget';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await shot("find-replace", 650);

  await reset();
  await innerEvaluate(`
    const cell = d.querySelector('.tabulator-row .tabulator-cell[tabulator-field="c1"]');
    const rect = cell.getBoundingClientRect();
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 80, clientY: rect.top + 10 }));
    return true;
  `);
  await shot("cell-menu");

  await reset();
  await innerEvaluate(`
    const header = [...d.querySelectorAll('.tabulator-col')].find(e => e.textContent.includes('product'));
    const rect = header.getBoundingClientRect();
    header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 80, clientY: rect.top + 12 }));
    return true;
  `);
  await shot("column-menu");

  await reset();
  await innerEvaluate(`
    [...d.querySelectorAll('.toolbar button')].find(e => e.title === 'Column statistics').click();
    const select = d.querySelector('.side-panel select[aria-label="Column"]');
    select.value = '7';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);
  await shot("statistics", 600);

  await reset();
  await innerEvaluate(`
    [...d.querySelectorAll('.toolbar button')].find(e => e.title === 'Chart a column').click();
    const select = d.querySelector('.side-panel select[aria-label="Column"]');
    select.value = '7';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);
  await shot("chart", 900);

  await reset();
  await innerEvaluate(`
    [...d.querySelectorAll('.toolbar button')].find(e => e.title === 'Query the file with SQL').click();
    const editor = d.querySelector('.sql-editor');
    editor.value = 'SELECT category, ROUND(SUM(revenue), 2) AS total_revenue\\nFROM csv\\nGROUP BY category\\nORDER BY total_revenue DESC';
    [...d.querySelectorAll('.sql-panel button')].find(e => e.textContent === 'Run').click();
    return true;
  `);
  await shot("sql", 1800);

  await reset();
  await innerEvaluate(`
    [...d.querySelectorAll('.toolbar button')].find(e => e.title === 'Build and run data-processing pipelines').click();
    const name = d.querySelector('.pipeline-panel input[aria-label="Pipeline name"]');
    name.value = 'Clean sales export';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const kind = d.querySelector('.pipeline-panel select[aria-label="Step kind"]');
    kind.value = 'trim';
    [...d.querySelectorAll('.pipeline-panel button')].find(e => e.textContent === '+ Add step').click();
    kind.value = 'filter';
    [...d.querySelectorAll('.pipeline-panel button')].find(e => e.textContent === '+ Add step').click();
    return true;
  `);
  await shot("pipeline", 600);

  await reset();
  await innerEvaluate(`
    const dataMenu = [...d.querySelectorAll('.toolbar .menu')].find(e => e.querySelector(':scope > button')?.textContent === 'Data ▾');
    dataMenu.querySelector(':scope > button').click();
    [...dataMenu.querySelectorAll('.menu-list button')].find(e => e.childNodes[0]?.textContent === 'Sort…').click();
    return true;
  `);
  await shot("sort-dialog", 500);

  await reset();
} else if (command === "reload") {
  await main.send("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("Reloaded the isolated VS Code window.");
} else if (command === "reload-window" || command === "command") {
  const commandText = command === "command" ? process.argv.slice(3).join(" ") : "Developer: Reload Window";
  await main.send("Page.bringToFront");
  await main.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Control", code: "ControlLeft", modifiers: 2 });
  await main.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Shift", code: "ShiftLeft", modifiers: 10 });
  await main.send("Input.dispatchKeyEvent", { type: "keyDown", key: "P", code: "KeyP", modifiers: 10 });
  await main.send("Input.dispatchKeyEvent", { type: "keyUp", key: "P", code: "KeyP", modifiers: 10 });
  await main.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", modifiers: 2 });
  await main.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft", modifiers: 0 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await main.send("Input.insertText", { text: commandText });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await main.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await main.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await new Promise((resolve) => setTimeout(resolve, 7000));
  console.log(`Ran VS Code command: ${commandText}`);
} else if (command === "save") {
  await main.send("Page.bringToFront");
  await main.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Control", code: "ControlLeft", modifiers: 2 });
  await main.send("Input.dispatchKeyEvent", { type: "keyDown", key: "s", code: "KeyS", modifiers: 2 });
  await main.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", modifiers: 2 });
  await main.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft", modifiers: 0 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("Saved the capture document.");
} else if (command === "eval") {
  if (!webview) throw new Error("The CSV grid webview is not open.");
  const expression = process.argv.slice(3).join(" ");
  console.log(JSON.stringify(await webview.evaluate(expression), null, 2));
} else if (command === "main-eval") {
  const expression = process.argv.slice(3).join(" ");
  console.log(JSON.stringify(await main.evaluate(expression), null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}

main.close();
webview?.close();
