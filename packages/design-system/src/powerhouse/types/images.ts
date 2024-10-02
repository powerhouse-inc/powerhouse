import { iconComponents } from '@/assets';
import { CSSProperties } from 'react';

export type IconName = keyof typeof iconComponents;
export type Size = CSSProperties['width'];
export type Color = CSSProperties['color'];
