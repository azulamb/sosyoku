import './components/menu-button.ts';
import './components/app-menu.ts';
import './components/app-topbar.ts';
import './components/panel-area.ts';
import './components/tool-button.ts';
import './components/tool-bar.ts';
import './components/canvas-desk.ts';
import './components/drawing-canvas.ts';
import './components/layer-item.ts';
import './components/layer-panel.ts';
import './components/color-picker-modal.ts';
import './components/layer-add-modal.ts';
import './components/settings-modal.ts';
import './components/about-modal.ts';
import './components/pen-item.ts';
import './components/pen-panel.ts';
import './components/pen-io-modal.ts';
import './components/status-bar.ts';
import './components/canvas-tabs.ts';
import './components/pressure-curve-editor.ts';

import { SosyokuDocument } from './core/document.ts';
import { NormalLayer } from './core/layer.ts';
import { importImageAsReferenceLayer, isImageFile, isSsxFile, loadSsx, saveSsx } from './core/ssx.ts';
import { exportFlattenedPng } from './core/canvas-engine.ts';
import {
  downloadBlob,
  type FilePickerAcceptType,
  type FileSystemFileHandleLike,
  type PickedFile,
  pickFilesWithHandles,
  saveToHandle,
  setupDragAndDrop,
  setupFileHandling,
} from './core/file-io.ts';
import { applyTheme, settingsStore } from './core/settings-store.ts';
import { hexToRgb, rgbaToHex8 } from './core/color.ts';
import {
  bindingsEqual,
  findKeyboardShortcutAction,
  gamepadBindingToken,
  readActiveGamepadBindings,
  type ShortcutActionId,
} from './core/shortcuts.ts';
import { buildAppSettingsCategories, buildDocumentSettingsCategories } from './core/settings-forms.ts';
import { isTypingTarget, listen } from './core/dom.ts';
import { TOOL_ORDER, type ToolName } from './core/tools.ts';
import { wrapIndex } from './core/util.ts';
import { t } from './i18n/index.ts';
import type { TabInfo } from './components/canvas-tabs.ts';
import type { ToolBarElement } from './components/tool-bar.ts';
import type { DrawingCanvasElement } from './components/drawing-canvas.ts';
import type { LayerPanelElement } from './components/layer-panel.ts';
import type { PanelAreaElement } from './components/panel-area.ts';
import type { PenPanelElement } from './components/pen-panel.ts';
import type { StatusBarElement } from './components/status-bar.ts';
import type { CanvasTabsElement } from './components/canvas-tabs.ts';
import type { CanvasDeskElement } from './components/canvas-desk.ts';
import type { AboutModalElement } from './components/about-modal.ts';
import type { SettingsModalElement } from './components/settings-modal.ts';

const NEW_DOCUMENT_SIZE = 1000;

let doc: SosyokuDocument;
let drawingCanvas: DrawingCanvasElement;
let toolBar: ToolBarElement | null;
let layerPanel: LayerPanelElement;
let penPanel: PenPanelElement;
let statusBar: StatusBarElement | null;
let canvasTabs: CanvasTabsElement | null;
let gridVisible = false;
let activeTool: ToolName = 'pen';
let newDocCounter = 1;
const openDocuments = new Map<string, SosyokuDocument>();
/** ファイルを開いた際に取得できた書き込み可能なハンドル。保存時にあれば同じファイルへ上書きする */
const fileHandles = new Map<string, FileSystemFileHandleLike>();

// bootstrap()が生成・操作する全カスタム要素の定義完了を待つ。バンドラーによる
// モジュール実行順の違い(esbuild/deno bundle間など)に依存しないようにするため、
// ここで使われるタグを漏れなく列挙する。
const REQUIRED_ELEMENTS = [
  'menu-button',
  'app-menu',
  'app-topbar',
  'panel-area',
  'tool-button',
  'tool-bar',
  'canvas-desk',
  'drawing-canvas',
  'layer-item',
  'layer-panel',
  'color-picker-modal',
  'layer-add-modal',
  'settings-modal',
  'about-modal',
  'pen-item',
  'pen-panel',
  'pen-io-modal',
  'status-bar',
  'canvas-tabs',
];

Promise.all(REQUIRED_ELEMENTS.map((tag) => customElements.whenDefined(tag))).then(() => {
  bootstrap();
});

function createElement<T extends HTMLElement>(tagName: string, appendTo?: Element | null): T {
  const el = document.createElement(tagName) as T;
  appendTo?.appendChild(el);
  return el;
}

function query<T extends Element>(selector: string): T | null {
  return document.querySelector(selector) as T | null;
}

