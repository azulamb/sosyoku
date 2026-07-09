export const ja = {
  'menu.open': 'ファイルを開く',
  'menu.save': 'ファイルを保存する',
  'menu.export': 'エクスポート',
  'menu.documentSettings': 'ドキュメントの設定',
  'menu.settings': '設定',
  'menu.about': 'Sosyokuについて',

  'tool.undo': '元に戻す',
  'tool.redo': 'やり直す',
  'tool.save': '保存',
  'tool.grid': 'グリッド表示切替',
  'tool.pen': 'ペン',
  'tool.fill': '塗りつぶし',
  'tool.eraser': '消しゴム',
  'tool.select': '範囲選択',
  'tool.move': '移動',

  'panel.layers': 'レイヤー',
  'panel.layers.add': 'レイヤーを追加',
  'panel.layers.remove': 'レイヤーを削除',
  'panel.pens': 'ペン',
  'panel.pens.add': 'ペンを追加',
  'panel.pens.export': 'エクスポート',
  'panel.pens.import': 'インポート',
  'panel.pens.io': 'エクスポート・インポート',

  'statusbar.pressure': '筆圧',
  'statusbar.zoom.reset': 'リセット',
  'statusbar.zoom.hint': 'クリックで変更',

  'pressurecurve.hint':
    '横軸: 入力される筆圧の強さ(左が弱い、右が強い) / 縦軸: 実際に反映される強さ(下が弱い、上が強い)。グラフをタップしてポイントを追加、ドラッグで移動、グラフの外にドラッグすると削除できます。',
  'pressurecurve.reset': 'リセット',

  'dialog.cancel': 'キャンセル',
  'dialog.save': '保存',
  'dialog.change': '変更',
  'dialog.close': '閉じる',

  'colorpicker.title': '色を選択',
  'rename.layer.title': 'レイヤー名を変更',
  'rename.pen.title': 'ペン名を変更',
  'rename.document.title': 'ドキュメント名を変更',

  'docsettings.title': 'ドキュメントの設定',
  'docsettings.category.document': 'ドキュメント',
  'docsettings.category.grid': 'グリッド',
  'docsettings.title.label': 'タイトル',
  'docsettings.width.label': '幅(px、最大{max})',
  'docsettings.height.label': '高さ(px、最大{max})',
  'docsettings.grid.add': '+ グリッドを追加',
  'docsettings.grid.remove': '削除',

  'appsettings.title': '設定',
  'appsettings.category.general': '一般',
  'appsettings.category.palette': 'パレット',
  'appsettings.category.pressure': '筆圧',
  'appsettings.language.label': '言語',
  'appsettings.language.auto': '自動(ブラウザに合わせる)',
  'appsettings.language.ja': '日本語',
  'appsettings.language.en': 'English',
  'appsettings.theme.label': 'テーマ',
  'appsettings.theme.auto': '自動(OSに合わせる)',
  'appsettings.theme.light': 'ライト',
  'appsettings.theme.dark': 'ダーク',
  'appsettings.palette.add': '+ パレットに追加',
  'appsettings.export': '設定をエクスポート',
  'appsettings.import': '設定をインポート',

  'about.appName': 'Sosyoku',
  'about.tagline': '1レイヤー1色のシンプルなお絵かきツール',

  'pen.export.title': 'エクスポートするペンを選択',
  'pen.export.action': 'エクスポート',
  'pen.import.title': 'インポートするペンを選択',
  'pen.import.action': 'インポート',

  'layer.pen.placeholder': 'ペンパネル(準備中)',

  'document.untitled': '無題',
  'layer.defaultName': 'レイヤー {n}',
  'pen.defaultName': 'ペン {n}',

  'tab.new': '新規ドキュメント',
  'layer.visibility': '表示/非表示',
  'layer.lock': 'ロック',
  'pen.shapeToggle': '形状を切り替え',
  'pen.size': 'サイズ(px)',
  'pen.delete': '削除',
};

export type TranslationKey = keyof typeof ja;
