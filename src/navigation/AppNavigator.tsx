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

// Screens
import BookshelfScreen from '../screens/BookshelfScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import SearchScreen from '../screens/SearchScreen';
import MeScreen, { SettingsScreen, WebDavBackupScreen } from '../screens/MeScreen';
import ReaderScreen from '../screens/ReaderScreen';
import BookDetailScreen from '../screens/BookDetailScreen';
import InAppBrowserScreen from '../screens/InAppBrowserScreen';
import CacheManagementScreen from '../screens/CacheManagementScreen';
import RecycleBinScreen from '../screens/RecycleBinScreen';

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
      BookDetail: 'book/:bookId',
      Reader: 'read/:bookId',
      InAppBrowser: 'browser',
    },
  },
};

function MainTabs({ navigation }: MainTabsProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState<keyof MainTabParamList>(
    'Bookshelf',
  );
  const tabBottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 0);
  const tabContentHeight = 60;
  const isProfileTab = activeTab === 'Me';

  React.useEffect(() => {
    // 状态栏由 native-stack 的 UIViewController 统一管理；进入“我的”时切成浅色文字，
    // 离开后按全局明暗主题恢复，避免调用 RCTStatusBarManager 与原生配置冲突。
    navigation.setOptions({
      statusBarStyle:
        isProfileTab ||
        theme.colors.background === darkTheme.colors.background
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
            tabBarLabel: '搜书',
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
        }}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            statusBarHidden: false,
            statusBarStyle: theme.colors.background === darkTheme.colors.background
              ? 'light'
              : 'dark',
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="BookDetail" component={BookDetailScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
          <Stack.Screen name="InAppBrowser" component={InAppBrowserScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="WebDavBackup" component={WebDavBackupScreen} />
          <Stack.Screen
            name="CacheManagement"
            component={CacheManagementScreen}
          />
          <Stack.Screen name="RecycleBin" component={RecycleBinScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
