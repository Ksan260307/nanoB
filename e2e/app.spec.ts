import { expect, test } from '@playwright/test';
import { colorCount, makePng, openTab, shapesPng, tapCanvas, totalBeads, waitConverted } from './helpers';

test.beforeEach(async ({ page }) => {
  // 外部への通信 (画像検索) はテストではすべて止める
  await page.route('https://api.openverse.org/**', (route) => route.abort());
  await page.goto('/');
});

test('トップ画面が表示され、横にはみ出さない', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ナノビーズ図案メーカー' })).toBeVisible();
  await expect(page.getByRole('button', { name: /画像から作る/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /白紙から作る/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /ハート/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('サンプルから図案を作り、カラーチャートを見る', async ({ page }) => {
  await page.getByRole('button', { name: /いちご/ }).click();
  await waitConverted(page);
  await expect(page.getByText('よこ56 × たて56')).toBeVisible();
  expect(await colorCount(page)).toBeGreaterThan(2);
  const rows = page.locator('.chart-row');
  expect(await rows.count()).toBeGreaterThan(2);
  // 色をタップすると、その色だけ表示
  await rows.first().locator('.chart-main').click();
  await expect(page.locator('.focus-chip')).toBeVisible();
  await page.locator('.focus-chip').getByRole('button', { name: '解除' }).click();
  await expect(page.locator('.focus-chip')).toBeHidden();
});

test('画像ファイルを読み込み、大きさを変える', async ({ page }) => {
  await page.locator('[data-testid=image-input]').first().setInputFiles({ name: 'shapes.png', mimeType: 'image/png', buffer: shapesPng() });
  await waitConverted(page);
  await expect(page.getByLabel('図案の名前')).toHaveValue('shapes');
  await page.getByRole('button', { name: /1枚/ }).first().click();
  await waitConverted(page);
  await expect(page.getByText('よこ28 × たて28')).toBeVisible();
  await expect(page.getByText(/約 8\.0 × 8\.0 cm/)).toBeVisible();
  expect(await totalBeads(page)).toBe(28 * 28);
});

test('背景を自動で透明にすると、ビーズの数が減る', async ({ page }) => {
  await page.locator('[data-testid=image-input]').first().setInputFiles({ name: 'shapes.png', mimeType: 'image/png', buffer: shapesPng() });
  await waitConverted(page);
  const before = await totalBeads(page);
  await openTab(page, /画像/);
  await page.getByRole('radio', { name: '自動' }).click();
  await waitConverted(page);
  await expect.poll(() => totalBeads(page)).toBeLessThan(before * 0.6);
  await openTab(page, /画像/);
  await page.getByRole('radio', { name: 'しない' }).click();
  await waitConverted(page);
  await expect.poll(() => totalBeads(page)).toBe(before);
});

test('背景を手動で指定する画面 (拡大して指定できる)', async ({ page, isMobile }) => {
  await page.locator('[data-testid=image-input]').first().setInputFiles({ name: 'shapes.png', mimeType: 'image/png', buffer: shapesPng() });
  await waitConverted(page);
  await openTab(page, /画像/);
  await page.getByRole('radio', { name: '手動で指定' }).click();
  const dialog = page.getByRole('dialog', { name: '背景を透明にする' });
  await expect(dialog).toBeVisible();
  const canvas = dialog.locator('.bg-preview canvas');
  await expect(canvas).toBeVisible();
  // 拡大・縮小・全体表示
  await dialog.getByRole('button', { name: '拡大' }).click();
  await dialog.getByRole('button', { name: '全体を表示' }).click();
  // 上のまん中 (白い背景) をタップ → 背景が消える
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.1;
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(dialog.getByText('指定: 消す 1か所・残す 0か所')).toBeVisible();
  await expect(dialog.getByText(/画像の [1-9][0-9]*% が透明になります/)).toBeVisible();
  await dialog.getByRole('button', { name: /この設定にする/ }).click();
  await waitConverted(page);
  expect(await totalBeads(page)).toBeLessThan(56 * 56);
});

test('色の数をしぼる', async ({ page }) => {
  await page.getByRole('button', { name: /ゆうやけ/ }).click();
  await waitConverted(page);
  await openTab(page, /^.*色$/);
  await page.getByLabel('色の数をしぼる').check({ force: true });
  const slider = page.getByLabel('最大の色数');
  await slider.focus();
  for (let i = 0; i < 12; i++) await slider.press('ArrowLeft');
  await waitConverted(page);
  await expect.poll(() => colorCount(page)).toBeLessThanOrEqual(3);
});

test('白紙から作る: ペンで置く・元に戻す・やり直し', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: /白紙から作る/ }).click();
  await page.getByRole('button', { name: 'この大きさではじめる' }).click();
  await expect(page.getByRole('tab', { name: /編集/ })).toHaveAttribute('aria-selected', 'true');
  await tapCanvas(page, 0.5, 0.45, isMobile);
  expect(await totalBeads(page)).toBe(1);
  await page.getByRole('button', { name: '元に戻す' }).click();
  expect(await totalBeads(page)).toBe(0);
  await page.getByRole('button', { name: 'やり直し' }).click();
  expect(await totalBeads(page)).toBe(1);
});

test('塗りつぶし・スポイト・消しゴム', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: /白紙から作る/ }).click();
  await page.getByRole('button', { name: 'この大きさではじめる' }).click();
  await page.getByRole('radio', { name: /塗りつぶし/ }).click();
  await tapCanvas(page, 0.5, 0.45, isMobile);
  expect(await totalBeads(page)).toBe(28 * 28);
  await openTab(page, /編集/);
  await page.getByRole('radio', { name: /消しゴム/ }).click();
  await tapCanvas(page, 0.5, 0.45, isMobile);
  expect(await totalBeads(page)).toBe(28 * 28 - 1);
});

