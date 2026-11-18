import test from "node:test";
import assert from "node:assert/strict";
import { mergeText } from "../src/merge.js";

test("joins overlapping Vietnamese OCR without repeating text", () => {
  const before = "Khi khách hàng bước vào cửa hàng, họ không chỉ quyết định dựa trên giá trị thực tế của sản phẩm.";
  const after = "họ không chỉ quyết định dựa trên giá trị thực tế của sản phẩm. Thay vào đó, họ bị ảnh hưởng bởi cảm xúc.";
  assert.equal(mergeText(before, after), `${before} Thay vào đó, họ bị ảnh hưởng bởi cảm xúc.`);
});

test("accepts a small OCR mistake in the repeated portion", () => {
  const before = "Những yếu tố này có thể là sự hấp dẫn của cửa hàng hoặc chiến lược tiếp thị hiệu quả.";
  const after = "Những yếu tố này có thể là sự hấp dẩn của cửa hàng hoặc chiến lược tiếp thị hiệu quả. Người bán cần hiểu điều đó.";
  assert.equal(mergeText(before, after), `${before} Người bán cần hiểu điều đó.`);
});

test("adds new pages and ignores duplicate captures", () => {
  assert.equal(mergeText("Trang một.", "Trang hai."), "Trang một.\n\nTrang hai.");
  assert.equal(mergeText("Đây là một đoạn văn đủ dài để kiểm tra việc chụp lại cùng một trang.", "Đây là một đoạn văn đủ dài để kiểm tra việc chụp lại cùng một trang."), "Đây là một đoạn văn đủ dài để kiểm tra việc chụp lại cùng một trang.");
});
