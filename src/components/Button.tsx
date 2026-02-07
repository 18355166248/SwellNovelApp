import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
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

  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    };

    if (size === 'small') {
      baseStyle.paddingVertical = theme.spacing.sm;
      baseStyle.paddingHorizontal = theme.spacing.md;
    } else if (size === 'large') {
      baseStyle.paddingVertical = theme.spacing.lg;
      baseStyle.paddingHorizontal = theme.spacing.xl;
    } else {
      baseStyle.paddingVertical = theme.spacing.md;
      baseStyle.paddingHorizontal = theme.spacing.lg;
    }

    if (variant === 'primary') {
      baseStyle.backgroundColor = theme.colors.primary;
    } else if (variant === 'secondary') {
      baseStyle.backgroundColor = theme.colors.secondary;
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
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}>
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' ? theme.colors.primary : '#FFFFFF'}
          style={{ marginRight: theme.spacing.sm }}
        />
      )}
      <Text style={[getTextStyle(), textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
};