test('カラーチャートから色を差し替える', async ({ page }) => {
  await page.getByRole('button', { name: /ハート/ }).click();
  await waitConverted(page);
  await openTab(page, /チャート/);
  const first = page.locator('.chart-row').first();
  const name = await first.locator('.chart-name strong').innerText();
  await first.getByRole('button', { name: /別の色に差し替える/ }).click();
  const dialog = page.getByRole('dialog', { name: `「${name}」を別の色にする` });
  await dialog.locator('.near-item').first().click();
  await waitConverted(page);
  await expect(page.locator('.toast')).toContainText('差し替えました');
  await expect(page.locator('.chart-name strong', { hasText: new RegExp(`^${name}$`) })).toHaveCount(0);
});

test('画像 (PNG) と印刷用 PDF を保存できる', async ({ page }) => {
  await page.getByRole('button', { name: /ねこ/ }).click();
  await waitConverted(page);
  await openTab(page, /保存/);
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /画像（PNG）を保存/ }).click()]);
  expect(png.suggestedFilename()).toMatch(/_nanobeads\.png$/);
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /PDFを保存/ }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/_nanobeads\.pdf$/);
  const stream = await pdf.createReadStream();
  const head = await new Promise<string>((resolve) => stream.once('data', (d: Buffer) => resolve(d.subarray(0, 5).toString('latin1'))));
  expect(head).toBe('%PDF-');
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /ファイルに書き出す/ }).click()]);
  expect(json.suggestedFilename()).toMatch(/\.nanobeads\.json$/);
});

test('自動保存され、再読み込み後に「つづきから」開ける', async ({ page }) => {
  await page.getByRole('button', { name: /白紙から作る/ }).click();
  await page.getByRole('button', { name: 'この大きさではじめる' }).click();
  await page.getByLabel('図案の名前').first().fill('E2Eテスト図案');
  await page.waitForTimeout(1500);
  await page.reload();
  const recent = page.locator('.recent-item', { hasText: 'E2Eテスト図案' });
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(page.getByLabel('図案の名前').first()).toHaveValue('E2Eテスト図案');
  // マイ図案から削除できる
  await page.getByRole('button', { name: 'マイ図案' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'E2Eテスト図案を削除' }).click();
  await expect(page.getByRole('button', { name: 'E2Eテスト図案を削除' })).toHaveCount(0);
});

