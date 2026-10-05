import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog, type ConfirmOptions } from './ui';

export type { ConfirmOptions };

/**
 * アプリの中に出す確認ダイアログ (ブラウザの confirm はアプリ内ブラウザで出ないことがあるため)。
 * [確認する関数, 表示する要素] を返すので、要素はコンポーネントのどこかに置く。
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [req, setReq] = useState<{ o: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ o, resolve })), []);
  const answer = (ok: boolean) => {
    req!.resolve(ok);
    setReq(null);
  };
  // ほかのモーダルの中から開いても一番上に出るよう、body の直下に置く
  const ui = req ? createPortal(<ConfirmDialog {...req.o} onAnswer={answer} />, document.body) : null;
  return [ask, ui];
}

/** 図案を削除するときの確認 */
export function deleteConfirm(names: string[], includesOpen: boolean): ConfirmOptions {
  return {
    title: '図案を削除',
    message: (
      <>
        <p>{names.length === 1 ? `「${names[0]}」を削除しますか？` : `えらんだ${names.length}件の図案を削除しますか？`}</p>
        {includesOpen ? <p className="hint">いま編集中の図案も閉じます。</p> : null}
        <p className="hint">削除したあとすぐなら、「元に戻す」で戻せます。</p>
      </>
    ),
    ok: '削除する',
    danger: true,
  };
}
