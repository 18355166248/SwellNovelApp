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
import MaterialIconsFont from './assets/fonts/MaterialIcons.web.ttf';

const iconFontStyles = `@font-face {
  font-family: 'MaterialIcons';
  src: url(${MaterialIconsFont}) format('truetype');
  font-weight: normal;
  font-style: normal;
}

/* 滚动容器本身不画装饰线；内部可操作元素仍保留清晰的键盘焦点。 */
[data-testid="reader-page-list"] {
  outline: none !important;
}

[data-testid="reader-page-list"] [role="button"]:focus-visible {
  outline: 2px solid #c9a15e !important;
  outline-offset: -3px;
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
