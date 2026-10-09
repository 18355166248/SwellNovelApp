module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-url-polyfill)/)',
  ],
  moduleNameMapper: {
    '^react-native-fs$': '<rootDir>/__mocks__/react-native-fs.js',
    '^react-native-webview$': '<rootDir>/__mocks__/react-native-webview.js',
  },
};
