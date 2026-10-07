#!/bin/bash
# 빌드한 앱을 10초간 실행해 바로 꺼지지 않는지 확인. 실패하면 원인 파악용 정보를 출력.
# 사용: scripts/smoke.sh <실행 파일 경로>
set -u
BIN="$1"
run_for() { # $1=라벨, 나머지=명령. 10초 버티면 0
  local label="$1"; shift
  echo "── $label: $*"
  "$@" > "smoke-$label.log" 2>&1 &
  local pid=$!
  sleep 10
  if kill -0 "$pid" 2>/dev/null; then
    echo "✅ $label: 10초 동안 정상 실행"; kill "$pid" 2>/dev/null; return 0
  fi
  wait "$pid"; local code=$?
  echo "❌ $label: 바로 종료됨 (종료 코드 $code)"
  tail -n 40 "smoke-$label.log"
  return 1
}

if run_for packaged "$BIN" --enable-logging=stderr; then exit 0; fi

if [ "$(uname)" = "Darwin" ]; then
  echo "── 진단: 패키징 전 앱(npx electron .)"
  run_for unpacked npx electron . --enable-logging=stderr || true
  echo "── 진단: 코드 서명"
  codesign -dvvv "$BIN" 2>&1 | head -20
  echo "── 진단: 충돌 보고서(멈춘 스레드)"
  sleep 3
  R=$(ls -t ~/Library/Logs/DiagnosticReports/*.ips 2>/dev/null | head -1)
  if [ -n "$R" ]; then
    python3 - "$R" <<'PY'
import json, sys
raw = open(sys.argv[1]).read()
body = json.loads(raw[raw.index('\n') + 1:])
print('exception:', body.get('exception'), body.get('termination', {}).get('indicator'))
imgs = body.get('usedImages', [])
th = next(t for t in body['threads'] if t.get('triggered'))
for f in th['frames'][:25]:
    img = imgs[f['imageIndex']].get('name', '?') if 'imageIndex' in f else '?'
    print(f"  {img:40s} {f.get('symbol', '')}+{f.get('symbolLocation', '')}")
PY
  else
    echo "(충돌 보고서 없음)"
  fi
fi
exit 1
