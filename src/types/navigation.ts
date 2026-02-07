export type RootStackParamList = {
  MainTabs: undefined;
  Reader: { bookId: string; chapterId?: string };
  Settings: undefined;
  BookDetail: { bookId: string };
};

export type MainTabParamList = {
  Bookshelf: undefined;
  Search: undefined;
  Settings: undefined;
};
