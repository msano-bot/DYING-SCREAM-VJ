#!/bin/bash
# Keep a stable loopback URL so Safari's per-site permissions remain meaningful.
cd -- "$(dirname -- "$0")" || exit 1
VJ_PYTHON=""
for VJ_CANDIDATE in /usr/local/bin/python3 /opt/homebrew/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3 python3; do
  VJ_RESOLVED="$(command -v "$VJ_CANDIDATE" 2>/dev/null)" || continue
  # macOS may expose an Xcode stub even though a usable Python is not installed.
  if [ "$VJ_RESOLVED" = /usr/bin/python3 ] && [ "$(uname -s)" = Darwin ] && ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
    continue
  fi
  if "$VJ_RESOLVED" -c 'import sys,http.server;sys.exit(0 if sys.version_info >= (3,8) else 1)' >/dev/null 2>&1; then
    VJ_PYTHON="$VJ_RESOLVED"
    break
  fi
done
if [ -z "$VJ_PYTHON" ]; then
  echo 'Python 3.8以上が必要です。macOS Venturaには利用可能なPythonがない場合があります。'
  echo 'https://www.python.org/downloads/macos/ のPython 3をインストールし、もう一度このファイルを開いてください。'
  read -r -p 'Enterで閉じる: ' VJ_DISMISS
  exit 1
fi
"$VJ_PYTHON" launch_vj.py "$@"
VJ_EXIT=$?
if [ "$VJ_EXIT" -ne 0 ]; then
  read -r -p '起動できませんでした。上の表示を確認してください。Enterで閉じる: ' VJ_DISMISS
fi
exit "$VJ_EXIT"
