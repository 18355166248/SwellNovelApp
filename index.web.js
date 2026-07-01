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
}`;

const style = document.createElement('style');
style.appendChild(document.createTextNode(iconFontStyles));
document.head.appendChild(style);

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  rootTag: document.getElementById('root'),
});
