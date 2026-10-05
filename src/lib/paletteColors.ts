import { PALETTE } from '../data/palette';
import { hexToLab, hexToRgb, type Lab, type RGB } from './color';

export const PALETTE_RGB: readonly RGB[] = PALETTE.map((c) => hexToRgb(c.hex));
export const PALETTE_LAB: readonly Lab[] = PALETTE.map((c) => hexToLab(c.hex));
