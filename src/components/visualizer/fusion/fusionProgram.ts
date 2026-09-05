import type { Line } from '../../../types';
import { buildLineGraphemeTimeline, splitLyricGraphemes, type GraphemeTiming } from '../../../utils/lyrics/graphemeTiming';
import { rnd, wordEnterParams, type FusionEnterParams } from './fusionMath';

// src/components/visualizer/fusion/fusionProgram.ts
// Compiles parser-timed lyrics into per-glyph fusion animation frames.

export interface FusionGlyph {
    char: string;
    startTime: number;
    endTime: number;
    wordIndex: number;
    scale: number;
    isSpace: boolean;
    enter: FusionEnterParams;
    trackingX: number;
    releaseDur: number;
    seed: number;
}

export interface FusionShot {
    line: Line;
    glyphs: FusionGlyph[];
    heroIndex: number;
    wordCount: number;
}

export const compileFusionShot = (line: Line, lineIndex: number): FusionShot => {
    const graphemes: GraphemeTiming[] = buildLineGraphemeTimeline(line);
    const chars = splitLyricGraphemes(line.fullText);

    // 按空格分词，给每个字素分配 wordIndex；hero 词取最长者放大。
    const wordList: string[] = [];
    const charWordIndex: number[] = [];
    let wordIdx = -1;
    let inWord = false;
    chars.forEach(ch => {
        const isSpace = ch.trim().length === 0;
        if (!isSpace && !inWord) {
            wordIdx += 1;
            wordList.push('');
            inWord = true;
        }
        if (isSpace) {
            inWord = false;
            charWordIndex.push(-1);
        } else {
            wordList[wordIdx] += ch;
            charWordIndex.push(wordIdx);
        }
    });

    const wordCount = Math.max(1, wordList.length);
    const lengths = wordList.map(w => w.length);
    const maxLength = Math.max(0, ...lengths);
    const seedBase = lineIndex * 997 + 131;
    const heroCandidates = lengths.map((len, idx) => (len > 0 && len >= maxLength - 1 ? idx : -1)).filter(idx => idx >= 0);
    const heroIndex = heroCandidates.length > 0
        ? heroCandidates[Math.floor(rnd(seedBase, lineIndex * 101) * heroCandidates.length) % heroCandidates.length]
        : -1;

    const glyphs: FusionGlyph[] = graphemes.map((g, gi) => {
        const isSpace = g.char.trim().length === 0;
        const wordIdx = charWordIndex[gi] ?? 0;
        const isHero = wordIdx === heroIndex;
        const scale = isHero
            ? 1.62 + rnd(seedBase, lineIndex * 31 + wordIdx) * 0.3
            : 0.58 + rnd(seedBase, lineIndex * 31 + wordIdx) * 0.14;
        const trackingX = wordCount > 1 ? (wordIdx - (wordCount - 1) / 2) / ((wordCount - 1) / 2) : 0;
        const seed = lineIndex * 997 + gi * 131;
        return {
            char: g.char,
            startTime: g.startTime,
            endTime: g.endTime,
            wordIndex: wordIdx,
            scale: isSpace ? 1 : scale,
            isSpace,
            enter: wordEnterParams(seed, wordIdx),
            trackingX,
            releaseDur: 0.8 + rnd(seed, 7) * 0.5,
            seed,
        };
    });

    return { line, glyphs, heroIndex, wordCount };
};

export const compileFusionProgram = (lines: Line[]): FusionShot[] => lines.map((line, i) => compileFusionShot(line, i));
