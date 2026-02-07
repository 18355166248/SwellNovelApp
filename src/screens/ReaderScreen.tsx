import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text } from '../components';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import {
  useCurrentBook,
  useCurrentChapterContent,
  useReaderSettings,
  useUpdateReaderState,
  useSetToolbarVisible,
} from '../store';

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ReaderScreen() {
  const { theme } = useTheme();
  const route = useRoute<ReaderScreenRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { bookId } = route.params;
  
  // 使用 Jotai 状态管理
  const currentBook = useCurrentBook();
  const chapterContent = useCurrentChapterContent();
  const readerSettings = useReaderSettings();
  const setToolbarVisible = useSetToolbarVisible();

  // 如果没有章节内容，使用示例文本
  const displayContent = chapterContent || `
第一章 开始

这是一个示例章节的内容。在实际应用中，这里会显示从书籍文件中读取的真实内容。

阅读器界面支持：
- 文本显示和渲染
- 翻页功能（左右滑动、上下滚动）
- 章节导航
- 阅读进度显示

您可以在这里阅读完整的书籍内容。阅读器会根据您的设置调整字体大小、行间距、背景颜色等。

更多功能将在后续版本中实现。
  `.trim();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: readerSettings.backgroundColor || theme.colors.background },
      ]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        onScrollBeginDrag={() => setToolbarVisible(false)}
        onScrollEndDrag={() => setToolbarVisible(true)}>
        <View style={styles.header}>
          <Text variant="h3" style={styles.chapterTitle}>
            第一章 开始
          </Text>
        </View>
        <View style={styles.textContainer}>
          <Text
            variant="body"
            style={[
              styles.readerText,
              {
                color: readerSettings.textColor || theme.colors.text,
                fontSize: readerSettings.fontSize,
                lineHeight: readerSettings.fontSize * readerSettings.lineHeight,
              },
            ]}>
            {displayContent}
          </Text>
        </View>
        <View style={styles.footer}>
          <Text variant="caption" color="textSecondary">
            阅读进度: {currentBook?.progress || 0}%
          </Text>
        </View>
      </ScrollView>

      {/* 工具栏占位，后续会实现工具栏显示/隐藏功能 */}
      <View
        style={[
          styles.toolbar,
          {
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface + 'F0',
          },
        ]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.toolbarButton}>
          <Text variant="body" color="primary">
            返回
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <Text variant="body" color="primary">
            目录
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <Text variant="body" color="primary">
            设置
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  chapterTitle: {
    textAlign: 'center',
  },
  textContainer: {
    marginBottom: 24,
  },
  readerText: {
    textAlign: 'justify',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  toolbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  toolbarButton: {
    padding: 8,
  },
});
