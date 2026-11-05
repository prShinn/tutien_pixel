const VisualEffects = (() => {
  const STORAGE_KEY = "tutien.persistentEffects.v3";

  function readEnabled() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === "true";
    } catch { return true; }
  }

  let persistentEffectsEnabled = readEnabled();

  return Object.freeze({
    arePersistentEffectsEnabled() {
      return persistentEffectsEnabled;
    },

    setPersistentEffectsEnabled(value) {
      persistentEffectsEnabled = Boolean(value);
      try { localStorage.setItem(STORAGE_KEY, String(persistentEffectsEnabled)); } catch { }
      return persistentEffectsEnabled;
    },
  });
})();
