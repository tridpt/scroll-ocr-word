import test from "node:test";
import assert from "node:assert/strict";
import { mergeText } from "../src/merge.js";
import { mergeStyledRuns, textOf } from "../src/rich-text.js";

test("keeps bold spans while removing overlapping OCR text", () => {
  const oldRuns = [
    { text: "Đoạn chữ thường mở đầu. ", bold: false },
    { text: "Những từ quan trọng được in đậm ở cuối trang.", bold: true },
  ];
  const newRuns = [
    { text: "Những từ quan trọng được in đậm ở cuối trang.", bold: true },
    { text: " Phần tiếp theo là chữ thường.", bold: false },
  ];
  const oldText = textOf(oldRuns);
  const newText = textOf(newRuns);
  const merged = mergeText(oldText, newText);
  const runs = mergeStyledRuns(oldText, oldRuns, newText, newRuns, merged);
  assert.equal(textOf(runs), merged);
  assert.deepEqual(runs, [
    oldRuns[0],
    oldRuns[1],
    { text: " Phần tiếp theo là chữ thường.", bold: false },
  ]);
});

test("keeps an existing styled draft when a capture adds no text", () => {
  const runs = [{ text: "Một dòng chữ đậm đã được quét.", bold: true }];
  assert.deepEqual(mergeStyledRuns(textOf(runs), runs, textOf(runs), runs, textOf(runs)), runs);
});
