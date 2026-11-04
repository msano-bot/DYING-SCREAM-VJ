# Mac用の短い手順

1. 実際に保存できたZIPをFinderで展開する。チャットの「アーカイブのプレビュー」は保存ではありません。
2. `Start DYING SCREAM.command` を開く。Python 3.8以上が必要です。未導入なら https://www.python.org/downloads/macos/ のVentura対応版を導入する。
3. Safariで `http://127.0.0.1:8765/mic_test.html` を直接開き、ON→声を出す→OFF→再ONを試す。
4. JSONを保存し、`gum_called/resolved/rejected`、resume、Track、RMSを確認する。
5. 同じSafariで `http://127.0.0.1:8765/` を開く。Spaceはマイク、Escは全画面解除。
6. 終了はターミナルでControl+C。

起動できない場合は、ターミナルで展開フォルダへ移動して `bash "Start DYING SCREAM.command"` を実行するとエラーを読めます。

サイト設定で許可していても、file://・iframe・別origin・macOS権限の制約は残る場合があります。JSでOSの許可を強制しません。Safari実機の動作はこのLinux環境では未検証です。
