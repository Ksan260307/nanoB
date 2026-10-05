import { useEffect, useRef, useState } from 'react';
import { importImage, type SourceImage } from '../lib/image';
import { searchImages, SUGGESTIONS, translateQuery, type SearchCategory, type SearchResult } from '../lib/imageSearch';
import { Icon } from './Icon';
import { Modal, Segmented, Tip } from './ui';

type Status = 'idle' | 'loading' | 'done' | 'error';

interface SearchState {
  status: Status;
  results: SearchResult[];
  total: number;
  usedQuery: string;
  translated: boolean;
  message?: string;
}

/** キーワードでネットの画像 (約100件) を探して選ぶ */
export function ImageSearchDialog({
  initialQuery = '',
  onClose,
  onPicked,
}: {
  initialQuery?: string;
  onClose: () => void;
  onPicked: (source: SourceImage) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<SearchCategory>('all');
  const [state, setState] = useState<SearchState>({ status: 'idle', results: [], total: 0, usedQuery: '', translated: false });
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const run = async (q: string, cat: SearchCategory) => {
    const text = q.trim();
    if (!text) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const translated = translateQuery(text);
    const used = translated ?? text;
    setSelected(null);
    setPickError('');
    setState({ status: 'loading', results: [], total: 0, usedQuery: used, translated: !!translated });
    try {
      const res = await searchImages(used, cat, {
        signal: ctrl.signal,
        onProgress: (results) => {
          if (!ctrl.signal.aborted) setState((s) => ({ ...s, results }));
        },
      });
      if (ctrl.signal.aborted) return;
      if (!res.results.length && res.rateLimited) {
        setState((s) => ({ ...s, status: 'error', message: '検索の回数が多すぎます。1分ほど待ってから、もう一度お試しください。' }));
      } else if (res.failed) {
        setState((s) => ({ ...s, status: 'error', message: 'うまく検索できませんでした。インターネットの接続を確認してください。' }));
      } else {
        setState((s) => ({
          ...s,
          status: 'done',
          results: res.results,
          total: res.total,
          message: res.rateLimited ? '回数制限のため、一部の結果を読み込めませんでした。' : undefined,
        }));
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setState((s) => ({ ...s, status: 'error', message: 'うまく検索できませんでした。' }));
    }
  };

  useEffect(() => {
    const t = initialQuery.trim() ? setTimeout(() => run(initialQuery, 'all'), 0) : undefined;
    return () => {
      clearTimeout(t);
      abortRef.current?.abort();
    };
    // 最初の1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async () => {
    if (!selected) return;
    setPicking(true);
    setPickError('');
    try {
      let src: SourceImage;
      try {
        src = await importImage(selected.full, selected.title);
      } catch {
        // 大きい画像を取れないときは一覧用の画像で
        src = await importImage(selected.thumb, selected.title);
      }
      onPicked({ ...src, credit: `「${selected.title}」 ${selected.creator}（${selected.license}）`, link: selected.landingUrl || undefined });
    } catch {
      setPickError('この画像は読み込めませんでした。別の画像をえらんでください。');
    } finally {
      setPicking(false);
    }
  };

  return (
    <Modal
      title="ネットで画像をさがす"
      onClose={onClose}
      wide
      className="search-modal"
      footer={
        selected ? (
          <div className="search-selected">
            <img src={selected.thumb} alt="" />
            <div className="search-selected-meta">
              <strong>{selected.title}</strong>
              <small>
                作者: {selected.creator} ・ {selected.license}
                {selected.landingUrl ? (
                  <>
                    {' '}
                    ・{' '}
                    <a href={selected.landingUrl} target="_blank" rel="noopener noreferrer">
                      元のページ
                    </a>
                  </>
                ) : null}
              </small>
              {pickError ? <small className="error-text">{pickError}</small> : null}
            </div>
            <button className="btn btn-primary" onClick={pick} disabled={picking}>
              <Icon name={picking ? 'sparkles' : 'check'} size={18} /> {picking ? '読み込み中…' : 'この画像で作る'}
            </button>
          </div>
        ) : undefined
      }
    >
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(query, category);
        }}
      >
        <Icon name="zoomIn" size={20} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: ねこ、さくら、ケーキ、pixel art"
          enterKeyHint="search"
          aria-label="検索するキーワード"
          autoFocus
        />
        <button className="btn btn-primary btn-small" type="submit" disabled={!query.trim() || state.status === 'loading'}>
          検索
        </button>
      </form>
      <Segmented
        small
        label="画像の種類"
        value={category}
        onChange={(c) => {
          setCategory(c);
          if (query.trim()) run(query, c);
        }}
        options={[
          { value: 'all', label: 'すべて' },
          { value: 'illustration', label: 'イラスト' },
          { value: 'photograph', label: '写真' },
        ]}
      />

      {state.status === 'idle' ? (
        <div className="suggestions">
          <span className="hint">たとえば：</span>
          {SUGGESTIONS.map((w) => (
            <button
              key={w}
              className="chip"
              onClick={() => {
                setQuery(w);
                run(w, category);
              }}
            >
              {w}
            </button>
          ))}
        </div>
      ) : null}

      {state.status === 'loading' ? (
        <div className="search-status" role="status">
          <span className="spinner" /> 「{state.usedQuery}」をさがしています…{state.results.length ? `（${state.results.length}件）` : ''}
        </div>
      ) : null}

      {state.status === 'error' ? <Tip tone="warn">{state.message}</Tip> : null}

      {state.status === 'done' || (state.status === 'loading' && state.results.length) ? (
        <>
          {state.status === 'done' ? (
            <p className="hint">
              {state.translated ? `「${query.trim()}」→「${state.usedQuery}」で検索 ・ ` : ''}
              {state.results.length
                ? `${state.results.length}件見つかりました。使いたい画像をタップしてください。`
                : '見つかりませんでした。別のことばで試してください（英語だと多く見つかります）。'}
            </p>
          ) : null}
          {state.message ? <Tip tone="warn">{state.message}</Tip> : null}
          <div className="search-grid">
            {state.results.map((r) => (
              <button
                key={r.id}
                className={`search-item ${selected?.id === r.id ? 'active' : ''}`}
                onClick={() => setSelected(r)}
                aria-pressed={selected?.id === r.id}
                title={`${r.title} / ${r.creator}`}
              >
                <img src={r.thumb} alt={r.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                {selected?.id === r.id ? (
                  <span className="search-check">
                    <Icon name="check" size={16} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <p className="hint small">
        画像は{' '}
        <a href="https://openverse.org/" target="_blank" rel="noopener noreferrer">
          Openverse
        </a>
        （クリエイティブ・コモンズ等の自由に使える画像の検索サービス）から表示しています。検索ワードは Openverse に送信されます。
        図案を配布・販売するときは、作者とライセンスを確認してください。
      </p>
    </Modal>
  );
}
