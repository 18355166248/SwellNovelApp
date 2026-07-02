/**
 * Web 入口（react-native-web）
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import appJson from './app.json';

const appName = appJson.name;

// 注入 MaterialIcons 字体：react-native-vector-icons 自带 ttf，
// Web 端需要通过 @font-face 手动加载，否则图标显示为方框。
import MaterialIconsFont from 'react-native-vector-icons/Fonts/MaterialIcons.ttf';

const iconFontStyles = `@font-face {
  font-family: 'MaterialIcons';
  src: url(${MaterialIconsFont}) format('truetype');
  font-weight: normal;
  font-style: normal;
}

/* 阅读器左右翻页在 Web 端会获得焦点并显示浏览器 outline/scrollbar，预览时看起来像一条选中线。 */
[data-testid="reader-page-list"],
[data-testid="reader-page-list"] * {
  outline: none !important;
}

[data-testid="reader-page-list"] {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

[data-testid="reader-page-list"]::-webkit-scrollbar {
  display: none;
}`;

const style = document.createElement('style');
style.appendChild(document.createTextNode(iconFontStyles));
document.head.appendChild(style);

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  rootTag: document.getElementById('root'),
});
