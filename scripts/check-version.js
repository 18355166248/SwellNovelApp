const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageVersion = require(path.join(root, 'package.json')).version;
const projectText = fs.readFileSync(
  path.join(root, 'ios/SwellNovalApp.xcodeproj/project.pbxproj'),
  'utf8',
);
const iosVersions = [
  ...projectText.matchAll(/MARKETING_VERSION = ([^;]+);/g),
].map(match => match[1].trim());

// Android 与界面直接读取 package.json；iOS 是独立工程设置，发布前必须显式校验。
if (!iosVersions.length || iosVersions.some(version => version !== packageVersion)) {
  console.error(
    `版本不一致：package.json=${packageVersion}，iOS=${iosVersions.join(',') || '缺失'}`,
  );
  process.exit(1);
}

console.log(`版本一致：${packageVersion}`);
