/** ファイル保存(ダウンロード)・選択・ドラッグ&ドロップの共通処理 */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files ? Array.from(input.files) : []);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function setupDragAndDrop(target: HTMLElement, onFiles: (files: File[]) => void) {
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) onFiles(files);
  });
}

interface FileSystemFileHandleLike {
  getFile(): Promise<File>;
}

interface LaunchParamsLike {
  files: FileSystemFileHandleLike[];
}

interface LaunchQueueLike {
  setConsumer(consumer: (params: LaunchParamsLike) => void): void;
}

/**
 * File Handling API (Chromium系のみ) 対応。「このアプリで開く」から起動された際に受け取ったファイルを渡す。
 * 未対応ブラウザでは何もしない。
 */
export function setupFileHandling(onFiles: (files: File[]) => void) {
  const launchQueue = (globalThis as unknown as { launchQueue?: LaunchQueueLike }).launchQueue;
  if (!launchQueue) return;
  launchQueue.setConsumer((params) => {
    void (async () => {
      const files = await Promise.all(params.files.map((handle) => handle.getFile()));
      if (files.length) onFiles(files);
    })();
  });
}
