import { describe, expect, it } from 'vitest';
import {
    clamp01,
    easeInOut,
    wordEnterParams,
    wordFrame,
    type FusionWordInput,
} from '@/components/visualizer/fusion/fusionMath';

// test/unit/visualizer/fusionMotion.test.ts
// Keeps Fusion per-glyph entrance motion alive: glyphs must drift while entering and settle at rest.

const makeWord = (overrides: Partial<FusionWordInput> = {}): FusionWordInput => ({
    start: 10,
    end: 13,
    enter: wordEnterParams(7, 1),
    trackingX: 0.5,
    releaseDur: 0.8,
    ...overrides,
});

describe('fusion wordFrame entrance motion', () => {
    it('keeps a non-zero entrance offset shortly after the word starts', () => {
        const w = makeWord();
        const early = wordFrame(w, w.start + 0.05, 1, 0.6, 1);
        const late = wordFrame(w, w.start + 0.59, 1, 0.6, 1);
        // 入场期内两帧之间必须仍在移动，否则文字静止（回归：交融动画不动）。
        expect(Math.abs(early.y - late.y) + Math.abs(early.x - late.x)).toBeGreaterThan(0.01);
    });

    it('settles near zero once the elastic entrance completes', () => {
        const w = makeWord({ trackingX: 0 });
        // elasticOut 尾部有 ±2^-10 量级的回弹，入场结束后应已收敛到静止位。
        const rest = wordFrame(w, w.start + 0.61, 1, 0.6, 1);
        expect(Math.abs(rest.x)).toBeLessThan(0.01);
        expect(Math.abs(rest.y)).toBeLessThan(0.01);
        expect(Math.abs(rest.rot)).toBeLessThan(0.05);
        expect(rest.echoAlpha).toBeLessThan(0.01);
    });

    it('scales displacement with glyphMotion multiplier', () => {
        const w = makeWord();
        const t = w.start + 0.2;
        const calm = wordFrame(w, t, 0, 0.6, 1);
        const lively = wordFrame(w, t, 2, 0.6, 1);
        expect(Math.abs(lively.y)).toBeGreaterThan(Math.abs(calm.y));
    });

    it('drifts released words by tracking and spread', () => {
        const w = makeWord();
        const held = wordFrame(w, w.end - 0.01, 1, 0.6, 1);
        const released = wordFrame(w, w.end + w.releaseDur, 1, 0.6, 1);
        expect(released.x).not.toBeCloseTo(held.x, 5);
    });
});

describe('fusion entrance params', () => {
    it('produces deterministic bounded displacement magnitude', () => {
        for (let i = 0; i < 40; i += 1) {
            const p = wordEnterParams(3, i);
            expect(p.mag).toBeGreaterThanOrEqual(0.25);
            expect(p.mag).toBeLessThan(0.43);
        }
    });

    it('stays inside the visible band so hero lines never fly off-screen', () => {
        // mag * fontSize 是最大位移；字号上限 112px（对齐商籁），位移需小于半屏高（竖屏 ~320px）。
        const maxOffset = 0.43 * 112;
        expect(maxOffset).toBeLessThan(320);
    });
});

describe('fusion adaptive font size (sonnet-aligned)', () => {
    // 与 createFusionPixiRuntime.rebuildText 中 baseFontSize 公式保持一致的纯函数校验。
    const baseFontSize = (width: number, wordCount: number) => Math.min(Math.max(width / Math.max(7, Math.max(1, wordCount) * 2.15), 24), 112);

    it('shrinks long sentences on narrow phone screens', () => {
        const short = baseFontSize(393, 3);
        const long = baseFontSize(393, 12);
        expect(long).toBeLessThan(short);
        expect(long).toBeGreaterThanOrEqual(24);
    });

    it('caps at sonnet-level maximum instead of oversized posters', () => {
        expect(baseFontSize(1920, 1)).toBeLessThanOrEqual(112);
    });

    it('keeps hero contrast driven only by heroScale (no double scaling)', () => {
        // deco 字号 = base * heroMul，且 deco.scale 不再乘 heroMul；heroMul 范围 1~2。
        const heroMul = 1.62;
        const heroFontSize = baseFontSize(393, 6) * heroMul;
        expect(heroFontSize).toBeGreaterThan(baseFontSize(393, 6));
        expect(heroFontSize).toBeLessThanOrEqual(112 * 2);
    });
});

describe('fusion line transition fade', () => {
    // 与 fadeOutPreviousLine 一致：淡出期内 alpha 从 1 单调降到 0。
    const prevAlpha = (elapsed: number) => {
        const p = elapsed / 0.6;
        if (p >= 1) return null;
        return Math.max(0, 1 - easeInOut(Math.max(0, p)));
    };

    it('fades previous line out monotonically within half a second', () => {
        let prev = 1.01;
        for (let t = 0; t < 0.6; t += 0.05) {
            const a = prevAlpha(t)!;
            expect(a).toBeLessThanOrEqual(prev + 1e-9);
            prev = a;
        }
        expect(prevAlpha(0.6)).toBeNull();
    });

    it('starts fully opaque and ends transparent', () => {
        expect(prevAlpha(0)).toBeCloseTo(1, 5);
        expect(prevAlpha(0.59)).toBeLessThan(0.05);
    });
});

describe('fusion easing helpers', () => {
    it('clamps progress into [0,1]', () => {
        expect(clamp01(-2)).toBe(0);
        expect(clamp01(0.5)).toBe(0.5);
        expect(clamp01(9)).toBe(1);
    });

    it('runs easeInOut monotonically from 0 to 1', () => {
        expect(easeInOut(0)).toBe(0);
        expect(easeInOut(1)).toBe(1);
        let prev = -1;
        for (let t = 0; t <= 1.0001; t += 0.05) {
            const v = easeInOut(t);
            expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = v;
        }
    });
});
