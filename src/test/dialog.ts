/** テスト用: アプリ内の確認ダイアログを操作する */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** 確認ダイアログが出るのを待って、ボタンを押す */
export async function answerConfirm(button: string | RegExp) {
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: button }));
}
