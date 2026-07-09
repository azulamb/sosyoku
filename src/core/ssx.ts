/** .ssx ファイル(無圧縮ZIP: レイヤーPNG群 + document.json)の書き出し/読み込み */
import { unzip } from '@azulamb/zipper';
import { createZip } from './zip-writer.ts';
import { DEFAULT_BACKGROUND_COLOR, type GridSetting, SosyokuDocument } from './document.ts';
import { NormalLayer, ReferenceLayer } from './layer.ts';
import type { Layer, LayerJSON } from './layer.ts';

export const SSX_FORMAT_VERSION = 1;

interface SsxManifest {
  formatVersion: number;
  title: string;
  width: number;
  height: number;
  backgroundColor?: string;
  grids: GridSetting[];
  layers: LayerJSON[];
}

export async function saveSsx(doc: SosyokuDocument): Promise<Blob> {
  const layers: LayerJSON[] = [];
  const entries: { path: string; data: Uint8Array<ArrayBuffer> }[] = [];

  for (const layer of doc.layers) {
    const file = `layers/${layer.id}.png`;
    entries.push({ path: file, data: await layer.toPngBytes() });
    layers.push(layer.toJSON(file));
  }

  const manifest: SsxManifest = {
    formatVersion: SSX_FORMAT_VERSION,
    title: doc.title,
    width: doc.width,
    height: doc.height,
    backgroundColor: doc.backgroundColor,
    grids: doc.grids,
    layers,
  };
  entries.push({ path: 'document.json', data: new TextEncoder().encode(JSON.stringify(manifest)) });

  return createZip(entries);
}

export async function loadSsx(file: File | Blob): Promise<SosyokuDocument> {
  const entries = await unzip(file);
  const manifestEntry = entries.find((e) => e.path === 'document.json' || e.path.endsWith('/document.json'));
  if (!manifestEntry) throw new Error('document.json が見つかりません(.ssxファイルとして不正です)');
  const manifest: SsxManifest = JSON.parse(await manifestEntry.file.text());

  const doc = new SosyokuDocument({
    title: manifest.title,
    width: manifest.width,
    height: manifest.height,
    backgroundColor: manifest.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
  });
  doc.grids = manifest.grids ?? [];

  const layers: Layer[] = [];
  for (const layerJson of manifest.layers) {
    const entry = entries.find((e) => e.path === layerJson.file);
    if (!entry) continue;
    const bitmap = await createImageBitmap(entry.file);

    if (layerJson.type === 'normal') {
      const layer = new NormalLayer({
        id: layerJson.id,
        name: layerJson.name,
        width: manifest.width,
        height: manifest.height,
        color: layerJson.color,
      });
      const ctx = layer.ctx;
      ctx.clearRect(0, 0, manifest.width, manifest.height);
      ctx.drawImage(bitmap, 0, 0);
      layer.visible = layerJson.visible;
      layer.locked = layerJson.locked;
      layer.opacity = layerJson.opacity;
      layers.push(layer);
    } else {
      const layer = new ReferenceLayer({
        id: layerJson.id,
        name: layerJson.name,
        image: bitmap,
        docWidth: manifest.width,
        docHeight: manifest.height,
        x: layerJson.x,
        y: layerJson.y,
        width: layerJson.width,
        height: layerJson.height,
      });
      layer.visible = layerJson.visible;
      layer.locked = layerJson.locked;
      layer.opacity = layerJson.opacity;
      layers.push(layer);
    }
  }

  for (let i = layers.length - 1; i >= 0; i--) doc.addLayer(layers[i], 0);
  doc.activeLayerId = layers[0]?.id ?? null;
  doc.dirty = false;
  return doc;
}

/** png/jpg等の画像ファイルを、書き込み不可の参照レイヤーとして取り込む */
export async function importImageAsReferenceLayer(file: File, doc: SosyokuDocument): Promise<ReferenceLayer> {
  const bitmap = await createImageBitmap(file);
  const layer = new ReferenceLayer({
    name: file.name.replace(/\.[^.]+$/, ''),
    image: bitmap,
    docWidth: doc.width,
    docHeight: doc.height,
    x: 0,
    y: 0,
    width: bitmap.width,
    height: bitmap.height,
  });
  return layer;
}

export function isSsxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.ssx');
}

export function isImageFile(file: File): boolean {
  return /\.(png|jpe?g)$/i.test(file.name) || file.type === 'image/png' || file.type === 'image/jpeg';
}
