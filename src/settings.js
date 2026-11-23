// ─── Settings ────────────────────────────────────────────────────────────────
// Shared extension preferences, available to the popup and content scripts.

const Settings = (() => {
  let autoPipEnabled = false;

  const ready = chrome.storage.local.get({ autoPipEnabled: false }).then((settings) => {
    autoPipEnabled = settings.autoPipEnabled === true;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.autoPipEnabled) {
      autoPipEnabled = changes.autoPipEnabled.newValue === true;
    }
  });

  return {
    ready,

    shouldOpenPip() {
      return autoPipEnabled;
    },

    async setAutoPipEnabled(enabled) {
      await chrome.storage.local.set({ autoPipEnabled: enabled });
      autoPipEnabled = enabled;
    },
  };
})();
