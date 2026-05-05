const DEFAULT_DURATION_MS = 1800;
const DEFAULT_DEBOUNCE_MS = 700;
const MIN_DURATION_MS = 1200;

function normalizeMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

function createUiToastController() {
  return {
    lastKey: "",
    lastShownAt: 0,

    show(page, options = {}) {
      if (!page || typeof page.selectComponent !== "function") {
        return false;
      }
      const toast = page.selectComponent("#uiToast");
      if (!toast || typeof toast.show !== "function") {
        return false;
      }

      const text = String(options.text || "").trim();
      if (!text) {
        return false;
      }

      const type = options.type || "success";
      const key = options.key || `${type}:${text}`;
      const debounceMs = normalizeMs(options.debounceMs, DEFAULT_DEBOUNCE_MS);
      const now = Date.now();
      if (this.lastKey === key && now - this.lastShownAt < debounceMs) {
        return false;
      }

      this.lastKey = key;
      this.lastShownAt = now;
      const duration = Math.max(
        MIN_DURATION_MS,
        normalizeMs(options.duration, DEFAULT_DURATION_MS)
      );

      toast.show({
        text,
        type,
        duration,
      });
      return true;
    },
  };
}

module.exports = createUiToastController;
