const $ = (id) => document.getElementById(id);
let day = null;
let detailOpen = false;
let bubbleKey = '';

// 매초 다시 그리지만 내용이 같으면 그대로 둬서 버튼 클릭이 끊기지 않게 함
function setBubble(html, buttons = []) {
  const key = html + buttons.map((b) => b[0]).join('|');
  $('bubble').hidden = false;
  if (key === bubbleKey) return;
  bubbleKey = key;
  $('bubbleText').innerHTML = html;
  $('bubbleButtons').replaceChildren(...buttons.map(([label, onClick, primary]) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.addEventListener('click', onClick);
    return b;
  }));
}

function hideBubble() {
  $('bubble').hidden = true;
  bubbleKey = '';
  fairy.ignoreMouse(true);
}

// 지난 시간을 LCD와 같은 방식으로 표시 ("+0:07" → "0:07")
const overBy = (left) => wt.formatDuration(left).replace('+', '');

const respond = (choice) => () => {
  detailOpen = false;
  fairy.respondAlert(choice);
};

function workSummary(now) {
  const end = wt.formatClock(wt.endTime(day));
  const total = wt.formatDuration(wt.elapsed(day, now));
  if (day.endedAt) return `${wt.formatClock(day.endedAt)} 퇴근 완료 · 총 ${total} 근무`;
  const left = wt.remaining(day, now);
  if (left > 0) {
    return `${wt.WORK_TYPES[day.workType].label} · ${wt.formatClock(day.start)} 시작<br>${end} 퇴근 예정`;
  }
  return `${end} 퇴근 예정이었어요<br>추가 근무 ${overBy(left)} · 총 ${total}`;
}

function render() {
  if (!day) return;
  const now = Date.now();
  const left = wt.remaining(day, now);
  const due = wt.alertDue(day, now);
  document.body.classList.toggle('ended', !!day.endedAt);
  document.body.classList.toggle('due', due);

  // 이마 LCD: 남은 시간 → 지나면 +초과 시간 → 종료하면 BYE
  $('lcd').textContent = day.endedAt ? 'BYE' : wt.formatDuration(left);

  if (due) {
    const title = day.overtime
      ? `추가 근무 ${overBy(left)}째예요.<br><strong>이제 퇴근할까요?</strong>`
      : '<strong>퇴근 시간이에요! 🎉</strong><br>오늘도 수고했어요';
    setBubble(title, [
      ['퇴근하기', respond('end'), true],
      ['30분 더', respond('overtime')],
      ['숨기기', respond('hide')],
    ]);
  } else if (detailOpen) {
    setBubble(
      `${workSummary(now)}<br><span style="opacity:.6">개인 참고용 계산이에요</span>`,
      day.endedAt ? [['다시 시작', () => fairy.resume(), true]] : [],
    );
  } else if (!$('bubble').hidden) {
    hideBubble();
  }
}

// 요정·말풍선 위에서만 마우스를 받고, 나머지 투명 영역은 아래 창으로 통과
for (const el of document.querySelectorAll('.hit')) {
  el.addEventListener('mouseenter', () => fairy.ignoreMouse(false));
  el.addEventListener('mouseleave', () => fairy.ignoreMouse(true));
}

// 눈이 마우스 포인터 쪽을 바라봄
fairy.onCursor(({ x, y }) => {
  const dx = x - 100, dy = y - 160; // 창 안에서 눈 위치
  const dist = Math.hypot(dx, dy) || 1;
  const k = Math.min(2.5, dist / 50) / dist;
  $('eyes').style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  $('fairy').classList.toggle('near', dist < 130);
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
  if (moved < 4) {
    detailOpen = !detailOpen;
    render();
  }
});

$('gear').addEventListener('click', () => fairy.openSettings());

fairy.onState((d) => { day = d; render(); });
fairy.getState().then((d) => { day = d; render(); });
setInterval(render, 1000);
