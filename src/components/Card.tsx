import React, { useRef } from 'react';
import { View, StyleSheet, ViewStyle, Pressable, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  variant?: 'default' | 'elevated';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  onPress,
  variant = 'default',
}) => {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const cardStyle = [
    styles.card,
    {
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
    },
    variant === 'elevated' && theme.shadows.md,
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress}>
        <Animated.View
          style={[
            cardStyle,
            { transform: [{ scale }] },
          ]}
          onTouchStart={() => {
            Animated.spring(scale, {
              toValue: 0.98,
              useNativeDriver: true,
            }).start();
          }}
          onTouchEnd={() => {
            Animated.spring(scale, {
              toValue: 1,
              useNativeDriver: true,
            }).start();
          }}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
  },
});