function bootstrap() {
  const settings = settingsStore.get();
  applyTheme(settings.theme);

  document.addEventListener('settings-changed', () => {
    drawingCanvas?.setPressureCurve(settingsStore.get().pressureCurve);
  });

  // 各コンポーネントが document.querySelector で参照するモーダル群
  createElement('color-picker-modal', document.body);
  createElement('layer-add-modal', document.body);
  createElement('pen-io-modal', document.body);
  const settingsModal = createElement<SettingsModalElement>('settings-modal', document.body);
  const aboutModal = createElement<AboutModalElement>('about-modal', document.body);

  statusBar = query<StatusBarElement>('status-bar');
  canvasTabs = query<CanvasTabsElement>('canvas-tabs');
  toolBar = query<ToolBarElement>('tool-bar');
  const canvasDesk = query<CanvasDeskElement>('canvas-desk');

  setupTabs();

  drawingCanvas = createElement<DrawingCanvasElement>('drawing-canvas', canvasDesk);
  drawingCanvas.setBrush({ radius: 3, shape: 'round' });
  drawingCanvas.setPressureCurve(settings.pressureCurve);
  drawingCanvas.setTouchDrawingDisabled(settings.touchDrawingDisabled);
  listen<{ pressure: number }>(drawingCanvas, 'pointer-info', ({ pressure }) => statusBar?.setPressure(pressure));
  if (canvasDesk) {
    listen<{ zoom: number }>(canvasDesk, 'zoom-changed', ({ zoom }) => statusBar?.setZoom(zoom));
    statusBar?.setZoomChangeCallback((zoom) => canvasDesk.setZoom(zoom));
  }

  setupToolBar(settings.touchDrawingDisabled);

  layerPanel = createElement<LayerPanelElement>('layer-panel');
  layerPanel.setRenderCallback(() => drawingCanvas.render());
  query<PanelAreaElement>('#panel-left')?.setPanel(layerPanel);

  penPanel = createElement<PenPanelElement>('pen-panel');
  penPanel.setActiveChangeCallback((pen) => drawingCanvas.setBrush({ radius: pen.size / 2, shape: pen.shape }));
  query<PanelAreaElement>('#panel-right')?.setPanel(penPanel);

  const canvasArea = query<HTMLElement>('.canvas-area');
  if (canvasArea) setupDragAndDrop(canvasArea, (files) => void handleIncomingFiles(files));

  globalThis.addEventListener('keydown', onGlobalKeyDown);

  const initialDoc = createDocument(t('document.untitled'));
  registerDocument(initialDoc);
  switchToDocument(initialDoc.id);
  startGamepadShortcuts();

  // app-menu から発火されるリクエスト
  const menuRequests: Record<string, () => void> = {
    'sosyoku-open-request': () => void openFileDialog(),
    'sosyoku-save-request': () => void saveCurrentDocument(),
    'sosyoku-export-request': () => void exportCurrentDocument(),
    'sosyoku-about-request': () => void aboutModal.open(),
    'sosyoku-document-settings-request': () => void openDocumentSettings(settingsModal),
    'sosyoku-settings-request': () => void openAppSettings(settingsModal),
    'sosyoku-install-request': () => void promptPwaInstall(),
  };
  for (const [type, handler] of Object.entries(menuRequests)) document.addEventListener(type, handler);

  setupFileHandling((files) => void handleIncomingFiles(files));
}

function setupTabs() {
  if (!canvasTabs) return;
  listen<{ id: string }>(canvasTabs, 'tab-select', ({ id }) => switchToDocument(id));
  listen<{ id: string }>(canvasTabs, 'tab-close', ({ id }) => closeTab(id));
  canvasTabs.addEventListener('tab-new', () => createNewDocument());
  listen<{ id: string; name: string }>(canvasTabs, 'tab-rename', ({ id, name }) => {
    const target = openDocuments.get(id);
    if (!target) return;
    target.title = name;
    refreshTabs();
  });
}

function setupToolBar(touchDrawingDisabled: boolean) {
  if (!toolBar) return;
  toolBar.setTouchDrawingDisabled(touchDrawingDisabled);
  listen<{ tool: ToolName }>(toolBar, 'tool-change', ({ tool }) => activateTool(tool));
  listen<{ disabled: boolean }>(toolBar, 'touch-drawing-toggle', ({ disabled }) => setTouchDrawingDisabled(disabled));
  toolBar.addEventListener('undo', undo);
  toolBar.addEventListener('redo', redo);
  toolBar.addEventListener('grid-toggle', toggleGrid);
  toolBar.addEventListener('save', () => void saveCurrentDocument());
}

// ---- ショートカット ----

function onGlobalKeyDown(e: KeyboardEvent) {
  if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
  const action = findKeyboardShortcutAction(e, settingsStore.get().shortcuts);
  if (!action) return;
  // 選択解除/選択範囲削除は対象が無ければ何もしないので、実行された場合のみ既定動作を止める
  if (runShortcutAction(action)) e.preventDefault();
}

