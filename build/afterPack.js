// Mac: 서명 없이 빌드하면 Electron 바이너리에 '강화된 런타임' 표시만 남아
// JIT가 막히고 시작 직후 SIGTRAP으로 종료됨 → 앱 전체를 간이(ad-hoc) 서명으로 다시 서명
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--verbose=2', app], { stdio: 'inherit' });
};
