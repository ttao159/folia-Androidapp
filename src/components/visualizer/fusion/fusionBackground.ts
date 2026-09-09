import { rnd } from './fusionMath';

// src/components/visualizer/fusion/fusionBackground.ts
// Deterministic newspaper print halo composition (pure data, Pixi draws it).

export type FusionHaloKind = 'ring' | 'square' | 'cross' | 'spark';

export interface FusionHaloSpec {
    kind: FusionHaloKind;
    x: number;
    y: number;
    w: number;
    rot: number;
    depth: number;
    accent: boolean;
    sw: number;
    gap0: number;
    gap: number;
}

const KINDS: FusionHaloKind[] = ['ring', 'square', 'cross'];

// 四周线形几何光环（缺口圆环/方框/十字）+ 星点，淡描边、带景深。
export const fusionHaloComposition = (i: number): FusionHaloSpec[] => {
    const s = i * 977 + 131;
    const h = (n: number) => rnd(s, n);
    const shapes: FusionHaloSpec[] = [];
    const baseCount = 6 + Math.floor(h(0) * 3);
    for (let k = 0; k < baseCount; k += 1) {
        const side = Math.floor(h(k + 1) * 4);
        const along = -0.4 + h(k + 2) * 0.8;
        const overflow = 0.04 + h(k + 3) * 0.07;
        let x: number;
        let y: number;
        if (side === 0) { x = -0.44 - overflow; y = along; }
        else if (side === 1) { x = 0.44 + overflow; y = along; }
        else if (side === 2) { x = along; y = -0.44 - overflow; }
        else { x = along; y = 0.44 + overflow; }
        shapes.push({
            kind: KINDS[k % KINDS.length],
            x,
            y,
            w: 9 + h(k + 4) * 13,
            rot: h(k + 5) * 360,
            depth: h(k + 6),
            accent: h(k + 7) > 0.5,
            sw: 0.6 + h(k + 8) * 1.7,
            gap0: Math.floor(h(k + 9) * 360),
            gap: Math.floor(24 + h(k + 10) * 150),
        });
    }
    const sparkCount = 8 + Math.floor(h(20) * 5);
    for (let k = 0; k < sparkCount; k += 1) {
        shapes.push({
            kind: 'spark',
            x: -0.32 + h(k + 21) * 0.64,
            y: -0.36 + h(k + 22) * 0.72,
            w: 1.4 + h(k + 23) * 3,
            rot: 0,
            depth: h(k + 24),
            accent: h(k + 25) > 0.5,
            sw: 0,
            gap0: 0,
            gap: 0,
        });
    }
    return shapes;
};
