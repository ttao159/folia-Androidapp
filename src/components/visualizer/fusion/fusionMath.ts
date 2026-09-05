// src/components/visualizer/fusion/fusionMath.ts
// Pure easing and per-glyph entrance math migrated from the v14 fusion preview.

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const easeInOut = (v: number): number => {
    const t = clamp01(v);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export const easeOutExpo = (v: number): number => (v === 1 ? 1 : 1 - Math.pow(2, -10 * v));

export const elasticOut = (v: number): number => {
    const t = clamp01(v);
    const p = 0.3;
    return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
};

// Deterministic pseudo-random in [0,1), matching the preview's rnd().
export const rnd = (seed: number, n: number): number => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
};

export interface FusionEnterParams {
    dirX: number;
    dirY: number;
    rot: number;
    stamp: boolean;
    mag: number;
}

// 逐字入场参数：方向入射 / swing 旋转 / stamp 砸下，奇偶错位（商籁 stagger）。
export const wordEnterParams = (seed: number, index: number): FusionEnterParams => {
    const stagger = index % 2 === 0 ? -1 : 1;
    const roll = Math.floor(rnd(seed, 2) * 100);
    let dirX = 0;
    let dirY = 0;
    let rot = 0;
    let stamp = false;
    if (roll < 32) {
        const dirs: [number, number][] = [[-1, 0.12], [1, -0.12], [0.12, -1], [-0.12, 1]];
        const d = dirs[Math.floor(rnd(seed, 3) * 4)];
        dirX = d[0];
        dirY = d[1];
    } else if (roll < 58) {
        const dirs: [number, number][] = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
        const d = dirs[Math.floor(rnd(seed, 4) * 4)];
        dirX = d[0];
        dirY = d[1];
    } else if (roll < 78) {
        rot = stagger * (0.6 + rnd(seed, 5) * 0.5);
        dirX = stagger * 0.2;
        dirY = -0.55;
    } else {
        stamp = true;
    }
    const mag = 0.7 + rnd(seed, 6) * 0.5;
    return { dirX, dirY, rot, stamp, mag };
};

export interface FusionWordInput {
    start: number;
    end: number;
    enter: FusionEnterParams;
    trackingX: number;
    releaseDur: number;
}

export interface FusionWordFrame {
    x: number;
    y: number;
    rot: number;
    scale: number;
    echoAlpha: number;
    blur: number;
    ex: number;
    ey: number;
}

// 融合逐字动画：商籁弹性入场 + 凝彩方向入射/唱后散开/残影 + 浮名墨晕落纸。
export const wordFrame = (
    w: FusionWordInput,
    t: number,
    wordMul: number,
    releaseSpread: number,
    inkReveal: number,
): FusionWordFrame => {
    const ENTER_DUR = 0.6;
    const p = clamp01((t - w.start) / ENTER_DUR);
    const elastic = elasticOut(p);
    const travel = 1 - elastic;
    const ink = easeOutExpo(p);

    const enterX = w.enter.dirX * w.enter.mag * travel * wordMul;
    const enterY = w.enter.dirY * w.enter.mag * travel * wordMul;
    const rot = w.enter.rot * travel * wordMul;
    const scale = w.enter.stamp ? 1 + travel * 0.55 : 0.72 + 0.28 * elastic;

    const blur = 7 * (1 - ink) * inkReveal;
    const echoAlpha = travel * 0.5;

    const relP = clamp01((t - w.end) / Math.max(w.releaseDur, 0.001));
    const release = easeInOut(relP);
    const driftX = w.trackingX * release * 0.085 * wordMul * releaseSpread;

    return { x: enterX + driftX, y: enterY, rot, scale, echoAlpha, blur, ex: enterX, ey: enterY };
};