test('「トップに戻る」ボタンでトップ画面へ (図案は「つづきから」に残る)', async ({ page }) => {
  await page.getByRole('button', { name: /白紙から作る/ }).click();
  await page.getByRole('button', { name: 'この大きさではじめる' }).click();
  await page.getByLabel('図案の名前').first().fill('戻るテスト');
  await page.getByRole('button', { name: 'トップに戻る' }).click();
  await expect(page.getByRole('heading', { name: 'ナノビーズ図案メーカー' })).toBeVisible();
  await expect(page.locator('.toast')).toContainText('自動で保存されています');
  await expect(page.locator('.recent-item', { hasText: '戻るテスト' })).toBeVisible();
});

test('つくるモード: 色をえらんで置いたことにする', async ({ page }) => {
  await page.getByRole('button', { name: /ハート/ }).click();
  await waitConverted(page);
  await openTab(page, /保存/);
  await page.getByRole('button', { name: /つくるモードをはじめる/ }).click();
  const build = page.getByRole('dialog', { name: 'つくるモード' });
  await expect(build).toBeVisible();
  await expect(build.getByText(/0% 完成/)).toBeVisible();
  await build.locator('.build-color').first().click();
  await build.getByRole('button', { name: /この色をぜんぶ置いた/ }).click();
  await expect(build.getByText(/^[1-9]\d*% 完成/)).toBeVisible();
  await build.getByRole('button', { name: /もどる/ }).click();
  await expect(build).toBeHidden();
});

test('拡大・縮小・表示の切り替え', async ({ page }) => {
  await page.getByRole('button', { name: /ハート/ }).click();
  await waitConverted(page);
  await page.getByRole('button', { name: '拡大' }).first().click();
  await page.getByRole('button', { name: '縮小' }).first().click();
  await page.getByRole('button', { name: '全体を表示' }).first().click();
  await page.getByRole('radio', { name: 'ドットで表示' }).click();
  await page.getByRole('radio', { name: '記号で表示' }).click();
  await page.getByRole('button', { name: '元の画像とくらべる' }).click();
  await expect(page.locator('.compare-chip')).toBeVisible();
});

test('ネットの画像検索 (APIはモック)', async ({ page }) => {
  const thumb = makePng(64, 64, (x, y) => (x < 32 === y < 32 ? [250, 200, 40, 255] : [40, 160, 90, 255]));
  await page.unroute('https://api.openverse.org/**');
  await page.route('https://api.openverse.org/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/thumb/')) {
      await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: thumb });
      return;
    }
    const p = Number(url.searchParams.get('page') || '1');
    const results = Array.from({ length: 20 }, (_, i) => {
      const id = `img-${(p - 1) * 20 + i}`;
      return {
        id,
        title: `テスト画像${(p - 1) * 20 + i}`,
        thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`,
        creator: '作者',
        license: 'cc0',
        license_version: '1.0',
      };
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ result_count: 240, results }),
    });
  });
  await page.locator('#start-search-input').fill('ねこ');
  await page.getByRole('button', { name: 'さがす' }).click();
  const dialog = page.getByRole('dialog', { name: 'ネットで画像をさがす' });
  await expect(dialog.getByText(/100件見つかりました/)).toBeVisible();
  await expect(dialog.locator('.search-item')).toHaveCount(100);
  await dialog.locator('.search-item').nth(5).click();
  await dialog.getByRole('button', { name: /この画像で作る/ }).click();
  await waitConverted(page);
  await expect(page.getByLabel('図案の名前').first()).toHaveValue('テスト画像5');
  await openTab(page, /画像/);
  await expect(page.locator('.credit')).toContainText('作者');
});

test('画面の大きさに合わせたレイアウト', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: /ハート/ }).click();
  await waitConverted(page);
  const vp = page.viewportSize()!;
  const tabs = (await page.locator('.tabs').boundingBox())!;
  const panel = (await page.locator('.panel').boundingBox())!;
  if (vp.width >= 900) {
    // パソコン・iPad横: 右側にパネル
    expect(panel.x).toBeGreaterThan(vp.width / 2);
  } else {
    // スマホ・iPad縦: 下にタブ
    expect(tabs.y + tabs.height).toBeGreaterThan(vp.height - 120);
    // パネルをたたむとキャンバスが広がる
    const before = (await page.locator('.stage').boundingBox())!.height;
    await page.getByRole('button', { name: '設定をたたむ' }).click();
    await expect.poll(async () => (await page.locator('.stage').boundingBox())!.height).toBeGreaterThan(before);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, testInfo.project.name).toBeLessThanOrEqual(0);
});
