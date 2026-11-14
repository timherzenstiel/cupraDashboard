/** Opens the browser's file dialog and resolves with the chosen file's text, or null when cancelled. */
export function pickExportFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
