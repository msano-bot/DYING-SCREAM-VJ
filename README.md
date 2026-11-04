# DYING SCREAM v17 — マイクの分離診断と取得経路の整理

## Macで起動

ZIPをすべて展開し、`Start DYING SCREAM.command` を開きます。Python 3.8以上が必要です。なければ起動時に案内します。Safariで次を直接開いてください。

- 本体：`http://127.0.0.1:8765/`
- 独立マイク診断：`http://127.0.0.1:8765/mic_test.html`

`localhost:8000`も一般に安全なコンテキストですが、今回の起動スクリプトは権限の対象URLを変えないため固定の127.0.0.1:8765を使います。サーバーは127.0.0.1だけにバインドします。ターミナルを開いたまま使用し、Control+Cで終了します。Python導入後は外部ネットワーク不要です。

## 必ず独立診断から確認

1. `mic_test.html`でONを押し、声を出します。
2. `gum=resolved`、Contextがrunning、Trackがlive、RMSが声に反応するか確認します。
3. OFFで入力が止まり、再ONで取得できるか確認します。
4. 「診断JSONを保存」で結果を保存します。URLと機器情報を含むので共有前に内容を確認してください。
5. 同じoriginの本体へ戻り、マイクONまたはSpaceで比較します。入力欄ではSpaceを無効にしています。

`gum_called`だけで止まるならブラウザの許可要求が未完了です。`gum_rejected`はgetUserMediaによる拒否で、生のエラーを確認します。`gum_resolved`後にresumeで失敗するなら入力取得と音声処理開始は別問題です。両方成功してRMSが0なら、Trackのmuted、OS入力機器、物理的なミュートなどを確認します。0だけで機器故障とは断定しません。

Safariのサイト権限とmacOSの設定値はJavaScriptから直接読めません。NotAllowedErrorだけでどちらが原因か断定しません。Safariの「設定→Webサイト→マイク」で使用中の127.0.0.1を確認し、macOSの「システム設定→プライバシーとセキュリティ→マイク」でSafariが表示される場合はその設定も確認してください。

## 今回の本体変更

- 独立診断と同じ `getUserMedia({audio:true})` を音声グラフ構築より先に呼びます。
- マイクを使うだけでは音楽ファイル用MediaElementSourceを作りません。音楽再生時に一度だけ接続します。
- Policyの観測だけで取得のエラーを代用せず、ブラウザの実際の入力取得結果を記録します。
- マイク音を出力しない接続、ON/OFFとSpace、映像エンジン、全画面・CSS代替は維持しています。

これはSafari実機の拒否原因が特定済みという意味ではありません。独立診断の実機結果がまだ必要です。

## 配布について

ワークスペースのプレビューリンクはダウンロード成功ではありません。アプリ内のHTML保存ボタンも、チャットからMacへ最初に転送する方法の代わりにはなりません。この環境には添付登録専用ツールがなく、別のファイル出力場所への書き込みも拒否されています。

この配布ブランチのZIPは次のGitHubリンクから取得できます。ChatGPTのファイルプレビューではなく、Safariのアドレスバーへ貼り付けて開いてください。非公開リポジトリの場合は、アクセス権のあるGitHubアカウントでのログインが必要です。

https://github.com/msano-bot/DYING-SCREAM-VJ/raw/refs/heads/delivery/v17-mic-isolation/releases/DYING_SCREAM_v17_MAC_LOCALHOST.zip

直接取得できない場合はGitHubの配布ブランチを開き、「Code → Download ZIP」を利用してください。

https://github.com/msano-bot/DYING-SCREAM-VJ/tree/delivery/v17-mic-isolation

## 未検証

Safari本体、macOS、実マイク・物理スピーカー、MacでのFinder起動は未検証です。Chromiumの仮想入力による検査と区別します。最小診断がMacで失敗する場合、本体を再度改変する前に診断JSONを確認してください。
