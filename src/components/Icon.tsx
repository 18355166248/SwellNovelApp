import React from 'react';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type SizeToken = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface IconProps {
  name: string;
  size?: number | SizeToken;
  color?: string | 'primary' | 'secondary' | 'text' | 'textSecondary' | 'error';
  style?: TextStyle;
}

export const Icon: React.FC<IconProps> = ({ name, size = 'md', color = 'text', style }) => {
  const { theme } = useTheme();
  const sizeMap: Record<SizeToken, number> = {
    xs: theme.fontSize.xs,
    sm: theme.fontSize.sm,
    md: theme.fontSize.md,
    lg: theme.fontSize.lg,
    xl: theme.fontSize.xl,
  };
  const finalSize = typeof size === 'number' ? size : sizeMap[size];

  const colorMap: Record<string, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.secondary,
    text: theme.colors.text,
    textSecondary: theme.colors.textSecondary,
    error: theme.colors.error,
  };
  const finalColor = typeof color === 'string' && colorMap[color] ? colorMap[color] : (color as string);

  return <MaterialIcon name={name} size={finalSize} color={finalColor || theme.colors.text} style={style} />;
};
