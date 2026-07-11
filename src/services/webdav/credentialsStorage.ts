import * as Keychain from 'react-native-keychain';
import type { WebDavCredentials } from './credentials';

const SERVICE = 'com.swellnovel.webdav';

export async function loadStoredWebDavCredentials(): Promise<WebDavCredentials | null> {
  const result = await Keychain.getGenericPassword({ service: SERVICE });
  if (!result) return null;
  try {
    return JSON.parse(result.password) as WebDavCredentials;
  } catch {
    await Keychain.resetGenericPassword({ service: SERVICE });
    return null;
  }
}

export async function saveStoredWebDavCredentials(credentials: WebDavCredentials) {
  await Keychain.setGenericPassword('webdav', JSON.stringify(credentials), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredWebDavCredentials() {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
