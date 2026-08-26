import React, { useRef, useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  Animated,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// 必须在模块级只创建一次：放进组件体内会让每次 render 产生新的组件类型，
// React 据此卸载并重建 TextInput，表现为「每输入一个字就失去光标」。
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  style,
  ...props
}) => {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const borderColor = error
    ? theme.colors.error
    : focusAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [theme.colors.border, theme.colors.primary],
      });

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text
          style={{ marginBottom: theme.spacing.xs, color: theme.colors.text }}>
          {label}
        </Text>
      )}
      <AnimatedTextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            borderColor,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.md,
            fontSize: theme.fontSize.md,
            borderWidth: isFocused ? 1.5 : 1,
          },
          style,
        ]}
        placeholderTextColor={theme.colors.textSecondary}
        onFocus={() => {
          setIsFocused(true);
          Animated.timing(focusAnim, {
            toValue: 1,
            duration: 160,
            useNativeDriver: false,
          }).start();
        }}
        onBlur={() => {
          setIsFocused(false);
          Animated.timing(focusAnim, {
            toValue: 0,
            duration: 160,
            useNativeDriver: false,
          }).start();
        }}
        {...props}
      />
      {error && (
        <Text
          style={{ marginTop: theme.spacing.xs }}>
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  input: {
    borderWidth: 1,
  },
});
