// 근무시간 계산 순수 로직 (Electron 의존성 없음 → node --test 로 테스트)

const MINUTE = 60 * 1000;

// 근무 유형별 기본 근무시간(분)
const WORK_TYPES = {
  normal: { label: '일반근무', minutes: 9 * 60 },
  half: { label: '반차', minutes: 4 * 60 },
  flex: { label: '유연근무', minutes: 8 * 60 + 30 },
};

const START_MODES = {
  boot: '부팅 시각',
  boot_plus_10: '부팅 10분 후',
  manual: '직접 입력',
};

function dateKey(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 분 단위로 내림 (시작 시각은 분 단위로 다룬다)
function floorToMinute(ms) {
  return Math.floor(ms / MINUTE) * MINUTE;
}

// 오늘의 기본 시작 시각: 오늘 부팅했으면 부팅 시각, 아니면(어제 켜둔 PC) 앱 실행 시각
function defaultStart(bootMs, nowMs) {
  return floorToMinute(dateKey(bootMs) === dateKey(nowMs) ? bootMs : nowMs);
}

function createDay(bootMs, nowMs) {
  const baseStart = defaultStart(bootMs, nowMs);
  return {
    date: dateKey(nowMs),
    baseStart, // 보정 전 기본 시작 시각
    startMode: 'boot',
    start: baseStart, // 최종 시작 시각
    workType: 'normal',
    workMinutes: WORK_TYPES.normal.minutes,
    flexMinutes: WORK_TYPES.flex.minutes, // 사용자가 바꾼 유연근무 시간 기억
    endedAt: null, // 타이머 종료 시각
    overtime: false, // 추가 근무 선택 여부
    nextAlertAt: null, // 다음 퇴근 알림 시각 (null이면 퇴근 예정 시각)
    alertOff: false, // 오늘 퇴근 알림 숨김
  };
}

// 저장된 기록이 오늘 것이 아니면 새 근무일을 만든다
function ensureToday(day, bootMs, nowMs) {
  if (day && day.date === dateKey(nowMs)) return day;
  return createDay(bootMs, nowMs);
}

function endTime(day) {
  return day.start + day.workMinutes * MINUTE;
}

// 남은 시간(ms). 음수면 퇴근 시각이 지난 것(추가 근무)
function remaining(day, nowMs) {
  return endTime(day) - nowMs;
}

// 근무 일정이 바뀌면 퇴근 알림을 새 퇴근 예정 시각 기준으로 다시 잡는다
function resetAlert(day) {
  return { ...day, overtime: false, nextAlertAt: null, alertOff: false };
}

function setWorkType(day, type, flexMinutes) {
  if (!WORK_TYPES[type]) throw new Error(`알 수 없는 근무 유형: ${type}`);
  const next = { ...resetAlert(day), workType: type };
  if (type === 'flex') {
    if (flexMinutes != null) {
      if (!Number.isInteger(flexMinutes) || flexMinutes <= 0 || flexMinutes > 24 * 60) {
        throw new Error('유연근무 시간이 올바르지 않습니다.');
      }
      next.flexMinutes = flexMinutes;
    }
    next.workMinutes = next.flexMinutes;
  } else {
    next.workMinutes = WORK_TYPES[type].minutes;
  }
  return next;
}

// mode: 'boot' | 'boot_plus_10' | 'manual'(manualMs 필요)
function setStart(day, mode, nowMs, manualMs) {
  let start;
  if (mode === 'boot') start = day.baseStart;
  else if (mode === 'boot_plus_10') start = day.baseStart + 10 * MINUTE;
  else if (mode === 'manual') start = floorToMinute(manualMs);
  else throw new Error(`알 수 없는 보정 방식: ${mode}`);

  if (!Number.isFinite(start)) throw new Error('시작 시각이 올바르지 않습니다.');
  if (start > nowMs) throw new Error('현재 시각 이후로는 시작 시각을 정할 수 없어요.');
  return { ...resetAlert(day), startMode: mode, start };
}

const OVERTIME_REMIND_MINUTES = 30;

// 퇴근 가능 알림을 띄워야 하는지
function alertDue(day, nowMs) {
  if (day.endedAt || day.alertOff) return false;
  return nowMs >= (day.nextAlertAt ?? endTime(day));
}

// 퇴근 알림 응답: 'end' 타이머 종료 | 'overtime' 추가 근무(30분 후 재알림) | 'hide' 오늘 알림 숨김
function respondAlert(day, choice, nowMs) {
  if (choice === 'end') return { ...day, endedAt: nowMs };
  if (choice === 'overtime') {
    return { ...day, overtime: true, nextAlertAt: nowMs + OVERTIME_REMIND_MINUTES * MINUTE };
  }
  if (choice === 'hide') return { ...day, alertOff: true };
  throw new Error(`알 수 없는 응답: ${choice}`);
}

// 실수로 종료했을 때 다시 시작
function resume(day) {
  return { ...day, endedAt: null };
}

// 시작 시각부터 지금(종료했으면 종료 시각)까지 실제 경과시간
function elapsed(day, nowMs) {
  return (day.endedAt ?? nowMs) - day.start;
}

// "HH:MM" → 같은 날짜의 ms
function timeOnDay(dayMs, hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m || +m[1] > 23 || +m[2] > 59) return NaN;
  const d = new Date(dayMs);
  d.setHours(+m[1], +m[2], 0, 0);
  return d.getTime();
}

function formatClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 남은 시간 표시: 1분 미만은 올림해서 "0:01"처럼 보이게, 지난 시간은 +로 표시
function formatDuration(ms) {
  const over = ms < 0;
  const totalMin = over ? Math.floor(-ms / MINUTE) : Math.ceil(ms / MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${over ? '+' : ''}${h}:${String(m).padStart(2, '0')}`;
}

module.exports = {
  WORK_TYPES,
  START_MODES,
  dateKey,
  createDay,
  ensureToday,
  endTime,
  remaining,
  setWorkType,
  setStart,
  alertDue,
  respondAlert,
  resume,
  elapsed,
  timeOnDay,
  formatClock,
  formatDuration,
};
