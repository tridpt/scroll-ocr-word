export function normalizeRuns(runs) {
  const result = [];
  for (const run of runs) {
    if (!run.text) continue;
    if (result.at(-1)?.bold === Boolean(run.bold)) result[result.length - 1].text += run.text;
    else result.push({ text: run.text, bold: Boolean(run.bold) });
  }
  return result;
}

export function textOf(runs) {
  return runs.map((run) => run.text).join("");
}

function suffixRuns(runs, offset) {
  const result = [];
  let cursor = 0;
  for (const run of runs) {
    const end = cursor + run.text.length;
    if (end > offset) result.push({ text: run.text.slice(Math.max(0, offset - cursor)), bold: run.bold });
    cursor = end;
  }
  return result;
}

export function mergeStyledRuns(oldText, oldRuns, newText, newRuns, mergedText) {
  const existing = oldRuns && textOf(oldRuns) === oldText ? oldRuns : [{ text: oldText, bold: false }];
  if (mergedText === oldText) return normalizeRuns(existing);
  if (!mergedText.startsWith(oldText)) return [{ text: mergedText, bold: false }];

  const added = mergedText.slice(oldText.length);
  const suffix = added.trimStart();
  const sourceIndex = newText.lastIndexOf(suffix);
  if (sourceIndex < 0 || !newRuns || textOf(newRuns) !== newText) {
    return normalizeRuns([...existing, { text: added, bold: false }]);
  }
  const separator = added.slice(0, added.length - suffix.length);
  return normalizeRuns([...existing, { text: separator, bold: false }, ...suffixRuns(newRuns, sourceIndex)]);
}
