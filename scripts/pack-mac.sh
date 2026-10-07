#!/bin/bash
# Mac 설치 파일(dmg)을 electron-builder 없이 만든다.
# electron-builder로 포장한 Mac 앱은 시작 직후 SIGTRAP으로 꺼져서,
# 정상 실행이 확인된 원본 Electron.app에 앱 코드만 넣는 방식으로 포장한다.
# 사용: scripts/pack-mac.sh   (macOS에서, npm ci 후. 실행하는 Mac의 칩 종류로 만들어짐)
set -euo pipefail
NAME="퇴근 요정"
EXE="ToegeunYojeong" # 'Electron'이 아니어야 app.isPackaged가 true
VER=$(node -p "require('./package.json').version")
ARCH=$(node -p "process.arch")
OUT=dist/mac-$ARCH
APP="$OUT/$NAME.app"

rm -rf "$OUT" && mkdir -p "$OUT"
cp -R node_modules/electron/dist/Electron.app "$APP"
RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app" && cp -R src assets package.json "$RES/app/"

# 아이콘: build/icon.png(1024px) → icns. 원본 Info.plist가 가리키는 electron.icns를 덮어씀
ICONSET="$(mktemp -d)/icon.iconset" && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) build/icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RES/electron.icns"

# 실행 파일 이름만 바꾼다. CFBundleName은 Helper 앱을 찾는 데 쓰여서 그대로 둔다
mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/$EXE"
PLIST="$APP/Contents/Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST"; }
pb "Set :CFBundleExecutable $EXE"
pb "Set :CFBundleIdentifier com.sooomeng.hxh-worktime"
pb "Set :CFBundleShortVersionString $VER"
pb "Set :CFBundleVersion $VER"
pb "Delete :CFBundleDisplayName" 2>/dev/null || true
pb "Add :CFBundleDisplayName string $NAME"
pb "Delete :LSUIElement" 2>/dev/null || true
pb "Add :LSUIElement bool true" # Dock에 안 뜨는 위젯

codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

# dmg: 앱 + 응용 프로그램 폴더 바로가기
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
DMG="dist/toegeun-yojeong-$VER-mac-$ARCH.dmg"
rm -f "$DMG"
hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
echo "만듦: $DMG"
