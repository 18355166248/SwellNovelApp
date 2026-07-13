import { fromByteArray } from 'base64-js';
import { strToU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { Platform } from 'react-native';

export interface WebDavConfig {
  endpoint: string;
  username: string;
  password: string;
  directory?: string;
}

export interface WebDavBackupFile {
  name: string;
  size: number;
  modifiedAt: number | null;
  url: string;
}

const DEFAULT_DIRECTORY = 'qingdu-backups';

const asArray = <T,>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const valueOf = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as { '#text': unknown })['#text']);
  }
  return '';
};

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

const normalizedDirectory = (directory?: string) =>
  (directory || DEFAULT_DIRECTORY)
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);

const normalizedConfig = (config: WebDavConfig) => {
  const endpointUrl = new URL(config.endpoint.trim());
  if (endpointUrl.protocol !== 'https:') {
    throw new Error('WebDAV 地址必须使用 HTTPS');
  }
  if (!config.username.trim() || !config.password) {
    throw new Error('请填写 WebDAV 用户名和密码');
  }
  endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/+$/, '')}/`;
  // iOS RN 的 URL polyfill 不可靠支持 URL 对象作为 base；统一返回字符串，避免真机抛 Invalid base URL。
  return {
    endpoint: endpointUrl.toString(),
    directory: normalizedDirectory(config.directory),
  };
};

const pathUrl = (config: WebDavConfig, name?: string) => {
  const { endpoint, directory } = normalizedConfig(config);
  const parts = [...directory, ...(name ? [name] : [])].map(encodeURIComponent);
  return new URL(parts.join('/'), endpoint).toString();
};

const headersFor = (config: WebDavConfig): Record<string, string> => ({
  Authorization: `Basic ${fromByteArray(strToU8(`${config.username}:${config.password}`))}`,
});

const errorFor = (response: Response) => {
  if (response.status === 401 || response.status === 403) {
    return new Error('WebDAV 认证失败，请检查地址、用户名和密码');
  }
  if (response.status === 507) {
    return new Error('WebDAV 存储空间不足');
  }
  return new Error(`WebDAV 请求失败（HTTP ${response.status}）`);
};

const webProxyFetch = async (url: string, init: RequestInit) => {
  const payload = init.body
    ? fromByteArray(new Uint8Array(init.body as ArrayBuffer))
    : undefined;
  return fetch('/api/webdav', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: init.method,
      headers: init.headers,
      body: payload,
    }),
  });
};

const request = async (
  config: WebDavConfig,
  url: string,
  init: RequestInit,
  accepted: number[],
) => {
  let response: Response;
  try {
    response = await (Platform.OS === 'web' ? webProxyFetch(url, {
      ...init,
      headers: { ...headersFor(config), ...init.headers },
    }) : fetch(url, {
      ...init,
      headers: { ...headersFor(config), ...init.headers },
    }));
  } catch {
    throw new Error('无法连接 WebDAV 服务，请检查网络和地址');
  }
  if (!accepted.includes(response.status)) throw errorFor(response);
  return response;
};

const ensureDirectory = async (config: WebDavConfig) => {
  const { endpoint, directory } = normalizedConfig(config);
  const segments: string[] = [];
  for (const segment of directory) {
    segments.push(segment);
    const url = new URL(segments.map(encodeURIComponent).join('/'), endpoint).toString();
    await request(config, url, { method: 'MKCOL' }, [201, 405]);
  }
};

export const testWebDavConnection = async (config: WebDavConfig) => {
  await ensureDirectory(config);
  await request(config, pathUrl(config), { method: 'PROPFIND', headers: { Depth: '0' } }, [207]);
};

export const uploadWebDavBackup = async (
  config: WebDavConfig,
  name: string,
  bytes: Uint8Array,
) => {
  if (!name.endsWith('.swellbackup')) {
    throw new Error('只能上传 .swellbackup 备份文件');
  }
  await ensureDirectory(config);
  const payload = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  await request(
    config,
    pathUrl(config, name),
    {
      method: 'PUT',
      body: payload,
      headers: { 'Content-Type': 'application/vnd.swellnovel.backup+zip' },
    },
    [200, 201, 204],
  );
};

export const listWebDavBackups = async (config: WebDavConfig) => {
  const response = await request(
    config,
    pathUrl(config),
    { method: 'PROPFIND', headers: { Depth: '1' } },
    [207],
  );
  const document = parser.parse(await response.text()) as Record<string, unknown>;
  const root = document['d:multistatus'] ?? document.multistatus;
  const responses = asArray(
    (root as Record<string, unknown> | undefined)?.['d:response'] ??
      (root as Record<string, unknown> | undefined)?.response,
  );

  return responses
    .map(responseNode => {
      const responseObject = responseNode as Record<string, unknown>;
      const href = valueOf(responseObject['d:href'] ?? responseObject.href);
      const propStats = asArray(responseObject['d:propstat'] ?? responseObject.propstat);
      const prop = propStats
        .map(item => (item as Record<string, unknown>)['d:prop'] ?? (item as Record<string, unknown>).prop)
        .find(Boolean) as Record<string, unknown> | undefined;
      const resourceType = prop?.['d:resourcetype'] ?? prop?.resourcetype;
      const isCollection = Boolean(
        resourceType &&
          typeof resourceType === 'object' &&
          ('d:collection' in resourceType || 'collection' in resourceType),
      );
      const decodedPath = decodeURIComponent(href.split('?')[0]);
      const name = decodedPath.split('/').filter(Boolean).pop() || '';
      return {
        name,
        size: Number(valueOf(prop?.['d:getcontentlength'] ?? prop?.getcontentlength)) || 0,
        modifiedAt: (() => {
          const value = Date.parse(valueOf(prop?.['d:getlastmodified'] ?? prop?.getlastmodified));
          return Number.isNaN(value) ? null : value;
        })(),
        // 服务端 href 可能是绝对路径或带重复 dav 前缀；后续操作统一使用已校验配置重建 URL。
        url: pathUrl(config, name),
        isCollection,
      };
    })
    .filter(file => !file.isCollection && file.name.endsWith('.swellbackup'))
    .map(({ isCollection: _isCollection, ...file }) => file)
    .sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
};

export const downloadWebDavBackup = async (
  config: WebDavConfig,
  file: WebDavBackupFile,
) => {
  const response = await request(config, pathUrl(config, file.name), { method: 'GET' }, [200]);
  return new Uint8Array(await response.arrayBuffer());
};

export const deleteWebDavBackup = async (
  config: WebDavConfig,
  file: WebDavBackupFile,
) => {
  await request(config, pathUrl(config, file.name), { method: 'DELETE' }, [200, 204]);
};
