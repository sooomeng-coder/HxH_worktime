// 상태를 사용자 컴퓨터의 JSON 파일 하나에 저장 (서버·로그인 없음)
const fs = require('fs');
const path = require('path');

let file;

function init(dir) {
  file = path.join(dir, 'state.json');
}

function load() {
  try {
    return { todos: [], ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { day: null, todos: [], widget: null };
  }
}

// 임시 파일에 쓴 뒤 교체해서, 저장 중 꺼져도 파일이 깨지지 않게 함
function save(state) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { init, load, save };
