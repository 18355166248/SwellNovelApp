export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    success: string;
    warning: string;
    card: string;
    cardText: string;
    /** deep teal — CTAs, active tab, sticky action bar */
    accentDark: string;
    /** mid teal — links, progress fill, active highlight */
    accent: string;
    /** warm gold — covers, brightness accents */
    gold: string;
    /** terracotta — "有更新" badges, new-chapter markers */
    danger: string;
    /** slate — "完结" badges */
    badgeMuted: string;
    /** translucent tab/toolbar chrome background */
    tabBar: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  shadows: {
    sm: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
    md: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
    lg: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
  };
}

export const lightTheme: Theme = {
  colors: {
    primary: '#1f3d3a',
    secondary: '#2e6b5e',
    background: '#eceae3',
    surface: '#FFFFFF',
    text: '#22271f',
    textSecondary: '#7a8079',
    border: 'rgba(0,0,0,.07)',
    error: '#c25a3a',
    success: '#2e6b5e',
    warning: '#c9a15e',
    card: '#FFFFFF',
    cardText: '#22271f',
    accentDark: '#1f3d3a',
    accent: '#2e6b5e',
    gold: '#c9a15e',
    danger: '#c25a3a',
    badgeMuted: '#4a5a6e',
    tabBar: 'rgba(248,247,243,.92)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 8,
    },
  },
};

export const darkTheme: Theme = {
  colors: {
    primary: '#3a8f7d',
    secondary: '#4ea88f',
    background: '#16191a',
    surface: '#1e2224',
    text: '#d8d5cc',
    textSecondary: '#8b908c',
    border: 'rgba(255,255,255,.1)',
    error: '#d97a5a',
    success: '#4ea88f',
    warning: '#c9a15e',
    card: '#1e2224',
    cardText: '#d8d5cc',
    accentDark: '#3a8f7d',
    accent: '#4ea88f',
    gold: '#c9a15e',
    danger: '#d97a5a',
    badgeMuted: '#6d7c94',
    tabBar: 'rgba(24,28,29,.92)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 8,
      elevation: 8,
    },
  },
};
