import { mergeText } from "./merge.js";
import { mergeStyledRuns } from "./rich-text.js";

const jobs = new Map();
let offscreenReady;

const keyFor = (tabId) => `ocr-tab-${tabId}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sameDocument(first, second) {
  try {
    const a = new URL(first);
    const b = new URL(second);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return first === second;
  }
}

async function getJob(tabId) {
  const key = keyFor(tabId);
  return (await chrome.storage.local.get(key))[key] ?? null;
}

async function saveJob(tabId, job) {
  await chrome.storage.local.set({ [keyFor(tabId)]: job });
}

async function ensureOffscreen() {
  if (!offscreenReady) {
    offscreenReady = (async () => {
      if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["WORKERS"],
          justification: "Run local OCR on screenshots of the selected visible region.",
        });
      }
    })().catch((error) => {
      offscreenReady = null;
      throw error;
    });
  }
  await offscreenReady;
}

async function runCapture(tabId, force) {
  let sessionId;
  try {
    const job = await getJob(tabId);
    if (!job?.region || (!job.running && !force)) return;
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) return;
    if (job.url && tab.url && !sameDocument(job.url, tab.url)) {
      await saveJob(tabId, { ...job, running: false, region: null, status: "paused", error: "Trang đã đổi. Hãy chọn lại vùng chữ." });
      return;
    }

    sessionId = job.sessionId;
    await saveJob(tabId, { ...job, status: "capturing", error: "" });
    await wait(180);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const current = await getJob(tabId);
    if (current?.sessionId !== sessionId) return;
    await saveJob(tabId, { ...current, status: "recognizing" });
    await ensureOffscreen();
    const result = await chrome.runtime.sendMessage({ type: "OCR_CAPTURE", dataUrl, region: job.region });
    if (!result?.ok) throw new Error(result?.error || "Không nhận được kết quả OCR.");

    const latest = await getJob(tabId);
    if (latest?.sessionId !== sessionId) return;
    const text = mergeText(latest.text, result.text);
    const runs = mergeStyledRuns(latest.text, latest.runs, result.text, result.runs, text);
    const grew = text.length > latest.text.length;
    await saveJob(tabId, {
      ...latest,
      text,
      runs,
      scans: latest.scans + (grew ? 1 : 0),
      status: latest.running ? "ready" : "paused",
      error: result.text.trim() ? "" : "Không thấy chữ trong vùng chọn. Hãy chọn lại vùng rõ hơn.",
      updatedAt: Date.now(),
    });
  } catch (error) {
    const latest = await getJob(tabId);
    if (sessionId && latest?.sessionId === sessionId) {
      await saveJob(tabId, { ...latest, status: "error", error: error.message || String(error) });
    }
  }
}

function requestCapture(tabId, force = false) {
  const current = jobs.get(tabId);
  if (current) {
    current.again = true;
    current.force ||= force;
    return;
  }
  const queued = { again: false, force };
  jobs.set(tabId, queued);
  void (async () => {
    try {
      do {
        const manual = queued.force;
        queued.force = false;
        queued.again = false;
        await runCapture(tabId, manual);
        if (queued.again) await wait(500);
      } while (queued.again);
    } finally {
      jobs.delete(tabId);
    }
  })().catch((error) => console.error("OCR capture failed:", error));
}

async function handleMessage(message, sender) {
  const tabId = message.tabId ?? sender.tab?.id;
  switch (message.type) {
    case "GET_STATE":
      return { ok: true, job: await getJob(tabId) };
    case "SELECT_REGION": {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tabId, { type: "BEGIN_SELECT" });
      return { ok: true };
    }
    case "REGION_SELECTED": {
      if (!sender.tab || message.region.width < 60 || message.region.height < 40) {
        return { ok: false, error: "Vùng chọn quá nhỏ." };
      }
      const previous = await getJob(tabId);
      const samePage = previous && sameDocument(previous.url, sender.tab.url);
      await saveJob(tabId, {
        sessionId: crypto.randomUUID(),
        title: sender.tab.title || "Văn bản OCR",
        url: sender.tab.url || "",
        region: message.region,
        running: true,
        status: "ready",
        error: "",
        text: samePage ? previous.text : "",
        runs: samePage ? previous.runs : [],
        scans: samePage ? previous.scans : 0,
        updatedAt: Date.now(),
      });
      requestCapture(tabId);
      return { ok: true };
    }
    case "SCROLL_SETTLED": {
      if (!sender.tab) return { ok: false };
      const job = await getJob(tabId);
      if (job?.running) requestCapture(tabId);
      return { ok: true };
    }
    case "VIEWPORT_CHANGED": {
      if (!sender.tab) return { ok: false };
      const job = await getJob(tabId);
      if (job?.region && (Math.abs(job.region.viewportWidth - message.width) > 2 || Math.abs(job.region.viewportHeight - message.height) > 2)) {
        await saveJob(tabId, { ...job, sessionId: crypto.randomUUID(), region: null, running: false, status: "paused", error: "Cửa sổ đã đổi kích thước. Hãy chọn lại vùng chữ." });
      }
      return { ok: true };
    }
    case "SET_RUNNING": {
      const job = await getJob(tabId);
      if (!job?.region) return { ok: false, error: "Hãy chọn vùng chữ trước." };
      const running = Boolean(message.running);
      await saveJob(tabId, { ...job, running, status: running ? "ready" : "paused", error: "" });
      if (running) requestCapture(tabId);
      return { ok: true };
    }
    case "CAPTURE_NOW": {
      const job = await getJob(tabId);
      if (!job?.region) return { ok: false, error: "Hãy chọn vùng chữ trước." };
      requestCapture(tabId, true);
      return { ok: true };
    }
    case "CLEAR_TEXT": {
      const job = await getJob(tabId);
      if (!job) return { ok: true };
      await saveJob(tabId, {
        ...job,
        sessionId: crypto.randomUUID(),
        text: "",
        runs: [],
        scans: 0,
        running: false,
        status: "paused",
        error: "",
        updatedAt: Date.now(),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "OCR_CAPTURE") return false;
  handleMessage(message, sender)
    .then((result) => respond(result ?? { ok: false, error: "Lệnh không hợp lệ." }))
    .catch((error) => respond({ ok: false, error: error.message || String(error) }));
  return true;
});
