import { describe, expect, it, vi } from 'vitest';
import { buildSearchUrl, licenseLabel, MAX_PAGES, PAGE_SIZE, searchImages, SUGGESTIONS, TARGET_RESULTS, toResult, translateQuery } from './imageSearch';

function fakeImage(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `title ${id}`,
    thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`,
    creator: 'someone',
    license: 'by',
    license_version: '2.0',
    license_url: 'https://creativecommons.org/licenses/by/2.0/',
    foreign_landing_url: `https://example.com/${id}`,
    attribution: `"title ${id}" by someone`,
    width: 100,
    height: 80,
    mature: false,
    unstable__sensitivity: [],
    ...extra,
  };
}

function page(start: number, count = PAGE_SIZE) {
  return Array.from({ length: count }, (_, i) => fakeImage(`id${start + i}`));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('licenseLabel', () => {
  it('ライセンスの表示', () => {
    expect(licenseLabel('by', '2.0')).toBe('CC BY 2.0');
    expect(licenseLabel('by-sa', '4.0')).toBe('CC BY-SA 4.0');
    expect(licenseLabel('cc0', '1.0')).toBe('CC0（パブリックドメイン）');
    expect(licenseLabel('pdm', null)).toBe('パブリックドメイン');
    expect(licenseLabel(null, null)).toBe('不明');
    expect(licenseLabel('by', null)).toBe('CC BY');
  });
});

describe('toResult', () => {
  it('表示用の形に変換', () => {
    const r = toResult(fakeImage('abc'))!;
    expect(r.id).toBe('abc');
    expect(r.license).toBe('CC BY 2.0');
    expect(r.full).toBe('https://api.openverse.org/v1/images/abc/thumb/?full_size=true');
    expect(r.landingUrl).toBe('https://example.com/abc');
  });
  it('成人向け・センシティブな画像は除外', () => {
    expect(toResult(fakeImage('a', { mature: true }))).toBeNull();
    expect(toResult(fakeImage('b', { unstable__sensitivity: ['sensitive_text'] }))).toBeNull();
    expect(toResult({ id: '' } as never)).toBeNull();
  });
  it('足りない項目は補う', () => {
    const r = toResult({ id: 'x' })!;
    expect(r.title).toBe('無題');
    expect(r.creator).toBe('不明');
    expect(r.thumb).toContain('/x/thumb/');
  });
});

describe('buildSearchUrl', () => {
  it('検索条件をクエリにする', () => {
    const u = new URL(buildSearchUrl('ねこ ちゃん', 2, 'illustration'));
    expect(u.origin + u.pathname).toBe('https://api.openverse.org/v1/images/');
    expect(u.searchParams.get('q')).toBe('ねこ ちゃん');
    expect(u.searchParams.get('page')).toBe('2');
    expect(u.searchParams.get('page_size')).toBe(String(PAGE_SIZE));
    expect(u.searchParams.get('mature')).toBe('false');
    expect(u.searchParams.get('category')).toBe('illustration');
    expect(new URL(buildSearchUrl('a', 1, 'all')).searchParams.has('category')).toBe(false);
    expect(new URL(buildSearchUrl('a', 1, 'all', '123')).searchParams.get('_')).toBe('123');
  });
});

describe('searchImages', () => {
  it('空の検索ワードなら通信しない', async () => {
    const f = vi.fn();
    const r = await searchImages('  ', 'all', { fetchImpl: f });
    expect(f).not.toHaveBeenCalled();
    expect(r.results).toEqual([]);
  });

  it('約100件になるまで1ページずつ順番に取得する', async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      const p = Number(new URL(String(url)).searchParams.get('page'));
      return json({ result_count: 240, results: page((p - 1) * PAGE_SIZE) });
    });
    const progress: number[] = [];
    const r = await searchImages('cat', 'all', { fetchImpl: f as unknown as typeof fetch, onProgress: (x) => progress.push(x.length) });
    expect(r.results).toHaveLength(TARGET_RESULTS);
    expect(urls).toHaveLength(TARGET_RESULTS / PAGE_SIZE);
    expect(progress).toEqual([20, 40, 60, 80, 100]);
    expect(r.total).toBe(240);
    expect(r.rateLimited).toBe(false);
  });

  it('同じページが返ってきたらキャッシュを避けて取り直す', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      const p = Number(u.searchParams.get('page'));
      // 2ページ目以降はキャッシュの都合で1ページ目と同じものが返る (取り直すと正しい)
      const start = p > 1 && !u.searchParams.has('_') ? 0 : (p - 1) * PAGE_SIZE;
      return json({ result_count: 240, results: page(start) });
    });
    const r = await searchImages('cat', 'all', { fetchImpl: f as unknown as typeof fetch, target: 60 });
    expect(r.results).toHaveLength(60);
    expect(new Set(r.results.map((x) => x.id)).size).toBe(60);
  });

  it('結果が少なければ途中で終わる', async () => {
    const f = vi.fn(async () => json({ result_count: 5, results: page(0, 5) }));
    const r = await searchImages('rare', 'all', { fetchImpl: f as unknown as typeof fetch });
    expect(r.results).toHaveLength(5);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('最大ページ数で止まる', async () => {
    const f = vi.fn(async () => json({ result_count: 999, results: [] }));
    await searchImages('x', 'all', { fetchImpl: f as unknown as typeof fetch });
    expect(f.mock.calls.length).toBeLessThanOrEqual(MAX_PAGES);
  });

  it('回数制限 (429) を知らせる', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ result_count: 240, results: page(0) }))
      .mockResolvedValueOnce(new Response('', { status: 429 }));
    const r = await searchImages('cat', 'all', { fetchImpl: f as unknown as typeof fetch });
    expect(r.rateLimited).toBe(true);
    expect(r.results).toHaveLength(20);
    expect(r.failed).toBe(false);
  });

  it('通信エラーで結果が無ければ failed', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('network');
    });
    const r = await searchImages('cat', 'all', { fetchImpl: f as unknown as typeof fetch });
    expect(r.failed).toBe(true);
  });

  it('サーバーエラーで結果が無ければ failed / 400 は終わりの合図', async () => {
    const f500 = vi.fn(async () => new Response('', { status: 500 }));
    expect((await searchImages('cat', 'all', { fetchImpl: f500 as unknown as typeof fetch })).failed).toBe(true);
    const f400 = vi.fn(async () => new Response('', { status: 400 }));
    expect((await searchImages('cat', 'all', { fetchImpl: f400 as unknown as typeof fetch })).failed).toBe(false);
  });

  it('中止できる', async () => {
    const ctrl = new AbortController();
    const f = vi.fn(async () => {
      ctrl.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(searchImages('cat', 'all', { fetchImpl: f as unknown as typeof fetch, signal: ctrl.signal })).rejects.toThrow('aborted');
  });
});

describe('日本語のキーワード', () => {
  it('よく使うことばは英語に変換', () => {
    expect(translateQuery('ねこ')).toBe('cat');
    expect(translateQuery(' 猫 ')).toBe('cat');
    expect(translateQuery('いちご')).toBe('strawberry');
    expect(translateQuery('ドット絵')).toBe('pixel art');
    expect(translateQuery('しらないことば')).toBeNull();
  });
  it('おすすめのことばは全部変換できる', () => {
    for (const w of SUGGESTIONS) expect(translateQuery(w)).not.toBeNull();
  });
});
