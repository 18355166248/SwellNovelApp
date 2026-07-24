import { searchNovels } from '../src/services/search/novelSearch';
import { fetchHtml } from '../src/services/http/fetchHtml';

jest.mock('../src/services/http/fetchHtml', () => ({
  fetchHtml: jest.fn(),
}));

jest.mock('../src/services/discover/sourceRecommendations', () => ({
  searchSourceCatalogs: jest.fn(async () => []),
}));

const mockFetchHtml = fetchHtml as jest.MockedFunction<typeof fetchHtml>;

describe('searchNovels', () => {
  beforeEach(() => mockFetchHtml.mockReset());

  it('凡人修仙传优先返回已核验的明智屋逐章目录', async () => {
    await expect(searchNovels('凡人修仙传')).resolves.toEqual([
      {
        url: 'https://tw.mingzw.net/mzwbook/17482.html',
        title: '凡人修仙传',
        sourceName: '明智屋中文网',
      },
    ]);
    expect(mockFetchHtml).not.toHaveBeenCalled();
  });

  it('书名简称也锁定明智屋，不回退到书库 TXT 分节结果', async () => {
    await expect(searchNovels('凡人')).resolves.toEqual([
      {
        url: 'https://tw.mingzw.net/mzwbook/17482.html',
        title: '凡人修仙传',
        sourceName: '明智屋中文网',
      },
    ]);
    expect(mockFetchHtml).not.toHaveBeenCalled();
  });
});
