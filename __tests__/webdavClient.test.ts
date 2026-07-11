import {
  deleteWebDavBackup,
  downloadWebDavBackup,
  listWebDavBackups,
  testWebDavConnection,
  uploadWebDavBackup,
  WebDavConfig,
} from '../src/services/webdav/client';

const config: WebDavConfig = {
  endpoint: 'https://dav.example.com/dav/',
  username: 'reader',
  password: 'app-password',
};

const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/dav/qingdu-backups/</d:href><d:propstat><d:prop><d:resourcetype><d:collection /></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/qingdu-backups/qingdu-backup-2026-07-11.swellbackup</d:href><d:propstat><d:prop><d:getcontentlength>123</d:getcontentlength><d:getlastmodified>Fri, 11 Jul 2026 08:00:00 GMT</d:getlastmodified><d:resourcetype /></d:prop></d:propstat></d:response>
</d:multistatus>`;

const response = (status: number, body = '') =>
  ({
    status,
    text: jest.fn().mockResolvedValue(body),
    arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
  }) as unknown as Response;

describe('WebDAV client', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  it('仅接受 HTTPS 地址', async () => {
    await expect(testWebDavConnection({ ...config, endpoint: 'http://dav.example.com' }))
      .rejects.toThrow('HTTPS');
  });

  it('创建目录后上传备份', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201))
      .mockResolvedValueOnce(response(201));

    await uploadWebDavBackup(config, 'qingdu-backup-1.swellbackup', new Uint8Array([1, 2]));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'MKCOL' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[1][0]).toContain('qingdu-backup-1.swellbackup');
  });

  it('解析并过滤远端备份文件', async () => {
    fetchMock.mockResolvedValue(response(207, xml));

    await expect(listWebDavBackups(config)).resolves.toEqual([
      expect.objectContaining({
        name: 'qingdu-backup-2026-07-11.swellbackup',
        size: 123,
        url: 'https://dav.example.com/dav/qingdu-backups/qingdu-backup-2026-07-11.swellbackup',
      }),
    ]);
  });

  it('下载与删除远端备份', async () => {
    const file = {
      name: 'qingdu-backup-1.swellbackup',
      size: 3,
      modifiedAt: null,
      url: 'https://dav.example.com/dav/qingdu-backups/qingdu-backup-1.swellbackup',
    };
    fetchMock.mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(204));

    await expect(downloadWebDavBackup(config, file)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await deleteWebDavBackup(config, file);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });
});
