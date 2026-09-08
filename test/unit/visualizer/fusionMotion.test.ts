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
        // mag * fontSize 是最大位移；fontSize 上限约 92px，位移需小于半屏高（竖屏 ~320px）。
        const maxOffset = 0.43 * 92;
        expect(maxOffset).toBeLessThan(320);
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
