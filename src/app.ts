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
import './components/settings-modal.ts';
import './components/about-modal.ts';
import './components/pen-item.ts';
import './components/pen-panel.ts';
import './components/pen-io-modal.ts';
import './components/status-bar.ts';
import './components/canvas-tabs.ts';
import './components/pressure-curve-editor.ts';

import { SosyokuDocument } from './core/document.ts';
import type { TabInfo } from './components/canvas-tabs.ts';
import { NormalLayer } from './core/layer.ts';
import { importImageAsReferenceLayer, isImageFile, isSsxFile, loadSsx, saveSsx } from './core/ssx.ts';
import { exportFlattenedPng } from './core/canvas-engine.ts';
import { downloadBlob, pickFiles, setupDragAndDrop, setupFileHandling } from './core/file-io.ts';
import { applyTheme, settingsStore } from './core/settings-store.ts';
import { hexToRgb, rgbaToHex8 } from './core/color.ts';
import type { PenSetting } from './core/settings-store.ts';
import { buildAppSettingsCategories, buildDocumentSettingsCategories } from './core/settings-forms.ts';
import { t } from './i18n/index.ts';
import type { ToolBarElement, ToolBarTool } from './components/tool-bar.ts';
import type { BrushSetting, DrawingCanvasElement, ToolName } from './components/drawing-canvas.ts';
import type { CurvePoint } from './core/pressure-curve.ts';
import type { LayerPanelElement } from './components/layer-panel.ts';
import type { PanelAreaElement } from './components/panel-area.ts';
import type { PenPanelElement } from './components/pen-panel.ts';
import type { StatusBarElement } from './components/status-bar.ts';
import type { CanvasTabsElement } from './components/canvas-tabs.ts';
import type { CanvasDeskElement } from './components/canvas-desk.ts';
import type { AboutModalElement } from './components/about-modal.ts';
import type { SettingsModalElement } from './components/settings-modal.ts';

let doc: SosyokuDocument;
let drawingCanvas: DrawingCanvasElement;
let toolBar: ToolBarElement | null;
let layerPanel: LayerPanelElement;
let statusBar: StatusBarElement | null;
let canvasTabs: CanvasTabsElement | null;
let gridVisible = false;
let newDocCounter = 1;
const openDocuments = new Map<string, SosyokuDocument>();

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

