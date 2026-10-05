import { useRef } from 'react';

/** 画像ファイルを選ぶ (スマホではカメラ・写真ライブラリも選べる) */
export function useImagePicker(onPicked: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      hidden
      data-testid="image-input"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) onPicked(f);
      }}
    />
  );
  return { input, open: () => inputRef.current?.click() };
}
