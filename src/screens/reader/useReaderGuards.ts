import React from 'react';
import { Platform } from 'react-native';

export function useReaderGuards() {
  const webScrollIdleRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const webProgrammaticScrollRef = React.useRef(false);
  const webProgrammaticScrollTimerRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const webScrollEpochRef = React.useRef(0);
  const chapterTurnLockRef = React.useRef(false);
  const chapterTurnUnlockTimerRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const clearWebScrollIdle = React.useCallback(() => {
    if (webScrollIdleRef.current) {
      clearTimeout(webScrollIdleRef.current);
      webScrollIdleRef.current = undefined;
    }
  }, []);

  const invalidateWebScrollSync = React.useCallback(() => {
    if (Platform.OS !== 'web') return;
    webScrollEpochRef.current += 1;
    clearWebScrollIdle();
  }, [clearWebScrollIdle]);

  const markWebProgrammaticScroll = React.useCallback(
    (duration = 220) => {
      if (Platform.OS !== 'web') return;
      webScrollEpochRef.current += 1;
      webProgrammaticScrollRef.current = true;
      clearWebScrollIdle();
      if (webProgrammaticScrollTimerRef.current) {
        clearTimeout(webProgrammaticScrollTimerRef.current);
      }
      webProgrammaticScrollTimerRef.current = setTimeout(() => {
        webProgrammaticScrollRef.current = false;
        webScrollEpochRef.current += 1;
      }, duration);
    },
    [clearWebScrollIdle],
  );

  const markUserWebScroll = React.useCallback(() => {
    if (Platform.OS !== 'web') return;
    webProgrammaticScrollRef.current = false;
    webScrollEpochRef.current += 1;
  }, []);

  const lockChapterTurn = React.useCallback(() => {
    chapterTurnLockRef.current = true;
    if (chapterTurnUnlockTimerRef.current) {
      clearTimeout(chapterTurnUnlockTimerRef.current);
    }
  }, []);

  const unlockChapterTurnSoon = React.useCallback((delay = 180) => {
    if (chapterTurnUnlockTimerRef.current) {
      clearTimeout(chapterTurnUnlockTimerRef.current);
    }
    chapterTurnUnlockTimerRef.current = setTimeout(() => {
      chapterTurnLockRef.current = false;
    }, delay);
  }, []);

  React.useEffect(
    () => () => {
      clearWebScrollIdle();
      if (webProgrammaticScrollTimerRef.current) {
        clearTimeout(webProgrammaticScrollTimerRef.current);
      }
      if (chapterTurnUnlockTimerRef.current) {
        clearTimeout(chapterTurnUnlockTimerRef.current);
      }
    },
    [clearWebScrollIdle],
  );

  return {
    chapterTurnLockRef,
    clearWebScrollIdle,
    invalidateWebScrollSync,
    lockChapterTurn,
    markUserWebScroll,
    markWebProgrammaticScroll,
    unlockChapterTurnSoon,
    webProgrammaticScrollRef,
    webScrollEpochRef,
    webScrollIdleRef,
  };
}
