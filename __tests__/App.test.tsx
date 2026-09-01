/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock('../src/navigation/AppNavigator', () => {
  const { View } = require('react-native');
  return () => <View testID="app-navigator" />;
});

jest.mock('../src/store/LibraryPersistence', () => ({
  LibraryPersistence: () => null,
}));

jest.mock('../src/components/LibraryReadyGate', () => ({
  LibraryReadyGate: ({ children }: { children: React.ReactNode }) => children,
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