function bootstrap() {
  applyTheme(settingsStore.get().theme);

  document.addEventListener('settings-changed', () => {
    drawingCanvas?.setPressureCurve(settingsStore.get().pressureCurve);
  });

  const colorPicker = document.createElement('color-picker-modal');
  document.body.appendChild(colorPicker);

  const settingsModal = document.createElement('settings-modal') as unknown as SettingsModalElement;
  document.body.appendChild(settingsModal);

  const aboutModal = document.createElement('about-modal') as unknown as AboutModalElement;
  document.body.appendChild(aboutModal);

  const penIoModal = document.createElement('pen-io-modal');
  document.body.appendChild(penIoModal);

  statusBar = document.querySelector('status-bar') as unknown as StatusBarElement | null;
  canvasTabs = document.querySelector('canvas-tabs') as unknown as CanvasTabsElement | null;
  canvasTabs?.addEventListener('tab-select', (e) => switchToDocument((e as CustomEvent<{ id: string }>).detail.id));
  canvasTabs?.addEventListener('tab-close', (e) => closeTab((e as CustomEvent<{ id: string }>).detail.id));
  canvasTabs?.addEventListener('tab-new', () => createNewDocument());
  canvasTabs?.addEventListener('tab-rename', (e) => {
    const { id, name } = (e as CustomEvent<{ id: string; name: string }>).detail;
    const target = openDocuments.get(id);
    if (!target) return;
    target.title = name;
    refreshTabs();
  });

  drawingCanvas = document.createElement('drawing-canvas') as unknown as DrawingCanvasElement;
  const canvasDesk = document.querySelector('canvas-desk') as unknown as CanvasDeskElement | null;
  canvasDesk?.appendChild(drawingCanvas);
  canvasDesk?.addEventListener('zoom-changed', (e) => {
    statusBar?.setZoom((e as CustomEvent<{ zoom: number }>).detail.zoom);
  });
  statusBar?.setZoomChangeCallback((zoom) => canvasDesk?.setZoom(zoom));
  drawingCanvas.addEventListener('pointer-info', (e) => {
    const detail = (e as CustomEvent<{ pressure: number }>).detail;
    statusBar?.setPressure(detail.pressure);
  });
  drawingCanvas.setBrush({ radius: 3, shape: 'round' });
  drawingCanvas.setPressureCurve(settingsStore.get().pressureCurve);

  toolBar = document.querySelector('tool-bar') as unknown as ToolBarElement | null;
  toolBar?.addEventListener('tool-change', (e) => {
    drawingCanvas.setTool((e as CustomEvent<{ tool: ToolBarTool }>).detail.tool);
  });
  toolBar?.addEventListener('undo', () => {
    doc.history.undo();
    drawingCanvas.render();
  });
  toolBar?.addEventListener('redo', () => {
    doc.history.redo();
    drawingCanvas.render();
  });
  toolBar?.addEventListener('grid-toggle', () => {
    gridVisible = !gridVisible;
    drawingCanvas.setGridVisible(gridVisible);
    toolBar?.setGridActive(gridVisible);
  });
  toolBar?.addEventListener('save', () => void saveCurrentDocument());

  layerPanel = document.createElement('layer-panel') as unknown as LayerPanelElement;
  layerPanel.setRenderCallback(() => drawingCanvas.render());

  const panelLeft = document.getElementById('panel-left') as unknown as PanelAreaElement | null;
  panelLeft?.setPanel(layerPanel);

  const penPanel = document.createElement('pen-panel') as unknown as PenPanelElement;
  penPanel.setActiveChangeCallback((pen) => {
    drawingCanvas.setBrush({ radius: pen.size / 2, shape: pen.shape });
  });

  const panelRight = document.getElementById('panel-right') as unknown as PanelAreaElement | null;
  panelRight?.setPanel(penPanel);

  const canvasAreaEl = document.querySelector('.canvas-area') as HTMLElement | null;
  if (canvasAreaEl) {
    setupDragAndDrop(canvasAreaEl, (files) => void handleIncomingFiles(files));
  }

  globalThis.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    const isTyping = !!target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
        target.isContentEditable);
    if (isTyping || document.querySelector('dialog[open]')) return;

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      doc.history.undo();
      drawingCanvas.render();
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      doc.history.redo();
      drawingCanvas.render();
    } else if (!mod && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveCurrentDocument();
    }
  });

  const initialDoc = createDocument(t('document.untitled'));
  registerDocument(initialDoc);
  switchToDocument(initialDoc.id);

  document.addEventListener('sosyoku-open-request', () => void openFileDialog());
  document.addEventListener('sosyoku-export-request', () => void exportCurrentDocument());
  document.addEventListener('sosyoku-about-request', () => void aboutModal.open());
  document.addEventListener('sosyoku-document-settings-request', () => void openDocumentSettings(settingsModal));
  document.addEventListener('sosyoku-settings-request', () => void openAppSettings(settingsModal));
  document.addEventListener('sosyoku-install-request', () => void promptPwaInstall());

  setupFileHandling((files) => void handleIncomingFiles(files));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // app.ts はfetch+Blob URL経由で非同期に読み込まれるため、実行時点で既に window の load
  // イベントが発火済みのことが多い。'load' を待たず、この時点で直接登録する。
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

globalThis.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e as BeforeInstallPromptEvent;
  document.dispatchEvent(new CustomEvent('sosyoku-installable-changed', { detail: { installable: true } }));
});

globalThis.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.dispatchEvent(new CustomEvent('sosyoku-installable-changed', { detail: { installable: false } }));
});

async function promptPwaInstall() {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.dispatchEvent(new CustomEvent('sosyoku-installable-changed', { detail: { installable: false } }));
}

async function openDocumentSettings(settingsModal: SettingsModalElement) {
  const categories = buildDocumentSettingsCategories(doc);
  const result = await settingsModal.open(t('docsettings.title'), categories);
  if (result === 'save') {
    for (const category of categories) category.apply();
    drawingCanvas.setDocument(doc);
    drawingCanvas.setBackgroundColor(doc.backgroundColor);
    drawingCanvas.render();
    statusBar?.setSize(doc.width, doc.height);
    refreshTabs();
  }
}

