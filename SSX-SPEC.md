# .ssx ファイルフォーマット仕様

Sosyoku のドキュメントファイル形式。`.ssx` は **ZIPアーカイブ**
で、中身は各レイヤーのPNG画像とドキュメント情報をまとめた`document.json`で構成される。

## 概要

```
example.ssx (ZIP)
├── document.json          # ドキュメント全体のメタ情報・レイヤー一覧
└── layers/
    ├── layer-xxxxx.png    # レイヤーごとのPNG画像(1レイヤー1ファイル)
    ├── layer-yyyyy.png
    └── ...
```

- 保存(書き出し)は **無圧縮ZIP(STORED, compression method = 0)**
  で自前実装([src/core/zip-writer.ts](src/core/zip-writer.ts))。ファイル名はUTF-8フラグ(汎用目的ビット
  `0x0800`)を立てて格納する。
- 読み込みは [`@azulamb/zipper`](https://jsr.io/@azulamb/zipper) の `unzip()`
  を使用する。無圧縮・DEFLATE圧縮のどちらのZIPも読み込み可能(Sosyoku自身が書き出すのは常に無圧縮だが、他ツールが作った圧縮ZIPでも読み込める)。
- PNGのエンコード/デコードはブラウザネイティブAPI(`OffscreenCanvas.convertToBlob()` /
  `createImageBitmap()`)を利用し、独自実装は行わない。

## document.json

```jsonc
{
  "formatVersion": 1,
  "title": "無題",
  "width": 1000,
  "height": 1000,
  "grids": [
    { "id": "grid-xxxxx", "x": 50, "y": 50, "color": "#7f8c99" }
  ],
  "layers": [
    // layers[0] が最前面(最も上に描画される)。配列の末尾ほど背面。
    {
      "id": "layer-xxxxx",
      "type": "normal",
      "name": "レイヤー 1",
      "visible": true,
      "locked": false,
      "opacity": 1,
      "file": "layers/layer-xxxxx.png",
      "color": "#141820"
    },
    {
      "id": "layer-yyyyy",
      "type": "reference",
      "name": "reference",
      "visible": true,
      "locked": false,
      "opacity": 1,
      "file": "layers/layer-yyyyy.png",
      "x": 0,
      "y": 0,
      "width": 400,
      "height": 300
    }
  ]
}
```

### トップレベルフィールド

| フィールド         | 型            | 説明                                                            |
| ------------------ | ------------- | --------------------------------------------------------------- |
| `formatVersion`    | number        | フォーマットのバージョン番号。現在は `1`。                      |
| `title`            | string        | ドキュメントのタイトル。                                        |
| `width` / `height` | number        | ドキュメントのピクセルサイズ(最大 4096)。                       |
| `grids`            | GridSetting[] | 表示用グリッドの一覧(0個以上)。エクスポートPNGには含まれない。  |
| `layers`           | LayerJSON[]   | レイヤーの一覧。**配列の先頭(index 0)が最前面**、末尾が最背面。 |

### GridSetting

| フィールド | 型     | 説明                                            |
| ---------- | ------ | ----------------------------------------------- |
| `id`       | string | グリッドの一意なID。                            |
| `x` / `y`  | number | グリッド線の間隔(px)。                          |
| `color`    | string | グリッド線の色(CSSカラー文字列、例 `#7f8c99`)。 |

### レイヤー共通フィールド(LayerJSONBase)

| フィールド | 型                          | 説明                                                          |
| ---------- | --------------------------- | ------------------------------------------------------------- |
| `id`       | string                      | レイヤーの一意なID。対応するPNGファイル名にも使われる。       |
| `type`     | `"normal"` \| `"reference"` | レイヤー種別。                                                |
| `name`     | string                      | レイヤー名。                                                  |
| `visible`  | boolean                     | 表示/非表示。                                                 |
| `locked`   | boolean                     | ロック状態(書き込み不可)。                                    |
| `opacity`  | number                      | 透過度(0〜1)。                                                |
| `file`     | string                      | ZIP内のPNGファイルへの相対パス(例 `layers/layer-xxxxx.png`)。 |

### 通常レイヤー(`type: "normal"`)

`color` フィールド(string,
CSSカラー)を追加で持つ。1レイヤー1色の原則により、そのレイヤーに描画されている全ての不透明ピクセルはこの色で統一される。

**PNGの内容**: ドキュメントサイズと同じ寸法のRGBA画像。塗られている部分は `RGB = color`・`A = 255`、未塗り部分は `A = 0`
の**二値アルファ**(アンチエイリアスなしのため中間値は存在しない)。色の変更は、このアルファ形状を保ったまま `RGB`
を一括で塗り替えることで実現される(`source-in` 合成)。

### 参照レイヤー(`type: "reference"`)

`x` / `y` / `width` / `height`(いずれも
number)を追加で持つ。取り込んだ画像をドキュメント座標系のどこに・どのサイズで配置するかを表す。書き込み不可(ロック相当)で、移動・拡大縮小(アスペクト比固定)のみ可能。

**PNGの内容**: 配置後の合成画像ではなく、**取り込み時の自然解像度のままの元画像**(劣化防止のため)。読み込み時にこのPNGを
`width` × `height` へ再スケールし、`x, y` の位置に描画してドキュメントへ反映する。

## レイヤーの重なり順

`layers` 配列の **index 0
が最前面**。合成(表示・PNGエクスポート・レイヤーPNG書き出し)は配列末尾から先頭へ向かって描画する(背面から前面の順)。

## 保存されないもの

- 現在のツール選択・ブラシ設定・ズーム倍率・選択範囲などのUI状態
- Undo/Redo履歴
- パレット・ペンプリセットなどのアプリ全体設定(これらは `.ssx` ではなく LocalStorage
  に保存される。詳細は設定のインポート/エクスポートJSON機能を参照)

## 拡張性

`formatVersion` を将来インクリメントすることで後方非互換な変更を行える想定。現行の読み込み処理(`loadSsx()`,
[src/core/ssx.ts](src/core/ssx.ts))は `formatVersion: 1` を前提としている。
