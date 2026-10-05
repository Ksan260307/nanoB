// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { indexOfCode } from '../data/palette';
import { YODOBASHI_IDS, yodobashiUrl } from '../data/shops';
import { useStore } from '../state/store';
import { ChartPanel } from './panels/ChartPanel';
import { EditPanel, UndoRedo } from './panels/EditPanel';

const RED = indexOfCode('80-15903');
const st = () => useStore.getState();

beforeEach(() => {
  st().closeProject();
  st().newFreeProject(2, 2, 'beads');
  st().beginStroke();
  st().paint([0], RED);
  st().endStroke(true);
});

describe('ヨドバシ.com へのリンク', () => {
  it('全55色の商品ページ・知らない品番は検索', () => {
    expect(Object.keys(YODOBASHI_IDS)).toHaveLength(55);
    expect(yodobashiUrl('80-15901')).toBe('https://www.yodobashi.com/product/100000001003070735/');
    expect(yodobashiUrl('99-99999')).toBe(`https://www.yodobashi.com/?word=${encodeURIComponent('カワダ 99-99999')}`);
  });

  it('カラーチャートの各色から開ける (新しいタブ)', () => {
    render(<ChartPanel />);
    const link = screen.getByRole('link', { name: 'あか（80-15903）をヨドバシ.comで見る' });
    expect(link).toHaveAttribute('href', 'https://www.yodobashi.com/product/100000001003070737/');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('編集の「元に戻す・やり直し」', () => {
  it('編集パネルのボタン', async () => {
    render(<EditPanel />);
    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(st().cells[0]).not.toBe(RED);
    await userEvent.click(screen.getByRole('button', { name: 'やり直し' }));
    expect(st().cells[0]).toBe(RED);
  });

  it('キャンバス上の小さいボタン (履歴が無ければ押せない)', async () => {
    act(() => useStore.setState({ past: [], future: [] }));
    render(<UndoRedo compact />);
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'やり直し' })).toBeDisabled();
  });
});
