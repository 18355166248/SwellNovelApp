import React from 'react';
import { Text as RNText, TextStyle, StyleProp, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface TextProps {
  children: React.ReactNode;
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label';
  color?: 'primary' | 'secondary' | 'text' | 'textSecondary' | 'error';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
}

export const Text: React.FC<TextProps> = ({
  children,
  variant = 'body',
  color = 'text',
  style,
  numberOfLines,
  maxFontSizeMultiplier = 1.15,
}) => {
  const { theme } = useTheme();

  const getVariantStyle = (): TextStyle => {
    switch (variant) {
      case 'h1':
        return {
          fontSize: theme.fontSize.xxl,
          fontWeight: 'bold',
          lineHeight: theme.fontSize.xxl * 1.2,
          letterSpacing: 0.3,
        };
      case 'h2':
        return {
          fontSize: theme.fontSize.xl,
          fontWeight: 'bold',
          lineHeight: theme.fontSize.xl * 1.25,
          letterSpacing: 0.25,
        };
      case 'h3':
        return {
          fontSize: theme.fontSize.lg,
          fontWeight: Platform.select({ ios: '600', android: 'bold' }),
          lineHeight: theme.fontSize.lg * 1.3,
          letterSpacing: 0.2,
        };
      case 'label':
        return {
          fontSize: theme.fontSize.sm,
          fontWeight: Platform.select({ ios: '600', android: 'bold' }),
          lineHeight: theme.fontSize.sm * 1.2,
          letterSpacing: 0.2,
        };
      case 'caption':
        return {
          fontSize: theme.fontSize.xs,
          lineHeight: theme.fontSize.xs * 1.2,
          letterSpacing: 0.1,
        };
      default:
        return {
          fontSize: theme.fontSize.md,
          lineHeight: theme.fontSize.md * 1.5,
          letterSpacing: 0.15,
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
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {children}
    </RNText>
  );
};
