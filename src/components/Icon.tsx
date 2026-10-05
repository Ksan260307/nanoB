/** 線のアイコン (24×24) */
const PATHS = {
  image: 'M4 5h16v14H4z M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18 M15.5 9.5a1.5 1.5 0 1 0 0-.01',
  size: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  palette:
    'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h1.9A4.9 4.9 0 0 0 21 10.5C21 6.4 17 3 12 3z M7.5 11.5h.01 M9.5 7.5h.01 M14.5 7.5h.01',
  pencil: 'M4 20l1-4 11-11 3 3-11 11z M14 6l3 3',
  chart: 'M5 6h2 M10 6h9 M5 12h2 M10 12h9 M5 18h2 M10 18h9',
  download: 'M12 4v11 M7 10.5l5 5 5-5 M5 20h14',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M11 8v6 M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M8 11h6',
  fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12 M11 11V4.5a1.5 1.5 0 0 1 3 0V12 M14 11.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.3-5.5-3.5L3.8 14.4a1.5 1.5 0 0 1 2.5-1.6L8 15',
  eraser: 'M8 20h12 M5.5 15.5l9-9a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L11 18H8z M10 11l4 4',
  bucket: 'M5 11l7-7 7 7-6.5 6.5a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8z M5 11h14 M20 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z',
  picker: 'M14.5 4.5l5 5 M17 2l5 5-3 3-5-5z M14 8l-9 9-1 3 3-1 9-9',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12 M18 6L6 18',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  folder: 'M3 6h6l2 2h10v11H3z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14 M12 17h.01',
  camera: 'M4 8h3.5L9 5.5h6L16.5 8H20v11H4z M12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  share: 'M12 15V3 M7.5 7.5L12 3l4.5 4.5 M5 12v8h14v-8',
  printer: 'M7 9V3h10v6 M5 9h14a2 2 0 0 1 2 2v6h-4 M7 17H3v-6a2 2 0 0 1 2-2 M7 14h10v7H7z',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  flip: 'M12 3v18 M9 7L4 17h5z M15 7l5 10h-5z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14 M2 6h14a2 2 0 0 1 2 2v14',
  bead: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  square: 'M5 5h14v14H5z',
  symbol: 'M4 4h16v16H4z M9 15.5l3-7.5 3 7.5 M10 13.2h4',
  grid: 'M4 4h16v16H4z M4 9.3h16 M4 14.7h16 M9.3 4v16 M14.7 4v16',
  hammer: 'M15 12l-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9 M17.6 6.4L20 4 M14 4l6 6-3 3-6-6z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  file: 'M6 3h8l5 5v13H6z M14 3v5h5',
  upload: 'M12 16V4 M7 8.5l5-5 5 5 M5 20h14',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  swap: 'M7 4L3 8l4 4 M3 8h14 M17 12l4 4-4 4 M21 16H7',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  heart: 'M12 20s-7.5-4.6-9-9.2C1.9 7.3 4.2 4 7.6 4c2 0 3.3 1.1 4.4 2.6C13.1 5.1 14.4 4 16.4 4c3.4 0 5.7 3.3 4.6 6.8C19.5 15.4 12 20 12 20z',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  home: 'M3 11l9-8 9 8 M5.5 9v11h4.5v-6h4v6h4.5V9',
  cart: 'M3 4h2.2l2.3 11h10.8l2-8H6.4 M9.5 20a1.2 1.2 0 1 0 0-.01 M17.5 20a1.2 1.2 0 1 0 0-.01',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5h.01',
  warning: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
