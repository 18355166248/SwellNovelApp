import React from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PAPER = '#eceae3';
const INK = '#1f3d3a';
const IVORY = '#f3ead6';

const APP_ICON = require('../../public/logo/200.png');
const VARIANT_COUNT = 3;

type Props = {
  onFinished: () => void;
};

export function AppLaunchSplash({ onFinished }: Props) {
  // 每次冷启动只选择一次，避免状态更新时版式跳变。
  const [variant] = React.useState(() =>
    Math.floor(Math.random() * VARIANT_COUNT),
  );
  const opacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onFinished();
        }
      });
    }, 520);

    return () => clearTimeout(timer);
  }, [onFinished, opacity]);

  const dark = variant === 1;
  const horizontal = variant === 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        dark ? styles.darkBackground : styles.paperBackground,
        { opacity },
      ]}>
      <View style={[styles.lockup, horizontal && styles.horizontalLockup]}>
        <Image
          accessibilityIgnoresInvertColors
          source={APP_ICON}
          style={[
            styles.logo,
            horizontal ? styles.horizontalLogo : styles.verticalLogo,
          ]}
        />
        <Text
          style={[
            styles.title,
            dark ? styles.lightTitle : styles.inkTitle,
            horizontal ? styles.horizontalTitle : styles.verticalTitle,
          ]}>
          轻读
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  paperBackground: {
    backgroundColor: PAPER,
  },
  darkBackground: {
    backgroundColor: INK,
  },
  lockup: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalLockup: {
    flexDirection: 'row',
  },
  logo: {
    borderRadius: 24,
  },
  verticalLogo: {
    width: 104,
    height: 104,
  },
  horizontalLogo: {
    width: 76,
    height: 76,
    borderRadius: 18,
  },
  title: {
    fontWeight: '700',
    letterSpacing: 2,
  },
  inkTitle: {
    color: INK,
  },
  lightTitle: {
    color: IVORY,
  },
  verticalTitle: {
    marginTop: 22,
    fontSize: 34,
  },
  horizontalTitle: {
    marginLeft: 20,
    fontSize: 38,
  },
});
