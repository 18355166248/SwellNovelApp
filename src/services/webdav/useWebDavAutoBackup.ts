/**
 * 前台阅读期间的 WebDAV 自动备份。
 *
 * iOS 不保证应用进入后台后的网络执行时间，因此在阅读器前台按阅读事件检查：
 * 左右翻页每 20 页、切章或定时器都会尝试，但只有连续阅读满 10 分钟才真正上传。
 */
import React from 'react';
import { AppState } from 'react-native';
import { useLibraryBackup } from '../backup/useLibraryBackup';
import { loadWebDavCredentials, saveWebDavCredentials } from './credentials';
import { uploadWebDavBackup, WebDavConfig } from './client';

export const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000;
export const AUTO_BACKUP_PAGE_TURNS = 20;
const CHECK_INTERVAL_MS = 60 * 1000;
const EVENT_BACKUP_DEBOUNCE_MS = 800;
const AUTO_BACKUP_FILE_NAME = 'qingdu-auto-latest.swellbackup';

interface ReadingPosition {
  chapterId: string;
  pageIndex: number;
  pageMode: 'scroll' | 'page';
}

export function useWebDavAutoBackup() {
  const { hydrated, createBackupArchive } = useLibraryBackup();
  const archiveRef = React.useRef(createBackupArchive);
  const configRef = React.useRef<WebDavConfig | null>(null);
  const readingStartedAtRef = React.useRef(Date.now());
  const uploadingRef = React.useRef(false);
  const eventTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastPositionRef = React.useRef<ReadingPosition | null>(null);
  const pageTurnsRef = React.useRef(0);

  React.useEffect(() => {
    archiveRef.current = createBackupArchive;
  });

  React.useEffect(() => {
    let active = true;
    loadWebDavCredentials()
      .then(config => {
        if (active && config) {
          // 旧版本保存的凭据没有该字段时按默认开启迁移；只有用户显式关闭才停用。
          configRef.current = {
            ...config,
            autoBackup: config.autoBackup !== false,
          };
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const tryAutoBackup = React.useCallback(async () => {
    const config = configRef.current;
    if (
      !hydrated ||
      !config?.autoBackup ||
      uploadingRef.current ||
      AppState.currentState !== 'active'
    ) {
      return;
    }
    const now = Date.now();
    // 所有触发方式共用同一门槛，确保“阅读满 10 分钟后上传一次”的设置说明与真实流量一致。
    const eligibleAt = Math.max(
      readingStartedAtRef.current,
      config.lastAutoBackupAt || 0,
    );
    if (now - eligibleAt < AUTO_BACKUP_INTERVAL_MS) return;

    uploadingRef.current = true;
    try {
      const backup = await archiveRef.current();
      // 自动备份始终覆盖同一个“最新”文件，避免事件触发时不断新增完整章节包撑满云盘。
      await uploadWebDavBackup(config, AUTO_BACKUP_FILE_NAME, backup.archive);
      const updated = { ...config, lastAutoBackupAt: Date.now() };
      configRef.current = updated;
      pageTurnsRef.current = 0;
      await saveWebDavCredentials(updated);
    } catch (error) {
      // 自动备份不打断阅读；用户仍可在 WebDAV 页手动重试并查看云端文件。
      console.warn('[WebDAV] auto backup failed', error);
    } finally {
      uploadingRef.current = false;
    }
  }, [hydrated]);

  const queueEventBackup = React.useCallback(() => {
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    // 等阅读进度 atom 和本地持久化完成一轮提交，归档时才能拿到刚落定的位置。
    eventTimerRef.current = setTimeout(() => {
      eventTimerRef.current = null;
      tryAutoBackup();
    }, EVENT_BACKUP_DEBOUNCE_MS);
  }, [tryAutoBackup]);

  const trackReadingPosition = React.useCallback(
    (position: ReadingPosition) => {
      const previous = lastPositionRef.current;
      lastPositionRef.current = position;
      if (!previous) return;

      if (previous.chapterId !== position.chapterId) {
        // 切章是明确的阅读里程碑；无论本章页数多少都同步一次。
        pageTurnsRef.current = 0;
        queueEventBackup();
        return;
      }

      if (
        position.pageMode === 'page' &&
        previous.pageMode === 'page' &&
        previous.pageIndex !== position.pageIndex
      ) {
        pageTurnsRef.current += 1;
        if (pageTurnsRef.current >= AUTO_BACKUP_PAGE_TURNS) {
          pageTurnsRef.current = 0;
          queueEventBackup();
        }
      }
    },
    [queueEventBackup],
  );

  React.useEffect(() => {
    const timer = setInterval(() => {
      tryAutoBackup();
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [tryAutoBackup]);

  React.useEffect(
    () => () => {
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    },
    [],
  );

  return { trackReadingPosition };
}
