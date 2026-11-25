import React from 'react';
import {W, H} from '../config/production';
import {Cam, blurAt} from './camera';

export interface Drawable {
  key: string;
  depth: number; // distance from camera (m); larger draws first
  node: React.ReactNode;
  blur?: number; // override computed depth-of-field blur (px)
}

const quantize = (b: number) => (b < 0.35 ? 0 : b < 3 ? Math.round(b * 2) / 2 : Math.round(b));

/**
 * Painter's-algorithm compositor with depth of field.
 * Items are sorted far → near, then split into contiguous runs that share the same
 * (quantised) blur radius. Each run is its own full-frame SVG plane with a CSS blur,
 * so a rack focus genuinely re-blurs every layer by its real distance from the lens.
 */
export const DepthStack: React.FC<{cam: Cam; items: Drawable[]; maxBlur?: number}> = ({cam, items, maxBlur = 22}) => {
  const sorted = [...items].sort((a, b) => b.depth - a.depth);
  const runs: {blur: number; items: Drawable[]}[] = [];
  for (const it of sorted) {
    const b = quantize(Math.min(maxBlur, it.blur ?? blurAt(cam, it.depth)));
    const last = runs[runs.length - 1];
    if (last && last.blur === b) last.items.push(it);
    else runs.push({blur: b, items: [it]});
  }
  return (
    <>
      {runs.map((r, i) => (
        <svg
          key={i}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{position: 'absolute', inset: 0, overflow: 'visible', filter: r.blur > 0 ? `blur(${r.blur}px)` : undefined}}
        >
          {r.items.map((it) => (
            <React.Fragment key={it.key}>{it.node}</React.Fragment>
          ))}
        </svg>
      ))}
    </>
  );
};
