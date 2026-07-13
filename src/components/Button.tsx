import React, { useRef } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
  StyleProp,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
    };

    if (size === 'small') {
      baseStyle.paddingVertical = theme.spacing.sm;
      baseStyle.paddingHorizontal = theme.spacing.md;
    } else if (size === 'large') {
      baseStyle.paddingVertical = theme.spacing.lg;
      baseStyle.paddingHorizontal = theme.spacing.xl;
    }

    if (variant === 'primary') {
      baseStyle.backgroundColor = theme.colors.primary;
      Object.assign(baseStyle, theme.shadows.md);
    } else if (variant === 'secondary') {
      baseStyle.backgroundColor = theme.colors.secondary;
      Object.assign(baseStyle, theme.shadows.sm);
    } else {
      baseStyle.backgroundColor = 'transparent';
      baseStyle.borderWidth = 1;
      baseStyle.borderColor = theme.colors.primary;
    }

    if (disabled || loading) {
      baseStyle.opacity = 0.5;
    }

    return baseStyle;
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontWeight: '600',
    };

    if (size === 'small') {
      baseStyle.fontSize = theme.fontSize.sm;
    } else if (size === 'large') {
      baseStyle.fontSize = theme.fontSize.lg;
    } else {
      baseStyle.fontSize = theme.fontSize.md;
    }

    if (variant === 'outline') {
      baseStyle.color = theme.colors.primary;
    } else {
      baseStyle.color = '#FFFFFF';
    }

    return baseStyle;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      // flex、宽度和外边距必须作用在横向布局的直接子节点；放到动画层会在 iOS 弹窗中被压成零宽。
      style={style}
      android_ripple={{ color: theme.colors.primary }}>
      <Animated.View
        style={[
          getButtonStyle(),
          { transform: [{ scale }] },
        ]}
        onTouchStart={() => {
          if (disabled || loading) return;
          Animated.spring(scale, {
            toValue: 0.98,
            useNativeDriver: true,
            friction: 6,
            tension: 120,
          }).start();
        }}
        onTouchEnd={() => {
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 6,
            tension: 120,
          }).start();
        }}>
        {loading && (
          <ActivityIndicator
            size="small"
            color={variant === 'outline' ? theme.colors.primary : '#FFFFFF'}
            style={{ marginRight: theme.spacing.sm }}
          />
        )}
        <Text style={[getTextStyle(), textStyle]}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
};