async function openAppSettings(settingsModal: SettingsModalElement) {
  const categories = buildAppSettingsCategories();
  const result = await settingsModal.open(t('appsettings.title'), categories);
  if (result === 'save') {
    for (const category of categories) category.apply();
  }
}

/** 新しく開いた/作成したドキュメントをタブ管理下に登録する(履歴・変更イベントの購読は1回だけ) */
function registerDocument(newDoc: SosyokuDocument) {
  openDocuments.set(newDoc.id, newDoc);
  newDoc.history.addEventListener('changed', () => {
    if (doc === newDoc) toolBar?.setUndoRedoEnabled(newDoc.history.canUndo, newDoc.history.canRedo);
    refreshTabs();
  });
  newDoc.addEventListener('layers-changed', () => refreshTabs());
  newDoc.addEventListener('document-changed', () => refreshTabs());
}

function refreshTabs() {
  const tabs: TabInfo[] = [...openDocuments.values()].map((d) => ({ id: d.id, title: d.title, dirty: d.dirty }));
  canvasTabs?.setTabs(tabs, doc?.id ?? null);
}

function switchToDocument(id: string) {
  const target = openDocuments.get(id);
  if (!target) return;
  doc = target;
  drawingCanvas.setDocument(doc);
  drawingCanvas.setBackgroundColor(doc.backgroundColor);
  layerPanel.setDocument(doc);
  statusBar?.setSize(doc.width, doc.height);
  gridVisible = false;
  drawingCanvas.setGridVisible(false);
  toolBar?.setGridActive(false);
  toolBar?.setUndoRedoEnabled(doc.history.canUndo, doc.history.canRedo);
  drawingCanvas.setTool('pen');
  toolBar?.setActiveTool('pen');
  refreshTabs();
}

/** 新規ドキュメントを作成する。1枚目のレイヤー色にはパレットの2番目の色を使う(背景色は1番目の色、不透明) */
function createDocument(title: string): SosyokuDocument {
  const palette = settingsStore.get().palette;
  const [bgR, bgG, bgB] = hexToRgb(palette[0] ?? '#ffffff');
  const doc = new SosyokuDocument({
    title,
    width: 1000,
    height: 1000,
    backgroundColor: rgbaToHex8(bgR, bgG, bgB, 1),
  });
  const layer = new NormalLayer({
    name: t('layer.defaultName', { n: 1 }),
    width: doc.width,
    height: doc.height,
    color: palette[1] ?? '#141820',
  });
  doc.addLayer(layer, 0);
  return doc;
}

function createNewDocument() {
  newDocCounter += 1;
  const title = openDocuments.size === 0 ? t('document.untitled') : `${t('document.untitled')}${newDocCounter}`;
  const newDoc = createDocument(title);
  registerDocument(newDoc);
  switchToDocument(newDoc.id);
}

function closeTab(id: string) {
  if (!openDocuments.has(id)) return;
  openDocuments.delete(id);
  if (openDocuments.size === 0) {
    createNewDocument();
    return;
  }
  if (doc.id === id) {
    const next = [...openDocuments.values()][0];
    switchToDocument(next.id);
  } else {
    refreshTabs();
  }
}

async function handleIncomingFiles(files: File[]) {
  const ssxFile = files.find(isSsxFile);
  if (ssxFile) {
    const opened = await loadSsx(ssxFile);
    registerDocument(opened);
    switchToDocument(opened.id);
    return;
  }
  for (const file of files) {
    if (!isImageFile(file)) continue;
    const layer = await importImageAsReferenceLayer(file, doc);
    doc.addLayer(layer, 0);
    drawingCanvas.render();
  }
}

async function openFileDialog() {
  const files = await pickFiles('.ssx,image/png,image/jpeg', true);
  if (files.length) await handleIncomingFiles(files);
}

async function saveCurrentDocument() {
  const blob = await saveSsx(doc);
  downloadBlob(blob, `${doc.title || t('document.untitled')}.ssx`);
  doc.dirty = false;
  refreshTabs();
}

async function exportCurrentDocument() {
  const blob = await exportFlattenedPng(doc);
  downloadBlob(blob, `${doc.title || t('document.untitled')}.png`);
}
