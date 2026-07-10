const React = require('react');
const { View } = require('react-native');

/** 集成渲染只关心组件树可挂载，不执行真实网页导航和注入脚本。 */
const WebView = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref }),
);

module.exports = { WebView, default: WebView };
