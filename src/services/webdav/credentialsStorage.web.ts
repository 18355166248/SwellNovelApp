import type { WebDavCredentials } from './credentials';

const SESSION_KEY = 'swell-novel-webdav-session-v1';

export async function loadStoredWebDavCredentials(): Promise<WebDavCredentials | null> {
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebDavCredentials;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function saveStoredWebDavCredentials(credentials: WebDavCredentials) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(credentials));
}

export async function clearStoredWebDavCredentials() {
  window.sessionStorage.removeItem(SESSION_KEY);
}
