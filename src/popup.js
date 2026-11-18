import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { textOf } from "./rich-text.js";

const $ = (id) => document.getElementById(id);
let tabId;
let job;

function wordCount(text) {
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function currentRuns() {
  return job?.runs && textOf(job.runs) === job.text ? job.runs : [{ text: job?.text || "", bold: false }];
}

function renderPreview() {
  const preview = $("preview");
  if (!job?.text) {
    preview.textContent = "Chữ nhận dạng sẽ hiện ở đây.";
    return;
  }
  const tail = [];
  let remaining = 460;
  for (const run of [...currentRuns()].reverse()) {
    if (remaining <= 0) break;
    const text = run.text.slice(-remaining);
    tail.unshift({ text, bold: run.bold });
    remaining -= text.length;
  }
  preview.replaceChildren();
  if (job.text.length > 460) preview.append(document.createTextNode("…"));
  for (const run of tail) {
    const element = document.createElement(run.bold ? "strong" : "span");
    element.textContent = run.text;
    preview.append(element);
  }
}

function wordParagraphs(runs) {
  const paragraphs = [];
  let children = [];
  let newlines = 0;
  const emit = () => {
    if (children.length) paragraphs.push(new Paragraph({ spacing: { after: 180, line: 360 }, children }));
    children = [];
  };
  for (const run of runs) {
    for (const chunk of run.text.match(/[^\n]+|\n+/g) || []) {
      if (chunk.startsWith("\n")) {
        newlines += chunk.length;
        continue;
      }
      if (newlines >= 2) emit();
      children.push(new TextRun({ text: chunk, ...(run.bold ? { bold: true } : {}), break: newlines === 1 ? 1 : 0, size: 24 }));
      newlines = 0;
    }
  }
  emit();
  return paragraphs;
}

function render() {
  const hasRegion = Boolean(job?.region);
  const busy = ["capturing", "recognizing"].includes(job?.status);
  const running = Boolean(job?.running);
  const labels = {
    capturing: "Đang chụp vùng chữ…",
    recognizing: "Đang nhận dạng chữ…",
    ready: "Đang theo dõi khi cuộn",
    paused: "Đã tạm dừng",
    error: "Cần kiểm tra",
  };
  $("status").textContent = labels[job?.status] || "Chưa chọn vùng";
  $("detail").textContent = job?.error || (busy ? "Hãy chờ OCR hoàn tất trước khi cuộn tiếp." : hasRegion ? "Cuộn hoặc chuyển trang để thêm chữ mới." : "Chọn vùng chữ để bắt đầu.");
  $("status-dot").className = `dot${job?.status === "error" ? " error" : busy ? " busy" : running ? " running" : ""}`;
  $("scans").textContent = job?.scans ?? 0;
  $("words").textContent = wordCount(job?.text || "");
  $("select").textContent = hasRegion ? "Chọn lại vùng chữ" : "Chọn vùng chữ";
  $("toggle").textContent = running ? "Tạm dừng" : "Tiếp tục";
  $("toggle").disabled = !hasRegion;
  $("scan").disabled = !hasRegion;
  $("clear").disabled = !job?.text;
  $("export").disabled = !job?.text;
  renderPreview();
}

async function message(type, extra = {}) {
  const result = await chrome.runtime.sendMessage({ type, tabId, ...extra });
  if (!result?.ok) throw new Error(result?.error || "Thao tác không thành công.");
  return result;
}

async function refresh() {
  if (tabId == null) return;
  job = (await message("GET_STATE")).job;
  render();
}

async function act(callback) {
  try {
    $("message").textContent = "";
    await callback();
    await refresh();
  } catch (error) {
    $("message").textContent = error.message || String(error);
  }
}

function fileName(title) {
  const safe = (title || "van-ban-ocr").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${safe || "van-ban-ocr"}.docx`;
}

async function exportWord() {
  const text = job?.text?.trim();
  if (!text) return;
  $("export").disabled = true;
  $("export").textContent = "Đang tạo file Word…";
  try {
    const paragraphs = wordParagraphs(currentRuns());
    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
        children: [new Paragraph({ text: job.title || "Văn bản OCR", heading: HeadingLevel.HEADING_1, spacing: { after: 280 } }), ...paragraphs],
      }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(job.title);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    $("message").textContent = "Đã tạo file Word.";
  } catch (error) {
    $("message").textContent = error.message || String(error);
  } finally {
    $("export").textContent = "Xuất file Word (.docx) ↗";
    $("export").disabled = false;
  }
}

$("select").addEventListener("click", () => act(async () => {
  await message("SELECT_REGION");
  window.close();
}));
$("toggle").addEventListener("click", () => act(() => message("SET_RUNNING", { running: !job.running })));
$("scan").addEventListener("click", () => act(() => message("CAPTURE_NOW")));
$("clear").addEventListener("click", () => {
  if (confirm("Xóa toàn bộ chữ đã quét trong phiên này?")) act(() => message("CLEAR_TEXT"));
});
$("export").addEventListener("click", exportWord);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[`ocr-tab-${tabId}`]) {
    job = changes[`ocr-tab-${tabId}`].newValue;
    render();
  }
});

void (async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Không tìm thấy thẻ web đang mở.");
    tabId = tab.id;
    await refresh();
  } catch (error) {
    $("message").textContent = error.message || String(error);
    $("select").disabled = true;
  }
})();