function startGamepadShortcuts() {
  let initialized = false;
  let previous = new Set<string>();
  const poll = () => {
    const active = readActiveGamepadBindings();
    if (initialized && !document.querySelector('dialog[open]')) {
      for (const binding of active) {
        if (previous.has(gamepadBindingToken(binding))) continue;
        const assignment = settingsStore.get().shortcuts.find((item) => bindingsEqual(item.binding, binding));
        if (assignment) runShortcutAction(assignment.action);
      }
    }
    initialized = true;
    previous = new Set(active.map(gamepadBindingToken));
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

const TOOL_SHORTCUTS: Partial<Record<ShortcutActionId, ToolName>> = {
  toolPen: 'pen',
  toolEraser: 'eraser',
  toolFill: 'fill',
  toolSelect: 'select',
  toolMove: 'move',
};

/** ショートカットに割り当てられた操作を実行する。戻り値は操作が実際に行われたかどうか */
function runShortcutAction(action: ShortcutActionId): boolean {
  const tool = TOOL_SHORTCUTS[action];
  if (tool) {
    activateTool(tool);
    return true;
  }
  switch (action) {
    case 'undo':
      undo();
      break;
    case 'redo':
      redo();
      break;
    case 'save':
      void saveCurrentDocument();
      break;
    case 'deselect':
    case 'deleteSelection':
      return drawingCanvas.runShortcutAction(action);
    case 'penPrevious':
      penPanel.selectRelative(-1);
      break;
    case 'penNext':
      penPanel.selectRelative(1);
      break;
    case 'layerUp':
      layerPanel.selectRelative(-1);
      break;
    case 'layerDown':
      layerPanel.selectRelative(1);
      break;
    case 'toolPrevious':
      cycleTool(-1);
      break;
    case 'toolNext':
      cycleTool(1);
      break;
    case 'toggleGrid':
      toggleGrid();
      break;
    case 'toggleTouchDrawing':
      setTouchDrawingDisabled(!settingsStore.get().touchDrawingDisabled);
      break;
  }
  return true;
}

// ---- ツール・表示 ----

function undo() {
  doc.history.undo();
  drawingCanvas.render();
}

function redo() {
  doc.history.redo();
  drawingCanvas.render();
}

function activateTool(tool: ToolName) {
  activeTool = tool;
  drawingCanvas.setTool(tool);
  toolBar?.setActiveTool(tool);
}

function cycleTool(offset: number) {
  const currentIndex = Math.max(0, TOOL_ORDER.indexOf(activeTool));
  activateTool(TOOL_ORDER[wrapIndex(currentIndex, offset, TOOL_ORDER.length)]);
}

function setGridVisible(visible: boolean) {
  gridVisible = visible;
  drawingCanvas.setGridVisible(visible);
  toolBar?.setGridActive(visible);
}

function toggleGrid() {
  setGridVisible(!gridVisible);
}

function setTouchDrawingDisabled(disabled: boolean) {
  drawingCanvas.setTouchDrawingDisabled(disabled);
  toolBar?.setTouchDrawingDisabled(disabled);
  settingsStore.update({ touchDrawingDisabled: disabled });
}

// ---- PWA ----

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // バンドルの実行時点で既に window の load イベントが発火済みの場合があるため、
  // 'load' を待たず、この時点で直接登録する。
  navigator.serviceWorker.register('sw.js').catch(() => {
    // オフライン対応は付加的機能のため、登録に失敗してもアプリ自体は継続動作する
  });
}

registerServiceWorker();

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

function setInstallable(installable: boolean) {
  document.dispatchEvent(new CustomEvent('sosyoku-installable-changed', { detail: { installable } }));
}

globalThis.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e as BeforeInstallPromptEvent;
  setInstallable(true);
});

globalThis.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setInstallable(false);
});

async function promptPwaInstall() {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  setInstallable(false);
}

// ---- 設定 ----

async function openDocumentSettings(settingsModal: SettingsModalElement) {
  const categories = buildDocumentSettingsCategories(doc);
  const result = await settingsModal.open(t('docsettings.title'), categories);
  if (result !== 'save') return;
  for (const category of categories) category.apply();
  showDocumentInCanvas();
  refreshTabs();
}

async function openAppSettings(settingsModal: SettingsModalElement) {
  const categories = buildAppSettingsCategories();
  const result = await settingsModal.open(t('appsettings.title'), categories);
  if (result === 'save') {
    for (const category of categories) category.apply();
  }
  for (const category of categories) category.dispose?.();
}

// ---- ドキュメント・タブ管理 ----

