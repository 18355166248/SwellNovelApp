module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^react-native-fs$': '<rootDir>/__mocks__/react-native-fs.js',
    '^react-native-webview$': '<rootDir>/__mocks__/react-native-webview.js',
  },
};
