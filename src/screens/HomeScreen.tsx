import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';

function HomeScreen() {
  const isDarkMode = useColorScheme() === 'dark';

  const textColor = isDarkMode ? '#FFFFFF' : '#000000';
  const backgroundColor = isDarkMode ? '#1C1C1E' : '#FFFFFF';
  const cardBackgroundColor = isDarkMode ? '#2C2C2E' : '#F5F5F5';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>
          欢迎使用 SwellNovel App
        </Text>
        <Text style={[styles.subtitle, { color: textColor }]}>
          一个简单的文本展示页面
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>
          关于应用
        </Text>
        <Text style={[styles.cardText, { color: textColor }]}>
          这是一个基于 React Native 开发的移动应用。应用提供了简洁优雅的用户界面，支持深色模式和浅色模式自动切换。
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>
          功能特点
        </Text>
        <Text style={[styles.cardText, { color: textColor }]}>
          • 响应式设计，适配各种屏幕尺寸{'\n'}
          • 支持深色模式{'\n'}
          • 流畅的用户体验{'\n'}
          • 现代化的 UI 设计
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>
          技术栈
        </Text>
        <Text style={[styles.cardText, { color: textColor }]}>
          React Native 0.83.1{'\n'}
          TypeScript{'\n'}
          React 19.2.0
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: textColor }]}>
          版本 1.0.0
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  card: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  cardText: {
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 14,
    opacity: 0.6,
  },
});

export default HomeScreen;
