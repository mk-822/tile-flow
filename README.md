# Tile Flow

[ブラウザで遊ぶ](https://mk-822.github.io/tile-flow/)

5レーン×20段のベルトを転がるタイルを受け止め、5×5のプールで同じ色をそろえる3Dパズルです。タイルを受ける、置く、消す操作に光と音が反応し、消去時には破片と屈折する波紋が広がります。キーボード、タッチ、ゲームパッドで遊べます。

## Androidにインストール

Android版Chromeで[公開ページ](https://mk-822.github.io/tile-flow/)を開き、右上の「⋮」から「インストールしてショートカットを作成」→「インストール」を選びます。Chromeのバージョンによっては「ホーム画面に追加」または「アプリをインストール」と表示されます。ホーム画面のTile Flowアイコンから起動すると、アドレスバーのない画面で遊べます。

## 遊び方

- パドルでタイルを受け止め、プールに落とします。パドルに載せられるのは5枚までです。
- 同じ色を縦・横・斜めに3枚以上そろえると **FLOW** が成立します。上にあるタイルが落ちて再びそろうと連鎖します。
- 消去と連鎖の演出中はベルトが止まります。その間もパドルを動かしてタイルを置き、次の連鎖を狙えます。光っている縦列に同色を足すと4枚・5枚まとめて消せます。
- ウェーブごとの目標を達成すると次に進みます。ドロップ上限に達するか、消去できずにプールがすべて埋まるとゲーム終了です。
- 開始前は左右で初級・中級・上級、上下で WAVE 1・6・11 を選べます。WAVE 5・10・15…のクリア後は、左右で次のWAVE、またはそこから5・10ウェーブ先を選べます。
- 選択に応じてドロップ枠が3・4・5枚に回復します。5・10ウェーブをスキップして選んだWAVEをクリアすると、100,000点・200,000点のボーナスが入ります。WAVE 6・11から始めた場合も同じです。

難易度によってタイルの速さ、出現間隔、色数が変わります。各ウェーブはベルト奥の1枚から始まります。上部のスライダーでBGMと効果音の音量を調整できます。難易度別のベストスコア、選択中の難易度、音量、ミュート設定は、遊んだブラウザに保存されます。

### キーボード

| キー | 操作 |
| --- | --- |
| Enter | 開始・再開・次のウェーブ |
| ↑ / ↓ / ← / → | 開始WAVEと難易度を選択。スキップ選択では左右で移動 |
| ← / → | パドルを移動。長押しでリピート、移動中の入力は先行予約 |
| Space | 一番上のタイルをパドルと同じ列に落とす |
| ↑ | 一番上のタイルをベルトへ投げ返す |
| ↓ | 押している間、ベルトの進みとタイルの出現を早送り |
| Esc | 一時停止・再開 |
| M | サウンド切り替え |

### タッチ

- 左右ボタンを長押しするか、左右にスワイプして指を止めると、キーボードと同じ間隔でパドルがリピート移動します。パドルラインをタップすると指定列まで移動します。
- プールをタップするとタイルを落とし、ベルトをタップすると投げ返します。
- 盤面まわりの余白を長押しすると早送りします。小さい画面では盤面の下のボタンも使えます。
- スマホの横画面では、プレイ中に盤面左下の丸い「置く」「返す」ボタンも使えます。

### ゲームパッド

ブラウザが標準配置として認識するコントローラーと、Android版Chromeが標準と同じ入力位置で扱う汎用コントローラーに対応します。ゲームパッドで始めて音が鳴らない場合は、画面を一度クリックまたはタップしてください。

| ボタン | 操作 |
| --- | --- |
| 十字キーの ← / →、左スティックの左右 | パドル移動・難易度選択・ウェーブスキップ選択 |
| 十字キーの ↑ / ↓ | 開始WAVEの選択 |
| A / ×（下側のボタン） | 開始・再開・次のウェーブ・タイルを落とす |
| Y / △（上側のボタン）、十字キーの ↑ | タイルを投げ返す |
| RT / R2、十字キーの ↓ | 押している間、ベルトを早送り |
| Start / Options | 一時停止・再開。開始画面では決定 |

## ローカルで起動

Node.js 22.12以降と、WebGL 2に対応したブラウザが必要です。

```sh
npm ci
npm run dev
```

ターミナルに表示されるローカルURLを開きます。配信用ファイルは `npm run build` で `dist/` に出力され、`npm run preview` で確認できます。`main` への更新は GitHub Actions でビルドされ、GitHub Pages に反映されます。

## BGM

ゲーム開始時と、WAVE 5・10・15…をクリアして次のウェーブに進むときに、全15曲からシャッフルした順番でBGMが切り替わります。

楽曲はすべて [PeriTune / むつき醒](https://peritune.com/) の作品です。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) に基づき、公式配布のMP3を使用しています。

- [Firmament2_Calm](https://peritune.com/blog/2018/05/16/firmament2/)
- [Cyber_Noir](https://peritune.com/blog/2021/08/31/cyber_noir/)
- [Machinery](https://peritune.com/blog/2016/08/05/machinery/)
- [Polar_Lights](https://peritune.com/blog/2021/12/01/polar_lights/)
- [Cyberpunk_City](https://peritune.com/blog/2020/05/22/cyberpunk_city/)
- [Soaring](https://peritune.com/blog/2021/01/01/soaring/)
- [Unknown_Cities](https://peritune.com/blog/2022/06/05/unknown_cities/)
- [Irregular](https://peritune.com/blog/2020/02/28/irregular/)
- [Dream_and_Reality](https://peritune.com/blog/2022/03/16/dream_and_reality/)（インストループ版）
- [Awayuki](https://peritune.com/blog/2023/01/07/awayuki/)
- [SnowChill](https://peritune.com/blog/2022/12/08/snowchill/)
- [Glimmering_Woods](https://peritune.com/blog/2022/05/25/glimmering_woods/)
- [Cerulean_Relics](https://peritune.com/blog/2023/07/21/cerulean_relics/)
- [Quiet_Ocean](https://peritune.com/blog/2023/08/09/quiet_ocean/)
- [Limpid_Water](https://peritune.com/blog/2022/04/12/limpid_water/)
