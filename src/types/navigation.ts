import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Bookshelf: undefined;
  Discover: undefined;
  Search: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Reader: { bookId: string; chapterId?: string; openDrawer?: boolean };
  BookDetail: { bookId: string };
  InAppBrowser: { initialUrl?: string } | undefined;
  Settings: undefined;
  WebDavBackup: undefined;
  CacheManagement: undefined;
  RecycleBin: undefined;
};
