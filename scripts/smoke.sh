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
  APP="$(cd "$(dirname "$BIN")/../.." && pwd)"
  STOCK="$PWD/node_modules/electron/dist/Electron.app"
  EXE="$(basename "$BIN")"
  W=/tmp/fairy-bisect; rm -rf "$W"; mkdir -p "$W"
  resign() { codesign --force --deep --sign - "$1" >/dev/null 2>&1 || echo "(서명 실패: $1)"; }
  echo "── 진단 A: 원본 Electron.app 안에 앱 코드만 넣어 실행"
  cp -R "$STOCK" "$W/A.app"; rm -f "$W/A.app/Contents/Resources/default_app.asar"
  mkdir -p "$W/A.app/Contents/Resources/app" && cp -R src assets package.json "$W/A.app/Contents/Resources/app/"
  resign "$W/A.app"
  run_for A-stock-plus-app "$W/A.app/Contents/MacOS/Electron" || true
  echo "── 진단 B: A + 패키징 앱의 Info.plist (실행 파일 이름만 Electron으로)"
  cp -R "$W/A.app" "$W/B.app"; cp "$APP/Contents/Info.plist" "$W/B.app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Electron" "$W/B.app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Delete :ElectronAsarIntegrity" "$W/B.app/Contents/Info.plist" 2>/dev/null
  resign "$W/B.app"
  run_for B-plus-plist "$W/B.app/Contents/MacOS/Electron" || true
  echo "── 진단 C: 패키징 앱 + 원본 Electron Framework"
  cp -R "$APP" "$W/C.app"; rm -rf "$W/C.app/Contents/Frameworks/Electron Framework.framework"
  cp -R "$STOCK/Contents/Frameworks/Electron Framework.framework" "$W/C.app/Contents/Frameworks/"
  resign "$W/C.app"
  run_for C-stock-framework "$W/C.app/Contents/MacOS/$EXE" || true
  echo "── 진단 D: 패키징 앱 + 원본 실행 파일"
  cp -R "$APP" "$W/D.app"; cp "$STOCK/Contents/MacOS/Electron" "$W/D.app/Contents/MacOS/$EXE"
  resign "$W/D.app"
  run_for D-stock-exe "$W/D.app/Contents/MacOS/$EXE" || true
  echo "── 진단: 바이너리 비교 (같으면 해시 동일)"
  shasum "$STOCK/Contents/MacOS/Electron" "$BIN"
  shasum "$STOCK/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework" "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
  echo "── 진단: Info.plist 차이"
  diff <(plutil -convert xml1 -o - "$STOCK/Contents/Info.plist") <(plutil -convert xml1 -o - "$APP/Contents/Info.plist") | head -80
  echo "── 진단: Resources 목록"
  ls -la "$APP/Contents/Resources" | head -30
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
