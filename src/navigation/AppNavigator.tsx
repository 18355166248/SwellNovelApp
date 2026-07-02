import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { darkTheme } from '../theme/themes';
import { Icon } from '../components';

// Screens
import BookshelfScreen from '../screens/BookshelfScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import SearchScreen from '../screens/SearchScreen';
import MeScreen from '../screens/MeScreen';
import ReaderScreen from '../screens/ReaderScreen';
import BookDetailScreen from '../screens/BookDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const { theme } = useTheme();

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.accentDark,
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarStyle: {
            height: 72,
            backgroundColor: theme.colors.tabBar,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            paddingTop: 6,
            paddingBottom: 12,
          },
          // Web 端默认 tab item 布局会把 label 压到容器底部，显式留出行高避免文字被裁切。
          tabBarItemStyle: {
            height: 54,
            paddingVertical: 0,
            justifyContent: 'center',
          },
          tabBarLabelStyle: {
            fontSize: 10.5,
            lineHeight: 13,
            fontWeight: Platform.select({ ios: '600', android: 'bold' }),
            marginTop: 2,
            marginBottom: 0,
          },
          tabBarIconStyle: {
            marginTop: 0,
            marginBottom: 2,
          },
        }}>
        <Tab.Screen
          name="Bookshelf"
          component={BookshelfScreen}
          options={{
            tabBarLabel: '书架',
            tabBarIcon: ({ color, size }) => (
              <Icon name="menu-book" color={color as string} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Discover"
          component={DiscoverScreen}
          options={{
            tabBarLabel: '发现',
            tabBarIcon: ({ color, size }) => (
              <Icon name="explore" color={color as string} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Search"
          component={SearchScreen}
          options={{
            tabBarLabel: '搜索',
            tabBarIcon: ({ color, size }) => (
              <Icon name="search" color={color as string} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Me"
          component={MeScreen}
          options={{
            tabBarLabel: '我的',
            tabBarIcon: ({ color, size }) => (
              <Icon name="person-outline" color={color as string} size={size} />
            ),
          }}
        />
      </Tab.Navigator>
    </SafeAreaView>
  );
}

export default function AppNavigator() {
  const { theme } = useTheme();

  return (
    <SafeAreaProvider>
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
            headerShown: false,
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="BookDetail" component={BookDetailScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
