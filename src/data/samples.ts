/** トップ画面の「サンプルで試す」(public/samples の自作イラスト) */
export const SAMPLES = [
  { file: 'heart.svg', name: 'ハート', resample: 'sharp' as const },
  { file: 'cat.svg', name: 'ねこ', resample: 'sharp' as const },
  { file: 'strawberry.svg', name: 'いちご', resample: 'sharp' as const },
  { file: 'sunset.svg', name: 'ゆうやけ', resample: 'average' as const },
];

export function sampleUrl(file: string): string {
  return `${import.meta.env.BASE_URL}samples/${file}`;
}
