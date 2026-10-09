import React from 'react';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import FeatherIcon from 'react-native-vector-icons/Feather';
import { TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type SizeToken = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface IconProps {
  name: string;
  family?: 'material' | 'feather';
  size?: number | SizeToken;
  color?: string | 'primary' | 'secondary' | 'text' | 'textSecondary' | 'error';
  style?: TextStyle;
}

export const Icon: React.FC<IconProps> = ({
  name,
  family = 'material',
  size = 'md',
  color = 'text',
  style,
}) => {
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
  const finalColor =
    typeof color === 'string' && colorMap[color]
      ? colorMap[color]
      : (color as string);

  const IconComponent = family === 'feather' ? FeatherIcon : MaterialIcon;
  return (
    <IconComponent
      name={name}
      size={finalSize}
      color={finalColor || theme.colors.text}
      style={style}
    />
  );
};
