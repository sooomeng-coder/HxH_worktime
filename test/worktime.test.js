const test = require('node:test');
const assert = require('node:assert/strict');
const wt = require('../src/core/worktime');

const at = (h, m, day = 7) => new Date(2026, 9, day, h, m, 0, 0).getTime();

test('오늘 부팅했으면 부팅 시각이 기본 시작 시각', () => {
  const day = wt.createDay(at(8, 50), at(9, 5));
  assert.equal(day.start, at(8, 50));
  assert.equal(day.workType, 'normal');
  assert.equal(day.workMinutes, 540);
});

test('어제 부팅한 PC면 앱 실행 시각이 기본 시작 시각', () => {
  const day = wt.createDay(at(18, 0, 6), at(9, 3));
  assert.equal(day.start, at(9, 3));
});

test('일반근무 9시간 → 퇴근 예정 시각과 남은 시간', () => {
  const day = wt.createDay(at(9, 0), at(9, 0));
  assert.equal(wt.formatClock(wt.endTime(day)), '18:00');
  assert.equal(wt.formatDuration(wt.remaining(day, at(15, 30))), '2:30');
  assert.equal(wt.formatDuration(wt.remaining(day, at(18, 45))), '+0:45');
});

test('반차 4시간, 유연근무 기본 8시간 30분 및 직접 변경', () => {
  const day = wt.createDay(at(9, 0), at(9, 0));
  assert.equal(wt.formatClock(wt.endTime(wt.setWorkType(day, 'half'))), '13:00');
  const flex = wt.setWorkType(day, 'flex');
  assert.equal(wt.formatClock(wt.endTime(flex)), '17:30');
  const flex8 = wt.setWorkType(day, 'flex', 480);
  assert.equal(wt.formatClock(wt.endTime(flex8)), '17:00');
  // 다른 유형 갔다가 돌아와도 바꾼 유연근무 시간 유지
  const back = wt.setWorkType(wt.setWorkType(flex8, 'normal'), 'flex');
  assert.equal(back.workMinutes, 480);
});

test('시작 시각 보정: 10분 후, 직접 입력, 미래 시각 거부', () => {
  const day = wt.createDay(at(8, 50), at(9, 30));
  assert.equal(wt.setStart(day, 'boot_plus_10', at(9, 30)).start, at(9, 0));
  assert.equal(wt.setStart(day, 'manual', at(9, 30), at(9, 15)).start, at(9, 15));
  assert.throws(() => wt.setStart(day, 'manual', at(9, 30), at(9, 31)));
  // 보정 후 부팅 시각으로 되돌리기
  const back = wt.setStart(wt.setStart(day, 'boot_plus_10', at(9, 30)), 'boot', at(9, 30));
  assert.equal(back.start, at(8, 50));
});

test('날짜가 바뀌면 새 근무일, 같은 날이면 기존 기록 유지', () => {
  const day = wt.setWorkType(wt.createDay(at(9, 0), at(9, 0)), 'half');
  assert.equal(wt.ensureToday(day, at(9, 0), at(12, 0)), day);
  const next = wt.ensureToday(day, at(8, 40, 8), at(8, 45, 8));
  assert.equal(next.workType, 'normal');
  assert.equal(next.start, at(8, 40, 8));
});

test('HH:MM 파싱', () => {
  assert.equal(wt.timeOnDay(at(0, 0), '09:15'), at(9, 15));
  assert.ok(Number.isNaN(wt.timeOnDay(at(0, 0), '25:00')));
});

test('퇴근 예정 시각에 알림, 타이머 종료하면 더 이상 알리지 않음', () => {
  const day = wt.createDay(at(9, 0), at(9, 0));
  assert.equal(wt.alertDue(day, at(17, 59)), false);
  assert.equal(wt.alertDue(day, at(18, 0)), true);
  const ended = wt.respondAlert(day, 'end', at(18, 2));
  assert.equal(wt.alertDue(ended, at(20, 0)), false);
  assert.equal(wt.formatDuration(wt.elapsed(ended, at(20, 0))), '9:02');
  assert.equal(wt.resume(ended).endedAt, null);
});

test('추가 근무를 고르면 30분 후 다시 알림', () => {
  const day = wt.createDay(at(9, 0), at(9, 0));
  const ot = wt.respondAlert(day, 'overtime', at(18, 1));
  assert.equal(ot.overtime, true);
  assert.equal(wt.alertDue(ot, at(18, 30)), false);
  assert.equal(wt.alertDue(ot, at(18, 31)), true);
  // 퇴근 예정 시각과 실제 경과시간을 구분
  assert.equal(wt.formatClock(wt.endTime(ot)), '18:00');
  assert.equal(wt.formatDuration(wt.elapsed(ot, at(18, 40))), '9:40');
});

test('알림 숨기기는 오늘 알림을 끄고, 일정이 바뀌면 다시 켜짐', () => {
  const day = wt.createDay(at(9, 0), at(9, 0));
  const hidden = wt.respondAlert(day, 'hide', at(18, 0));
  assert.equal(wt.alertDue(hidden, at(19, 0)), false);
  const changed = wt.setStart(hidden, 'boot_plus_10', at(19, 0));
  assert.equal(wt.alertDue(changed, at(18, 9)), false);
  assert.equal(wt.alertDue(changed, at(18, 10)), true);
});
