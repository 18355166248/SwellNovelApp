/**
 * 内置浏览器（Web 占位）。
 *
 * 浏览器不能内嵌外域站点（X-Frame-Options / CSP），且本功能依赖原生 WebView 的
 * DOM 注入，因此仅移动端可用。Web 端保持“粘贴 URL 添加网络书籍”。
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';

export default function InAppBrowserScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={{ color: theme.colors.text, fontSize: 15, marginBottom: 8 }}>
        内置浏览器仅移动端可用
      </Text>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: 13,
          textAlign: 'center',
          lineHeight: 20,
          maxWidth: 320,
        }}
      >
        Web 端请在书架用「粘贴网址添加网络书籍」。移动端可在内置浏览器里浏览小说站点，
        自动识别书籍并加入书架。
      </Text>
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.btn, { backgroundColor: theme.colors.primary }]}
      >
        <Text style={{ color: '#fff', fontSize: 13 }}>返回</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  btn: { marginTop: 18, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
});
