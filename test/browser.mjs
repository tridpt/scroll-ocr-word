import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import JSZip from "jszip";

const temp = await mkdtemp(join(tmpdir(), "scroll-ocr-test-"));
const extension = join(temp, "extension");
let context;
let server;

const paragraph = (n) => `<p>Đoạn số ${n}. Mỗi trang thử nghiệm có nội dung riêng để kiểm tra việc nhận dạng và nối chữ khi cuộn. Người đọc có thể lưu những ghi chú cần thiết vào tài liệu Word của mình.</p>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#101113;color:white;font:28px/1.55 Georgia}
.reader{width:800px;height:650px;margin:60px auto;overflow:auto}
p{margin:0 0 28px}
</style><div class="reader"><p><strong>Tiêu đề in đậm để kiểm tra Word.</strong></p><p>Đây là dòng chữ thường. Trong đoạn này có <strong>một cụm chữ đậm</strong> giữa các từ bình thường.</p>${Array.from({ length: 12 }, (_, i) => paragraph(i + 1)).join("")}</div>`;

async function waitForJob(worker, tabId, predicate, timeout = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const job = await worker.evaluate(async (id) => (await chrome.storage.local.get(`ocr-tab-${id}`))[`ocr-tab-${id}`], tabId);
    if (predicate(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for OCR state");
}

async function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (process.platform !== "win32") return undefined;
  const cache = join(process.env.LOCALAPPDATA, "ms-playwright");
  const versions = (await readdir(cache).catch(() => [])).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse();
  return versions.length ? join(cache, versions[0], "chrome-win64", "chrome.exe") : undefined;
}

try {
  await cp(join(process.cwd(), "dist"), extension, { recursive: true });
  const manifestFile = join(extension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.host_permissions = ["<all_urls>"];
  await writeFile(manifestFile, JSON.stringify(manifest));

  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  context = await chromium.launchPersistentContext(join(temp, "profile"), {
    executablePath: await browserExecutable(),
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1200, height: 800 },
    acceptDownloads: true,
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const [tab] = await worker.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
  const control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/popup.html`);
  const [controlTab] = await worker.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
  await page.bringToFront();

  const select = await control.evaluate((tabId) => chrome.runtime.sendMessage({ type: "SELECT_REGION", tabId }), tab.id);
  assert.equal(select.ok, true, select.error);
  await page.mouse.move(205, 90);
  await page.mouse.down();
  await page.mouse.move(995, 680);
  await page.mouse.up();

  const first = await waitForJob(worker, tab.id, (job) => job?.scans >= 1 || job?.status === "error");
  assert.notEqual(first.status, "error", first.error);
  assert.match(first.text, /trang|thử nghiệm|ghi chú/i);
  assert.equal(first.runs.map((run) => run.text).join(""), first.text);
  assert.ok(first.runs.some((run) => run.bold && run.text.trim().length > 8), "OCR should detect bold text");
  assert.ok(first.runs.some((run) => run.bold && /cụm chữ đậm/i.test(run.text)), "OCR should detect an inline bold phrase");
  assert.ok(first.runs.some((run) => !run.bold && run.text.trim().length > 8), "OCR should keep regular text");

  const plainStyle = await page.addStyleTag({ content: "strong { font-weight: 400 !important; }" });
  const plainShot = await page.screenshot();
  const plain = await control.evaluate(({ dataUrl, region }) => chrome.runtime.sendMessage({ type: "OCR_CAPTURE", dataUrl, region }), {
    dataUrl: `data:image/png;base64,${plainShot.toString("base64")}`,
    region: first.region,
  });
  assert.equal(plain.ok, true, plain.error);
  assert.ok(plain.runs.every((run) => !run.bold), "regular text should not be marked bold");
  await plainStyle.evaluate((node) => node.remove());

  await page.locator(".reader").evaluate((node) => { node.scrollTop = 600; });
  const second = await waitForJob(worker, tab.id, (job) => job?.scans >= 2 || job?.status === "error");
  assert.notEqual(second.status, "error", second.error);
  assert.ok(second.text.length > first.text.length, "scroll should add new text");

  await page.setViewportSize({ width: 1150, height: 800 });
  const resized = await waitForJob(worker, tab.id, (job) => job?.region === null);
  assert.equal(resized.text, second.text, "resizing should keep the draft");

  const reselect = await control.evaluate((tabId) => chrome.runtime.sendMessage({ type: "SELECT_REGION", tabId }), tab.id);
  assert.equal(reselect.ok, true, reselect.error);
  await page.mouse.move(205, 90);
  await page.mouse.down();
  await page.mouse.move(970, 680);
  await page.mouse.up();
  const resumed = await waitForJob(worker, tab.id, (job) => job?.region && job.scans >= 2);
  assert.ok(resumed.text.startsWith(second.text), "reselecting should keep the draft");

  await worker.evaluate(({ id, document }) => chrome.storage.local.set({ [`ocr-tab-${id}`]: document }), { id: controlTab.id, document: resumed });
  await control.bringToFront();
  const downloadPromise = control.waitForEvent("download");
  await control.locator("#export").click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.docx$/);
  const file = await readFile(await download.path());
  assert.equal(file.toString("utf8", 0, 2), "PK");
  assert.ok((await stat(await download.path())).size > 1000);
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file("word/document.xml").async("string");
  const boldSnippet = first.runs.find((run) => run.bold && run.text.trim().length > 8).text.trim().slice(0, 8);
  const wordRuns = xml.match(/<w:r>[\s\S]*?<\/w:r>/g) || [];
  assert.ok(wordRuns.some((run) => run.includes("<w:b") && run.includes(boldSnippet)), "Word document should preserve a detected bold span");
  assert.ok(wordRuns.some((run) => !run.includes("<w:b") && run.includes("Đoạn")), "Word document should keep regular text unbolded");
  console.log(`OCR and Word export passed: ${first.text.length} -> ${second.text.length} characters`);
} finally {
  if (context) await context.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
