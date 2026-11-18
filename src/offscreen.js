import { createWorker } from "tesseract.js";
import { styledRunsFromOcr } from "./style.js";

let workerPromise;

function ocrWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("vie+eng", 1, {
      workerPath: chrome.runtime.getURL("vendor/worker.min.js"),
      corePath: chrome.runtime.getURL("vendor/core"),
      langPath: chrome.runtime.getURL("vendor/lang"),
      workerBlobURL: false,
    }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
      return worker;
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không mở được ảnh màn hình."));
    image.src = dataUrl;
  });
}

async function recognize(dataUrl, region) {
  const image = await loadImage(dataUrl);
  const scaleX = image.naturalWidth / region.viewportWidth;
  const scaleY = image.naturalHeight / region.viewportHeight;
  const x = Math.max(0, Math.round(region.x * scaleX));
  const y = Math.max(0, Math.round(region.y * scaleY));
  const width = Math.min(image.naturalWidth - x, Math.round(region.width * scaleX));
  const height = Math.min(image.naturalHeight - y, Math.round(region.height * scaleY));
  if (width < 40 || height < 20) throw new Error("Vùng chọn không còn nằm trong cửa sổ. Hãy chọn lại.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, x, y, width, height, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height);
  let brightness = 0;
  let samples = 0;
  for (let i = 0; i < pixels.data.length; i += Math.max(4, Math.floor(pixels.data.length / 4000 / 4) * 4)) {
    brightness += (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
    samples += 1;
  }
  if (brightness / samples < 115) {
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = 255 - pixels.data[i];
      pixels.data[i + 1] = 255 - pixels.data[i + 1];
      pixels.data[i + 2] = 255 - pixels.data[i + 2];
    }
    context.putImageData(pixels, 0, 0);
  }

  const worker = await ocrWorker();
  const result = await worker.recognize(canvas.toDataURL("image/png"), {}, { text: true, blocks: true });
  const text = result.data.text.replace(/\r\n/g, "\n").trim();
  return { text, runs: styledRunsFromOcr(text, result.data.blocks, pixels.data, width, height) };
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type !== "OCR_CAPTURE") return false;
  recognize(message.dataUrl, message.region)
    .then((result) => respond({ ok: true, ...result }))
    .catch((error) => respond({ ok: false, error: error.message || String(error) }));
  return true;
});
