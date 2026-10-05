// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { indexOfCode } from '../data/palette';
import { ColorGrid, ColorPickerDialog } from './ColorGrid';
import { Icon } from './Icon';
import { Bead, Modal, Section, Segmented, Slider, Stepper, Tip, Toggle } from './ui';

describe('Segmented', () => {
  it('選んだ値を通知し、選択中を示す', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="テスト"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'エー' },
          { value: 'b', label: 'ビー', icon: 'pencil' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'エー' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'ビー' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Toggle', () => {
  it('オン・オフ', async () => {
    const onChange = vi.fn();
    render(<Toggle label="背景を消す" checked={false} onChange={onChange} hint="説明" />);
    await userEvent.click(screen.getByLabelText('背景を消す'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('説明')).toBeInTheDocument();
  });
});

describe('Stepper', () => {
  it('増やす・減らす・直接入力 (範囲内に収める)', async () => {
    const onChange = vi.fn();
    render(<Stepper label="よこ" value={5} min={1} max={10} onChange={onChange} suffix="枚" />);
    await userEvent.click(screen.getByRole('button', { name: 'よこを増やす' }));
    expect(onChange).toHaveBeenLastCalledWith(6);
    await userEvent.click(screen.getByRole('button', { name: 'よこを減らす' }));
    expect(onChange).toHaveBeenLastCalledWith(4);
    const input = screen.getByLabelText('よこ');
    await userEvent.clear(input);
    await userEvent.type(input, '99{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('上限・下限ではボタンが押せない', () => {
    render(<Stepper label="たて" value={1} min={1} max={1} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'たてを減らす' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'たてを増やす' })).toBeDisabled();
  });
});

describe('Slider', () => {
  it('動かすと少し遅れて通知・もどすボタン', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <Slider
        label="明るさ"
        value={10}
        min={-100}
        max={100}
        onChange={onChange}
        defaultValue={0}
        format={(v) => `${v}!`}
        leftLabel="暗い"
        rightLabel="明るい"
        hint="ヒント"
      />,
    );
    expect(screen.getByText('10!')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('明るさ'), { target: { value: '30' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onChange).toHaveBeenCalledWith(30);
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    vi.useRealTimers();
  });
});

describe('Modal', () => {
  it('Esc・背景のクリック・閉じるボタンで閉じる', async () => {
    const onClose = vi.fn();
    render(
      <Modal title="タイトル" onClose={onClose} footer={<button>OK</button>}>
        <p>中身</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'タイトル' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.pointerDown(document.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('表示部品', () => {
  it('Bead / Section / Tip / Icon', () => {
    render(
      <>
        <Bead color={indexOfCode('80-15903')} symbol="A" selected />
        <Bead color={indexOfCode('80-15924')} />
        <Bead color={999} />
        <Section title="見出し" icon="palette" aside={<span>右</span>}>
          本文
        </Section>
        <Tip tone="warn">注意</Tip>
        <Icon name="heart" title="ハート" />
      </>,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('見出し')).toBeInTheDocument();
    expect(screen.getByText('注意')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'ハート' })).toBeInTheDocument();
    expect(document.querySelector('.bead-clear')).not.toBeNull();
    expect(document.querySelector('.bead-empty')).not.toBeNull();
  });
});

describe('ColorGrid', () => {
  it('全色を系統ごとに表示し、選ぶと通知', async () => {
    const onSelect = vi.fn();
    const counts = new Int32Array(55);
    counts[0] = 12;
    render(<ColorGrid onSelect={onSelect} selected={0} checked={new Set([1])} counts={counts} />);
    expect(screen.getAllByRole('button')).toHaveLength(55);
    expect(screen.getByText('しろ・グレー・くろ')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('きいろ（80-15902）'));
    expect(onSelect).toHaveBeenCalledWith(indexOfCode('80-15902'));
  });

  it('色えらびダイアログ: 近い色から選べる', async () => {
    const onPick = vi.fn();
    render(<ColorPickerDialog title="えらぶ" onClose={() => {}} onPick={onPick} near={[indexOfCode('80-15907')]} extra={<p>追加</p>} />);
    expect(screen.getByText('近い色')).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('くろ')[0]);
    expect(onPick).toHaveBeenCalledWith(indexOfCode('80-15907'));
  });
});
