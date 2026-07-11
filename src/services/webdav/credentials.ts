import type { WebDavConfig } from './client';
import {
  clearStoredWebDavCredentials,
  loadStoredWebDavCredentials,
  saveStoredWebDavCredentials,
} from './credentialsStorage';

export type WebDavCredentials = WebDavConfig;

export const loadWebDavCredentials = () => loadStoredWebDavCredentials();

export const saveWebDavCredentials = (credentials: WebDavCredentials) =>
  saveStoredWebDavCredentials(credentials);

export const clearWebDavCredentials = () => clearStoredWebDavCredentials();