/** 新しく開いた/作成したドキュメントをタブ管理下に登録する(履歴・変更イベントの購読は1回だけ) */
function registerDocument(newDoc: SosyokuDocument) {
  openDocuments.set(newDoc.id, newDoc);
  newDoc.history.addEventListener('changed', () => {
    if (doc === newDoc) toolBar?.setUndoRedoEnabled(newDoc.history.canUndo, newDoc.history.canRedo);
    refreshTabs();
  });
  newDoc.addEventListener('layers-changed', refreshTabs);
  newDoc.addEventListener('document-changed', refreshTabs);
}

function refreshTabs() {
  const tabs: TabInfo[] = [...openDocuments.values()].map((d) => ({ id: d.id, title: d.title, dirty: d.dirty }));
  canvasTabs?.setTabs(tabs, doc?.id ?? null);
}

/** 現在のドキュメントのサイズ・背景色をキャンバスとステータスバーへ反映する */
function showDocumentInCanvas() {
  drawingCanvas.setDocument(doc);
  drawingCanvas.setBackgroundColor(doc.backgroundColor);
  statusBar?.setSize(doc.width, doc.height);
}

function switchToDocument(id: string) {
  const target = openDocuments.get(id);
  if (!target) return;
  doc = target;
  showDocumentInCanvas();
  layerPanel.setDocument(doc);
  setGridVisible(false);
  toolBar?.setUndoRedoEnabled(doc.history.canUndo, doc.history.canRedo);
  activateTool('pen');
  refreshTabs();
}

/** 新規ドキュメントを作成する。1枚目のレイヤー色にはパレットの2番目の色を使う(背景色は1番目の色、不透明) */
function createDocument(title: string): SosyokuDocument {
  const palette = settingsStore.get().palette;
  const [bgR, bgG, bgB] = hexToRgb(palette[0] ?? '#ffffff');
  const newDoc = new SosyokuDocument({
    title,
    width: NEW_DOCUMENT_SIZE,
    height: NEW_DOCUMENT_SIZE,
    backgroundColor: rgbaToHex8(bgR, bgG, bgB, 1),
  });
  const layer = new NormalLayer({
    name: t('layer.defaultName', { n: 1 }),
    width: newDoc.width,
    height: newDoc.height,
    color: palette[1] ?? '#141820',
  });
  newDoc.addLayer(layer, 0);
  return newDoc;
}

function createNewDocument() {
  newDocCounter += 1;
  const untitled = t('document.untitled');
  const newDoc = createDocument(openDocuments.size === 0 ? untitled : `${untitled}${newDocCounter}`);
  registerDocument(newDoc);
  switchToDocument(newDoc.id);
}

function closeTab(id: string) {
  if (!openDocuments.has(id)) return;
  openDocuments.delete(id);
  fileHandles.delete(id);
  if (openDocuments.size === 0) {
    createNewDocument();
  } else if (doc.id === id) {
    switchToDocument(openDocuments.keys().next().value!);
  } else {
    refreshTabs();
  }
}

// ---- ファイル入出力 ----

/** .ssxがあればそれを新しいタブで開き、なければ画像ファイルを参照レイヤーとして現在のドキュメントに取り込む */
async function handleIncomingFiles(files: PickedFile[]) {
  const ssxPicked = files.find((f) => isSsxFile(f.file));
  if (ssxPicked) {
    const opened = await loadSsx(ssxPicked.file);
    registerDocument(opened);
    if (ssxPicked.handle) fileHandles.set(opened.id, ssxPicked.handle);
    switchToDocument(opened.id);
    return;
  }
  for (const { file } of files) {
    if (!isImageFile(file)) continue;
    doc.addLayer(await importImageAsReferenceLayer(file, doc), 0);
    drawingCanvas.render();
  }
}

const OPEN_FILE_TYPES: FilePickerAcceptType[] = [
  { description: 'Sosyoku', accept: { 'application/zip': ['.ssx'] } },
  { description: 'Image', accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] } },
];

async function openFileDialog() {
  const files = await pickFilesWithHandles(OPEN_FILE_TYPES, true);
  if (files.length) await handleIncomingFiles(files);
}

function documentFileName(extension: string): string {
  return `${doc.title || t('document.untitled')}.${extension}`;
}

/**
 * 開いた際に書き込み可能なハンドルが取得できていれば同じファイルへ上書き保存し、
 * そうでなければ(新規ドキュメントや非対応ブラウザ)従来通り新規ダウンロードする。
 */
async function saveCurrentDocument() {
  const blob = await saveSsx(doc);
  const handle = fileHandles.get(doc.id);
  const overwritten = handle ? await saveToHandle(handle, blob) : false;
  if (!overwritten) downloadBlob(blob, documentFileName('ssx'));
  doc.dirty = false;
  refreshTabs();
}

async function exportCurrentDocument() {
  downloadBlob(await exportFlattenedPng(doc), documentFileName('png'));
}
