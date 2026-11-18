function luminance(pixels, width, x, y) {
  const offset = (y * width + x) * 4;
  return 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
}

export function measureWord(pixels, width, height, bbox, inverted = false) {
  const x0 = Math.max(1, Math.floor(bbox.x0));
  const y0 = Math.max(1, Math.floor(bbox.y0));
  const x1 = Math.min(width - 1, Math.ceil(bbox.x1));
  const y1 = Math.min(height - 1, Math.ceil(bbox.y1));
  if (x1 <= x0 || y1 <= y0) return null;

  const ink = (x, y) => inverted
    ? luminance(pixels, width, x, y) > 100
    : luminance(pixels, width, x, y) < 155;
  let black = 0;
  let interior = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!ink(x, y)) continue;
      black += 1;
      if (ink(x - 1, y) && ink(x + 1, y) && ink(x, y - 1) && ink(x, y + 1)) interior += 1;
    }
  }
  if (black < 10) return null;
  return {
    interior: interior / black,
    density: black / ((x1 - x0) * (y1 - y0)),
  };
}

function pushRun(runs, text, bold) {
  if (!text) return;
  if (runs.at(-1)?.bold === bold) runs[runs.length - 1].text += text;
  else runs.push({ text, bold });
}

function boldThreshold(values) {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  let low = sorted[Math.floor(sorted.length * 0.2)];
  let high = sorted[Math.floor(sorted.length * 0.8)];
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const midpoint = (low + high) / 2;
    const lowValues = values.filter((value) => value < midpoint);
    const highValues = values.filter((value) => value >= midpoint);
    if (!lowValues.length || !highValues.length) return null;
    low = lowValues.reduce((sum, value) => sum + value, 0) / lowValues.length;
    high = highValues.reduce((sum, value) => sum + value, 0) / highValues.length;
  }
  if (high - low < 0.095) return null;
  return (low + high) / 2;
}

export function styledRunsFromOcr(text, blocks, pixels, width, height) {
  const lines = (blocks || []).flatMap((block) => block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []);
  const words = lines.flatMap((line) => line.words || []).map((word) => ({
    text: word.text?.trim() || "",
    fontName: word.font_name || "",
    score: word.bbox ? measureWord(pixels, width, height, word.bbox)?.interior : null,
  }));
  const reference = words.filter((word) => word.text.match(/\p{L}{3,}/u) && word.score != null).map((word) => word.score);
  const threshold = boldThreshold(reference);
  const runs = [];
  let cursor = 0;
  let previousBold = false;
  const lower = text.toLocaleLowerCase();

  for (const word of words) {
    if (!word.text) continue;
    let index = text.indexOf(word.text, cursor);
    if (index < 0) index = lower.indexOf(word.text.toLocaleLowerCase(), cursor);
    if (index < 0) continue;
    const bold = /bold|black|heavy/i.test(word.fontName)
      || (threshold != null && word.score != null && word.score >= threshold);
    pushRun(runs, text.slice(cursor, index), previousBold && bold);
    pushRun(runs, text.slice(index, index + word.text.length), bold);
    cursor = index + word.text.length;
    previousBold = bold;
  }
  pushRun(runs, text.slice(cursor), false);
  return runs;
}
