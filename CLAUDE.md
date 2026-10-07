# CLAUDE.md

퇴근 요정: 화면에 작게 떠 있는 요정이 퇴근 예정 시각과 오늘의 할 일을 알려주는 Electron 데스크톱 위젯.

## 기획
- 기획의 기준은 Manyfast 프로젝트(`ac7d7c03-2ba8-4018-ac95-d21e818ba9ad`)다. Manyfast MCP가 연결되어 있으면 구현 전에 `read_project`로 최신 요구사항·수용 기준을 확인한다.
- 확정된 규칙과 단계별 진행 상황은 `docs/plan.md`. 단계를 끝내면 상태 칸을 갱신한다.

## 구조
- `src/core/worktime.js` — 근무시간 계산 순수 함수. Electron에 의존하지 않으며 모든 규칙(근무시간, 시작 시각 보정, 날짜 전환)은 여기에 둔다.
- `src/core/todos.js` — 오늘의 할 일 순수 함수 (추가·완료·삭제, 다음 근무일 이월).
- `src/core/nudge.js` — 무작위 할 일 확인 말풍선 순수 함수 (빈도별 간격, 나중에/숨기기/오늘 끄기).
- `src/core/prefs.js` — 요정 표시 설정(크기·투명도·마우스 반응·숨기기) 정규화.
- `src/main.js` — 메인 프로세스: 창 생성, IPC, 상태 저장, 트레이·단축키, 30초 주기 점검(날짜 전환·시계 변경·말풍선), 절전 복귀 처리.
- `assets/` — 요정 그림(`fairy.png`, LCD 숫자와 눈은 지운 상태 — 화면에서 SVG로 덧그림), 앱 아이콘 `icon.png`·트레이 아이콘 `tray*.png`(요정 그림 원본에서 생성, 설치 파일용 1024px은 `build/icon.png`).
- `src/store.js` — `userData/state.json` 저장/로드 (원자적 쓰기).
- `src/preload.js` — renderer에 `window.fairy`(IPC)와 `window.wt`(계산 함수)를 노출.
- `src/renderer/` — `fairy.*`(요정 위젯), `settings.*`(설정 창). 번들러 없이 순수 HTML/CSS/JS.

## 명령
- `npm start` — 앱 실행
- `npm test` — `node --test`로 core 로직 테스트
- `npm run dist:win` / `npm run dist:mac` — 설치 파일 생성(`dist/`). 아이콘 원본은 `build/icon.png`(1024px)
- Mac은 electron-builder로 포장하면 시작 직후 SIGTRAP으로 꺼져서 `scripts/pack-mac.sh`가 원본 Electron.app에 앱 코드를 넣어 dmg를 만든다(실행하는 Mac의 칩용만 생성)
- `.github/workflows/build.yml` — GitHub Actions에서 Windows·Mac 설치 파일 빌드

## 원칙
- 요정은 업무를 방해하지 않는다: 포커스를 뺏지 않고(`showInactive`), 투명 영역은 클릭 통과, 다른 창을 활성화하지 않는다.
- 로그인·서버 없음. 데이터는 로컬 파일에만 저장한다.
- 계산 결과는 "개인 참고용"임을 화면에 안내한다.
- 새 규칙은 core에 순수 함수로 추가하고 `test/`에 테스트를 함께 쓴다.
- UI 문구는 한국어.
