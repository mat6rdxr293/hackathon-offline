(() => {
  const candidates = ['content.js', 'dist/content.js', 'assets/content.js', 'dist/assets/content.js'];

  const tryImport = async () => {
    const errors = [];

    for (const candidate of candidates) {
      const moduleUrl = chrome.runtime.getURL(candidate);
      try {
        await import(moduleUrl);
        return;
      } catch (error) {
        errors.push({ candidate, error });
      }
    }

    console.error(
      '[MedFlow] Failed to load content module from any candidate path. ' +
        'Rebuild extension and reload unpacked extension from apps/extension or apps/extension/dist, then hard-refresh the page.',
      errors,
    );
  };

  void tryImport();
})();
