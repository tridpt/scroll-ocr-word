const WORD_RE = /[\p{L}\p{N}]+/gu;

function words(text) {
  return [...text.matchAll(WORD_RE)].map((match) => ({
    value: match[0].toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/\p{M}/gu, ""),
    end: match.index + match[0].length,
  }));
}

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function mergeText(existing, incoming) {
  const oldText = existing.trim();
  const newText = incoming.trim();
  if (!newText) return oldText;
  if (!oldText) return newText;

  const oldWords = words(oldText).slice(-140).map((word) => word.value);
  const newWords = words(newText).slice(0, 140);
  let best = null;

  for (let oldCount = Math.min(oldWords.length, newWords.length + 4); oldCount >= 6; oldCount -= 1) {
    const oldTail = oldWords.slice(-oldCount);
    const tolerance = Math.min(4, Math.ceil(oldCount * 0.12));
    for (let newCount = Math.max(6, oldCount - tolerance); newCount <= Math.min(newWords.length, oldCount + tolerance); newCount += 1) {
      const errors = distance(oldTail, newWords.slice(0, newCount).map((word) => word.value));
      const accuracy = 1 - errors / Math.max(oldCount, newCount);
      const threshold = oldCount < 12 ? 0.9 : 0.82;
      const score = Math.min(oldCount, newCount) - errors * 4;
      if (accuracy >= threshold && (!best || score > best.score || (score === best.score && accuracy > best.accuracy))) {
        best = { newCount, accuracy, score };
      }
    }
  }

  if (!best) return `${oldText}\n\n${newText}`;

  let remainder = newText.slice(newWords[best.newCount - 1].end);
  if (!words(remainder).length) return oldText;
  if (/[.!?,;:]$/.test(oldText)) remainder = remainder.replace(/^[\s.!?,;:]+/u, " ");
  if (!remainder.trim()) return oldText;
  const joiner = /^[.!?,;:]/.test(remainder) ? "" : /^\s*\n\s*\n/.test(remainder) ? "\n\n" : /^\s*\n/.test(remainder) ? "\n" : " ";
  return `${oldText}${joiner}${remainder.trim()}`;
}
