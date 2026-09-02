#!/bin/zsh
# 더블클릭하면 로컬 게시 서버를 띄우고 입력 앱을 브라우저로 연다.
# 창을 닫거나 Control-C 를 누르면 꺼진다.

cd "$(dirname "$0")" || exit 1

# node 가 PATH 에 없을 수 있어 흔한 설치 위치를 앞에 붙인다.
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "node 를 찾지 못했습니다. Node.js 를 설치하거나 PATH 를 확인해주세요."
  read "?엔터를 누르면 닫힙니다."
  exit 1
fi

OPEN=1 exec node serve.js
