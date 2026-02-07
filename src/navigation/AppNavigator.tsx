import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { darkTheme } from '../theme/themes';

// Screens
import BookshelfScreen from '../screens/BookshelfScreen';
import SearchScreen from '../screens/SearchScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ReaderScreen from '../screens/ReaderScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.text,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}>
      <Tab.Screen
        name="Bookshelf"
        component={BookshelfScreen}
        options={{
          title: '书架',
          tabBarLabel: '书架',
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          title: '搜索',
          tabBarLabel: '搜索',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '设置',
          tabBarLabel: '设置',
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { theme } = useTheme();

  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        dark: theme.colors.background === darkTheme.colors.background,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.primary,
        },
        fonts: DefaultTheme.fonts,
      }}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}>
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{
            title: '阅读',
            headerShown: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
