import React from 'react';
import { Text as RNText, TextStyle, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface TextProps {
  children: React.ReactNode;
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label';
  color?: 'primary' | 'secondary' | 'text' | 'textSecondary' | 'error';
  style?: TextStyle;
  numberOfLines?: number;
}

export const Text: React.FC<TextProps> = ({
  children,
  variant = 'body',
  color = 'text',
  style,
  numberOfLines,
}) => {
  const { theme } = useTheme();

  const getVariantStyle = (): TextStyle => {
    switch (variant) {
      case 'h1':
        return {
          fontSize: theme.fontSize.xxl,
          fontWeight: 'bold',
        };
      case 'h2':
        return {
          fontSize: theme.fontSize.xl,
          fontWeight: 'bold',
        };
      case 'h3':
        return {
          fontSize: theme.fontSize.lg,
          fontWeight: '600',
        };
      case 'label':
        return {
          fontSize: theme.fontSize.sm,
          fontWeight: '600',
        };
      case 'caption':
        return {
          fontSize: theme.fontSize.xs,
        };
      default:
        return {
          fontSize: theme.fontSize.md,
        };
    }
  };

  const getColorStyle = (): TextStyle => {
    switch (color) {
      case 'primary':
        return { color: theme.colors.primary };
      case 'secondary':
        return { color: theme.colors.secondary };
      case 'textSecondary':
        return { color: theme.colors.textSecondary };
      case 'error':
        return { color: theme.colors.error };
      default:
        return { color: theme.colors.text };
    }
  };

  return (
    <RNText
      style={[getVariantStyle(), getColorStyle(), style]}
      numberOfLines={numberOfLines}>
      {children}
    </RNText>
  );
};
