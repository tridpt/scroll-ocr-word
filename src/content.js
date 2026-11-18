(() => {
  if (globalThis.__scrollOcrWordInstalled) return;
  globalThis.__scrollOcrWordInstalled = true;

  let scrollTimer;
  let selecting = false;
  let selectedViewport = null;

  function notifyAfterPageChanges() {
    if (selecting) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: "SCROLL_SETTLED" }).catch(() => {});
    }, 850);
  }

  document.addEventListener("scroll", notifyAfterPageChanges, true);
  document.addEventListener("click", notifyAfterPageChanges, true);
  document.addEventListener("keyup", (event) => {
    if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) notifyAfterPageChanges();
  }, true);
  window.addEventListener("resize", () => {
    if (!selectedViewport) return;
    if (Math.abs(selectedViewport.width - innerWidth) <= 2 && Math.abs(selectedViewport.height - innerHeight) <= 2) return;
    selectedViewport = null;
    chrome.runtime.sendMessage({ type: "VIEWPORT_CHANGED", width: innerWidth, height: innerHeight }).catch(() => {});
  });

  function beginSelection() {
    if (selecting) return;
    selecting = true;
    const overlay = document.createElement("div");
    const box = document.createElement("div");
    const hint = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(10,25,20,.18);touch-action:none";
    box.style.cssText = "position:absolute;border:2px solid #e9a73b;background:rgba(233,167,59,.12);box-shadow:0 0 0 9999px rgba(10,25,20,.1);display:none;pointer-events:none";
    hint.style.cssText = "position:absolute;left:50%;top:20px;transform:translateX(-50%);padding:10px 16px;border-radius:8px;background:#fffaf0;color:#123d35;font:600 14px sans-serif;box-shadow:0 6px 24px #0005;pointer-events:none";
    hint.textContent = "Kéo chuột để chọn vùng chữ cố định · Esc để hủy";
    overlay.append(box, hint);
    document.documentElement.append(overlay);

    let start = null;
    function cleanup() {
      selecting = false;
      overlay.remove();
      document.removeEventListener("keydown", onKeydown, true);
    }
    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup();
      }
    }
    document.addEventListener("keydown", onKeydown, true);

    overlay.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      start = { x: event.clientX, y: event.clientY };
      overlay.setPointerCapture(event.pointerId);
      box.style.display = "block";
    });
    overlay.addEventListener("pointermove", (event) => {
      if (!start) return;
      const x = Math.min(start.x, event.clientX);
      const y = Math.min(start.y, event.clientY);
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${Math.abs(event.clientX - start.x)}px`;
      box.style.height = `${Math.abs(event.clientY - start.y)}px`;
    });
    overlay.addEventListener("pointerup", (event) => {
      if (!start) return;
      const x = Math.max(0, Math.min(start.x, event.clientX));
      const y = Math.max(0, Math.min(start.y, event.clientY));
      const width = Math.min(innerWidth - x, Math.abs(event.clientX - start.x));
      const height = Math.min(innerHeight - y, Math.abs(event.clientY - start.y));
      start = null;
      if (width < 60 || height < 40) return;
      cleanup();
      selectedViewport = { width: innerWidth, height: innerHeight };
      chrome.runtime.sendMessage({
        type: "REGION_SELECTED",
        region: {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        },
      }).catch(() => {});
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "BEGIN_SELECT") beginSelection();
  });
})();
