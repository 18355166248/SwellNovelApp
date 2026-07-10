/** Jest 只验证应用集成渲染，不访问真实沙箱文件系统。 */
const RNFS = {
  DocumentDirectoryPath: '/mock-documents',
  CachesDirectoryPath: '/mock-caches',
  exists: jest.fn(async () => false),
  readFile: jest.fn(async () => ''),
  writeFile: jest.fn(async () => undefined),
  mkdir: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
  downloadFile: jest.fn(() => ({
    promise: Promise.resolve({ statusCode: 200 }),
  })),
};

module.exports = RNFS;
