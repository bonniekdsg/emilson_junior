// Roda tests/browser.html num Chrome headless de verdade (tempo real, com
// quadros sendo pintados) e imprime o resultado. Sai com código 1 se algo falhar.
//
// Por que não `chrome --dump-dom`: ele salva a página assim que ela carrega e
// não espera o teste; com --virtual-time-budget os timers correm, mas sem
// quadros as transições CSS e o IntersectionObserver nunca avançam.
//
// Uso: node tools/qa-browser.js [url]   (com o site servido em 127.0.0.1:4321)

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TARGET = process.argv[2] ?? "http://127.0.0.1:4321/tests/browser.html";
const PORT = 9333;
const DEADLINE_MS = 90_000;

const profile = await mkdtemp(join(tmpdir(), "ej-qa-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=500,900",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let exitCode = 1;
try {
  const ws = new WebSocket(await pageSocketUrl());
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let seq = 0;
  const waiting = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.navigate", { url: TARGET });

  const until = Date.now() + DEADLINE_MS;
  let report = null;
  while (!report && Date.now() < until) {
    await sleep(500);
    const res = await send("Runtime.evaluate", {
      expression: `(() => { const o = document.getElementById("out"); return o?.dataset.done ? o.textContent : null; })()`,
      returnByValue: true,
    });
    report = res.result?.result?.value ?? null;
  }

  if (!report) {
    console.error(`QA não terminou em ${DEADLINE_MS / 1000}s`);
  } else {
    console.log(report);
    const fails = report.split("\n").filter((line) => line.startsWith("FAIL")).length;
    const total = report.split("\n").length;
    console.log(`\n${total - fails}/${total} passaram`);
    exitCode = fails ? 1 : 0;
  }
  ws.close();
} finally {
  const exited = once(chrome, "exit");
  chrome.kill();
  await exited;
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
process.exit(exitCode);

async function pageSocketUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome ainda subindo.
    }
    await sleep(100);
  }
  throw new Error("Chrome não abriu a porta de depuração");
}
