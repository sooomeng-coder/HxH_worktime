const $ = (id) => document.getElementById(id);
let day = null;

function render() {
  if (!day) return;
  const now = Date.now();
  const left = wt.remaining(day, now);
  const done = left <= 0;
  document.body.classList.toggle('done', done);
  $('remain').textContent = done
    ? `퇴근 가능! ${wt.formatDuration(left)}`
    : `퇴근까지 ${wt.formatDuration(left)}`;
  $('detail').innerHTML =
    `${wt.WORK_TYPES[day.workType].label} · ${wt.formatClock(day.start)} 시작<br>` +
    `${wt.formatClock(wt.endTime(day))} 퇴근 예정 <span title="개인 참고용 계산입니다">ⓘ</span>`;
}

// 요정 위에서만 마우스를 받고, 나머지 투명 영역은 아래 창으로 통과
for (const el of document.querySelectorAll('.hit')) {
  el.addEventListener('mouseenter', () => fairy.ignoreMouse(false));
  el.addEventListener('mouseleave', () => fairy.ignoreMouse(true));
}

// 눈동자가 마우스 포인터를 바라봄
const pupils = [[$('pupilL'), 50], [$('pupilR'), 70]];
fairy.onCursor(({ x, y }) => {
  // SVG(104px)는 창 안에서 대략 중앙 (33, 50) 위치에서 시작
  const cx = 33 + 52, cy = 50 + 47;
  const dx = x - cx, dy = y - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const k = Math.min(3, dist / 40) / dist;
  for (const [p, baseX] of pupils) {
    p.setAttribute('cx', baseX + dx * k);
    p.setAttribute('cy', 52 + dy * k);
  }
  $('fairy').classList.toggle('near', dist < 120);
});

// 드래그로 이동, 거의 안 움직였으면 클릭으로 보고 상세 정보 토글
let down = null;
$('fairy').addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  down = { x: e.screenX, y: e.screenY };
  $('fairy').classList.add('dragging');
  fairy.dragStart();
});
window.addEventListener('mouseup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.screenX - down.x, e.screenY - down.y);
  down = null;
  $('fairy').classList.remove('dragging');
  fairy.dragEnd();
  if (moved < 4) $('detail').hidden = !$('detail').hidden;
});

$('gear').addEventListener('click', () => fairy.openSettings());

fairy.onState((d) => { day = d; render(); });
fairy.getState().then((d) => { day = d; render(); });
setInterval(render, 1000);
