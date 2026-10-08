import React from 'react';
import { Platform } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  LinkingOptions,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { darkTheme } from '../theme/themes';
import { Icon } from '../components';

// 页面首次进入时才加载模块，避免启动渲染导航配置就初始化阅读器、备份与浏览器依赖。
const screens = {
  Bookshelf: () => require('../screens/BookshelfScreen').default,
  Discover: () => require('../screens/DiscoverScreen').default,
  Search: () => require('../screens/SearchScreen').default,
  Me: () => require('../screens/MeScreen').default,
  Reader: () => require('../screens/ReaderScreen').default,
  BookDetail: () => require('../screens/BookDetailScreen').default,
  InAppBrowser: () => require('../screens/InAppBrowserScreen').default,
  CacheManagement: () => require('../screens/CacheManagementScreen').default,
  RecycleBin: () => require('../screens/RecycleBinScreen').default,
  ReadingStats: () => require('../screens/ReadingStatsScreen').default,
  Settings: () => require('../screens/MeScreen').SettingsScreen,
  WebDavBackup: () => require('../screens/MeScreen').WebDavBackupScreen,
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const PROFILE_HEADER_COLOR = '#143733';

type MainTabsProps = NativeStackScreenProps<RootStackParamList, 'MainTabs'>;

const linking: LinkingOptions<RootStackParamList> = {
  enabled: Platform.OS === 'web',
  prefixes: [],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Bookshelf: '',
          Discover: 'discover',
          Search: 'search',
          Me: 'me',
        },
      },
      Settings: 'settings',
      WebDavBackup: 'settings/webdav',
      CacheManagement: 'settings/cache',
      RecycleBin: 'settings/recycle-bin',
      ReadingStats: 'me/reading-stats',
      BookDetail: 'book/:bookId',
      Reader: 'read/:bookId',
      InAppBrowser: 'browser',
    },
  },
};

function MainTabs({ navigation }: MainTabsProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] =
    React.useState<keyof MainTabParamList>('Bookshelf');
  const tabBottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 0);
  const tabContentHeight = 60;
  const isProfileTab = activeTab === 'Me';

  React.useEffect(() => {
    // 状态栏由 native-stack 的 UIViewController 统一管理；进入“我的”时切成浅色文字，
    // 离开后按全局明暗主题恢复，避免调用 RCTStatusBarManager 与原生配置冲突。
    navigation.setOptions({
      statusBarStyle:
        isProfileTab || theme.colors.background === darkTheme.colors.background
          ? 'light'
          : 'dark',
    });
  }, [isProfileTab, navigation, theme.colors.background]);

  return (
    <SafeAreaView
      edges={isProfileTab ? [] : ['top']}
      style={{
        flex: 1,
        backgroundColor: isProfileTab
          ? PROFILE_HEADER_COLOR
          : theme.colors.background,
      }}
    >
      <Tab.Navigator
        screenListeners={({ route }) => ({
          focus: () => setActiveTab(route.name),
        })}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.accentDark,
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarStyle: {
            height: tabContentHeight + tabBottomInset,
            backgroundColor: theme.colors.tabBar,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            paddingTop: 6,
            paddingBottom: tabBottomInset,
          },
          // TabBar 自身负责吃掉底部安全区；item 只占内容高度，避免 iPhone Home Indicator 顶起文字。
          tabBarItemStyle: {
            height: tabContentHeight - 6,
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
        }}
      >
        <Tab.Screen
          name="Bookshelf"
          getComponent={screens.Bookshelf}
          options={{
            tabBarLabel: '书架',
            tabBarIcon: ({ color, size }) => (
              <Icon name="menu-book" color={color as string} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Discover"
          getComponent={screens.Discover}
          options={{
            tabBarLabel: '发现',
            tabBarIcon: ({ color, size }) => (
              <Icon name="explore" color={color as string} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Search"
          getComponent={screens.Search}
          options={{
            tabBarLabel: '搜书',
            tabBarIcon: ({ color, size }) => (
              <Icon name="search" color={color as string} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Me"
          getComponent={screens.Me}
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
        linking={linking}
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
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            statusBarHidden: false,
            statusBarStyle:
              theme.colors.background === darkTheme.colors.background
                ? 'light'
                : 'dark',
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}
        >
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="BookDetail" getComponent={screens.BookDetail} />
          <Stack.Screen name="Reader" getComponent={screens.Reader} />
          <Stack.Screen
            name="InAppBrowser"
            getComponent={screens.InAppBrowser}
          />
          <Stack.Screen name="Settings" getComponent={screens.Settings} />
          <Stack.Screen
            name="WebDavBackup"
            getComponent={screens.WebDavBackup}
          />
          <Stack.Screen
            name="CacheManagement"
            getComponent={screens.CacheManagement}
          />
          <Stack.Screen name="RecycleBin" getComponent={screens.RecycleBin} />
          <Stack.Screen
            name="ReadingStats"
            getComponent={screens.ReadingStats}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
