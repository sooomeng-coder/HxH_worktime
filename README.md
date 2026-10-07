# 퇴근 요정 (HxH_worktime)

화면 구석에 작게 떠 있는 요정이 오늘의 퇴근 예정 시각을 알려주는 데스크톱 위젯입니다.

```bash
npm install
npm start   # 앱 실행
npm test    # 계산 로직 테스트
```

- 요정을 드래그하면 위치를 옮길 수 있고, 클릭하면 퇴근 예정 시각과 근무 유형이 보입니다.
- 요정에 마우스를 올리면 나오는 ⚙ 버튼에서 근무 유형(일반 9시간 / 반차 4시간 / 유연근무)과 업무 시작 시각을 바꿀 수 있습니다.

## 설치 파일 만들기

- **GitHub에서 (추천)**: 저장소 → Actions → "설치 파일 만들기" → Run workflow. 끝나면 Artifacts에서 Windows(`.exe`)·Mac(`.dmg`, Apple 실리콘 M칩용) 설치 파일을 받습니다.
- **내 PC에서**: Windows는 `npm run dist:win`, Mac은 `npm run dist:mac` → `dist/` 폴더에 생성.
- 코드 서명을 하지 않아서 처음 실행할 때 Windows는 "PC 보호" 창에서 **추가 정보 → 실행**, Mac은 앱을 응용 프로그램 폴더로 옮긴 뒤 터미널에서 `xattr -dr com.apple.quarantine "/Applications/퇴근 요정.app"`을 한 번 실행해야 합니다(또는 시스템 설정 → 개인정보 보호 및 보안 → **그래도 열기**).

기획과 진행 상황은 [docs/plan.md](docs/plan.md)에 있습니다.
