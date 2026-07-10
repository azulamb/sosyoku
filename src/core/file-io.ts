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

export interface FileSystemWritableFileStreamLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

/**
 * File System Access API (Chromium系のみ) のファイルハンドル。読み込み専用のFile Handling APIの
 * ハンドルとしても、書き込み可能なshowOpenFilePicker由来のハンドルとしても使う共通の形。
 */
export interface FileSystemFileHandleLike {
  readonly name?: string;
  getFile(): Promise<File>;
  createWritable?(): Promise<FileSystemWritableFileStreamLike>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

export interface PickedFile {
  file: File;
  /** File System Access API非対応環境や、ハンドルを取得できない経由の場合はnull */
  handle: FileSystemFileHandleLike | null;
}

export interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptionsLike {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
}

function getShowOpenFilePicker():
  | ((options?: OpenFilePickerOptionsLike) => Promise<FileSystemFileHandleLike[]>)
  | undefined {
  return (globalThis as unknown as {
    showOpenFilePicker?: (options?: OpenFilePickerOptionsLike) => Promise<FileSystemFileHandleLike[]>;
  }).showOpenFilePicker;
}

/**
 * File System Access API が使える環境では showOpenFilePicker() で書き込み可能なハンドル付きで
 * ファイルを選ばせる(後で同じファイルに上書き保存できるようにするため)。非対応環境では
 * 従来の <input type=file> にフォールバックする(ハンドルはnullになる)。
 */
export async function pickFilesWithHandles(types: FilePickerAcceptType[], multiple = false): Promise<PickedFile[]> {
  const showPicker = getShowOpenFilePicker();
  if (showPicker) {
    try {
      const handles = await showPicker({ multiple, types });
      const results: PickedFile[] = [];
      for (const handle of handles) {
        results.push({ file: await handle.getFile(), handle });
      }
      return results;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return [];
      // それ以外(未対応環境が誤検出された等)は従来方式へフォールバック
    }
  }
  const accept = types.flatMap((t) => Object.values(t.accept).flat()).join(',');
  const files = await pickFiles(accept, multiple);
  return files.map((file) => ({ file, handle: null }));
}

/** ハンドルに書き込み可能であれば同じファイルへ上書き保存する。書き込めなければfalseを返す */
export async function saveToHandle(handle: FileSystemFileHandleLike, blob: Blob): Promise<boolean> {
  if (!handle.createWritable) return false;
  try {
    if (handle.requestPermission) {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return false;
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export function setupDragAndDrop(target: HTMLElement, onFiles: (files: PickedFile[]) => void) {
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    void (async () => {
      const items = e.dataTransfer?.items;
      const results: PickedFile[] = [];
      if (items && items.length) {
        for (const item of Array.from(items)) {
          if (item.kind !== 'file') continue;
          const file = item.getAsFile();
          if (!file) continue;
          const getAsFileSystemHandle = (item as unknown as {
            getAsFileSystemHandle?: () => Promise<{ kind: string } & FileSystemFileHandleLike>;
          }).getAsFileSystemHandle;
          let handle: FileSystemFileHandleLike | null = null;
          if (getAsFileSystemHandle) {
            const h = await getAsFileSystemHandle.call(item).catch(() => null);
            if (h && h.kind === 'file') handle = h;
          }
          results.push({ file, handle });
        }
      } else if (e.dataTransfer?.files) {
        for (const file of Array.from(e.dataTransfer.files)) results.push({ file, handle: null });
      }
      if (results.length) onFiles(results);
    })();
  });
}

interface LaunchParamsLike {
  files: FileSystemFileHandleLike[];
}

interface LaunchQueueLike {
  setConsumer(consumer: (params: LaunchParamsLike) => void): void;
}

/**
 * File Handling API (Chromium系のみ) 対応。「このアプリで開く」から起動された際に受け取ったファイルを渡す。
 * ここで受け取るハンドルは書き込み可能なので、上書き保存にもそのまま使える。未対応ブラウザでは何もしない。
 */
export function setupFileHandling(onFiles: (files: PickedFile[]) => void) {
  const launchQueue = (globalThis as unknown as { launchQueue?: LaunchQueueLike }).launchQueue;
  if (!launchQueue) return;
  launchQueue.setConsumer((params) => {
    void (async () => {
      const results: PickedFile[] = [];
      for (const handle of params.files) {
        results.push({ file: await handle.getFile(), handle });
      }
      if (results.length) onFiles(results);
    })();
  });
}
