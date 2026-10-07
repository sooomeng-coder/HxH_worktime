// 요정 표시 설정 (크기·투명도·마우스 반응·숨기기)

const DEFAULT_PREFS = { scale: 1, opacity: 1, mouseReact: true, hidden: false };

const clamp = (v, min, max, fallback) =>
  (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

// 저장 파일이 손상되거나 값이 이상해도 안전한 범위로 맞춘다
function normalizePrefs(p = {}) {
  return {
    scale: Math.round(clamp(Number(p.scale), 0.7, 1.5, DEFAULT_PREFS.scale) * 100) / 100,
    opacity: Math.round(clamp(Number(p.opacity), 0.3, 1, DEFAULT_PREFS.opacity) * 100) / 100,
    mouseReact: p.mouseReact ?? DEFAULT_PREFS.mouseReact,
    hidden: !!p.hidden,
  };
}

module.exports = { DEFAULT_PREFS, normalizePrefs };
