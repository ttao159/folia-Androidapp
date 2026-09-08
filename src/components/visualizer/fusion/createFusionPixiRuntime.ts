import type { MotionValue } from 'framer-motion';
import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import type { FusionTuning, Line, Theme } from '../../../types';
import type { FusionGlyph, FusionShot } from './fusionProgram';
import { compileFusionProgram } from './fusionProgram';
import { clamp01, easeInOut, wordFrame } from './fusionMath';
import { fusionHaloComposition, type FusionHaloSpec } from './fusionBackground';

// src/components/visualizer/fusion/createFusionPixiRuntime.ts
// Owns the Pixi lifecycle for 交融 and mutates bounded glyph views from absolute playback time.

type PixiModule = typeof import('pixi.js');
type PixiText = import('pixi.js').Text;
type PixiContainer = import('pixi.js').Container;
type PixiGraphics = import('pixi.js').Graphics;
type PixiBlurFilter = import('pixi.js').BlurFilter;

export interface FusionRuntimeOptions {
    host: HTMLDivElement;
    lines: Line[];
    theme: Theme;
    tuning: FusionTuning;
    currentTime: MotionValue<number>;
    lyricsFontScale: number;
    staticMode: boolean;
    transparentBackground: boolean;
    paused: boolean;
    isDaylight?: boolean;
    signal?: AbortSignal;
}

interface FusionGlyphView {
    display: PixiText;
    echo: PixiText;
    blurFilter: PixiBlurFilter | null;
    baseX: number;
    baseY: number;
    fontSize: number;
    glyph: FusionGlyph;
}

const measureText = (text: string, fontSpec: string, fontSize: number): number => {
    try {
        const layout = layoutWithLines(prepareWithSegments(text || ' ', fontSpec), 99999, fontSize * 1.2);
        return layout.lines[0]?.width ?? text.length * fontSize * 0.6;
    } catch {
        return text.length * fontSize * 0.6;
    }
};

const resolvePaperColor = (isDaylight: boolean): string => (isDaylight ? '#f0eadb' : '#1a1713');

const findActiveLineIndex = (shots: FusionShot[], time: number): number => {
    for (let i = 0; i < shots.length; i += 1) {
        const line = shots[i].line;
        if (time >= line.startTime && time < line.endTime) return i;
    }
    return -1;
};

export class FusionPixiRuntime {
    private readonly shots: FusionShot[];
    private readonly haloByLine: FusionHaloSpec[][];
    private activeLineIndex = -1;
    private destroyed = false;
    private resizeObserver: ResizeObserver | null = null;
    private lastWidth = 0;
    private lastHeight = 0;

    private backgroundLayer!: PixiContainer;
    private haloLayer!: PixiContainer;
    private ruleLayer!: PixiContainer;
    private textLayer!: PixiContainer;

    private glyphViews: FusionGlyphView[] = [];
    private decoViews: PixiText[] = [];
    // 上一行文本容器：跨行时保留做淡出，实现转场（参考商籁的段落入场退场）。
    private prevTextLayer: PixiContainer | null = null;
    private prevFadeStart = Number.NEGATIVE_INFINITY;

    private constructor(
        private readonly pixi: PixiModule,
        private readonly options: FusionRuntimeOptions,
        private readonly app: import('pixi.js').Application,
        shots: FusionShot[],
    ) {
        this.shots = shots;
        this.haloByLine = shots.map((_, i) => fusionHaloComposition(i));
    }

    static async create(options: FusionRuntimeOptions) {
        const pixi = await import('pixi.js');
        const app = new pixi.Application();
        const width = Math.max(options.host.clientWidth, 320);
        const height = Math.max(options.host.clientHeight, 240);
        await app.init({
            width,
            height,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            resolution: options.tuning.textureResolution,
            autoStart: false,
            sharedTicker: false,
            preference: 'webgl',
            powerPreference: 'high-performance',
        });
        const shots = compileFusionProgram(options.lines);
        const runtime = new FusionPixiRuntime(pixi, options, app, shots);
        runtime.backgroundLayer = new pixi.Container();
        runtime.haloLayer = new pixi.Container();
        runtime.ruleLayer = new pixi.Container();
        runtime.textLayer = new pixi.Container();
        app.stage.addChild(runtime.backgroundLayer, runtime.haloLayer, runtime.ruleLayer, runtime.textLayer);

        if (options.signal?.aborted) {
            runtime.destroy();
            throw new DOMException('Fusion runtime creation was cancelled', 'AbortError');
        }
        options.host.appendChild(app.canvas);
        app.canvas.style.cssText = 'width:100%;height:100%;display:block';
        runtime.install();
        return runtime;
    }

    private install() {
        this.resizeToHost();
        this.app.ticker.add(this.renderFrame);
        this.resizeObserver = new ResizeObserver(() => {
            if (this.destroyed || !this.resizeToHost()) return;
            if (this.options.paused) this.renderOnce();
        });
        this.resizeObserver.observe(this.options.host);
        this.renderOnce();
        if (!this.options.paused) this.app.start();
    }

    private resizeToHost() {
        if (this.destroyed) return false;
        const width = Math.max(this.options.host.clientWidth, 320);
        const height = Math.max(this.options.host.clientHeight, 240);
        if (width === this.lastWidth && height === this.lastHeight) return false;
        this.lastWidth = width;
        this.lastHeight = height;
        this.app.renderer.resize(width, height);
        this.drawPaper(width, height);
        this.drawRules(width, height);
        // 尺寸变化后旧淡出层坐标失效，直接销毁。
        if (this.prevTextLayer) {
            this.prevTextLayer.destroy({ children: true });
            this.prevTextLayer = null;
        }
        this.activeLineIndex = -1;
        this.rebuildText(width, height);
        return true;
    }

    private drawPaper(width: number, height: number) {
        this.backgroundLayer.removeChildren().forEach(child => child.destroy());
        if (this.options.transparentBackground) return;
        const { Graphics } = this.pixi;
        const paper = new Graphics();
        paper.rect(0, 0, width, height).fill(this.pixi.Color.shared.setValue(resolvePaperColor(this.options.isDaylight ?? true)));
        this.backgroundLayer.addChild(paper);
    }

    private drawRules(width: number, height: number) {
        this.ruleLayer.removeChildren().forEach(child => child.destroy());
        if (this.options.transparentBackground) return;
        const { Graphics } = this.pixi;
        const rules = new Graphics();
        const columns = 2 + Math.floor(((this.activeLineIndex + 5) % 3));
        const ink = this.options.theme.primaryColor;
        for (let c = 1; c < columns; c += 1) {
            const x = (c / columns) * width;
            rules.moveTo(x, 0).lineTo(x, height);
        }
        rules.stroke({ color: ink, width: 1, alpha: 0.08 });
        this.ruleLayer.addChild(rules);
    }

    private drawHalos(width: number, height: number, time: number) {
        this.haloLayer.removeChildren().forEach(child => child.destroy());
        if (this.options.transparentBackground || !this.options.tuning.showHalo) return;
        if (this.activeLineIndex < 0 || this.activeLineIndex >= this.haloByLine.length) return;
        const { Graphics } = this.pixi;
        const specs = this.haloByLine[this.activeLineIndex];
        const accent = this.options.theme.accentColor;
        const ink = this.options.theme.primaryColor;
        const cx = width / 2;
        const cy = height / 2;
        const breath = Math.sin(time * 0.09 + this.activeLineIndex * 1.3) * 0.006;
        specs.forEach((spec) => {
            const g = new Graphics();
            const color = spec.accent ? accent : ink;
            const size = (spec.w / 100) * width;
            const x = cx + spec.x * width;
            const y = cy + spec.y * height;
            if (spec.kind === 'spark') {
                g.circle(0, 0, Math.max(0.5, size * 0.16)).fill(color);
                g.alpha = 0.35;
            } else if (spec.kind === 'ring') {
                g.arc(0, 0, size * 0.5, 0, Math.PI * 2).stroke({ color, width: spec.sw, alpha: 0.4 });
                g.rotation = (spec.rot * Math.PI) / 180 + time * 0.02 + breath;
            } else if (spec.kind === 'square') {
                g.rect(-size * 0.5, -size * 0.5, size, size).stroke({ color, width: spec.sw, alpha: 0.4 });
                g.rotation = (spec.rot * Math.PI) / 180 + time * 0.012;
            } else {
                g.moveTo(-size * 0.5, 0).lineTo(size * 0.5, 0);
                g.moveTo(0, -size * 0.5).lineTo(0, size * 0.5);
                g.stroke({ color, width: spec.sw, alpha: 0.35 });
                g.rotation = (spec.rot * Math.PI) / 180;
            }
            const parallax = 1 - spec.depth;
            g.position.set(x + (cx - x) * parallax * 0.02, y + (cy - y) * parallax * 0.02);
            this.haloLayer.addChild(g);
        });
    }

    private rebuildText(width: number, height: number) {
        // 旧行文本移入淡出层继续显示，由 fadeOutPreviousLine 按时间退场。
        if (this.textLayer.children.length > 0 && !this.options.staticMode) {
            this.prevFadeStart = this.options.currentTime.get();
            this.app.stage.addChild(this.textLayer);
            this.prevTextLayer = this.textLayer;
        } else {
            this.textLayer.removeChildren().forEach(child => child.destroy());
        }
        this.textLayer = new this.pixi.Container();
        this.app.stage.addChild(this.textLayer);
        this.glyphViews = [];
        this.decoViews = [];
        if (this.activeLineIndex < 0 || this.activeLineIndex >= this.shots.length) return;
        const { Text, TextStyle, Container } = this.pixi;
        const shot = this.shots[this.activeLineIndex];
        const { theme } = this.options;
        // 字号参考商籁：按词数自适应收缩，避免手机上整行歌词过大。
        const wordCount = Math.max(1, shot.wordCount);
        const baseFontSize = Math.min(Math.max(width / Math.max(7, wordCount * 2.15), 24), 112) * this.options.lyricsFontScale;
        const fontFamily = theme.fontFamily || 'sans-serif';

        // 先计算每个字素的字号与宽度，再水平居中排版。hero 词的放大统一交给 heroScale，
        // 此处按普通字素测宽，避免与 deco 的 scale 叠加成双倍放大。
        const specs = shot.glyphs.map(glyph => {
            // hero 词的放大统一交给 heroScale，此处按普通字素测宽避免双倍放大。
            const fontSize = baseFontSize * (glyph.wordIndex === shot.heroIndex ? 1 : glyph.scale);
            const fontSpec = `600 ${fontSize}px ${fontFamily}`;
            const charWidth = glyph.isSpace ? fontSize * 0.3 : measureText(glyph.char, fontSpec, fontSize);
            return { glyph, fontSize, charWidth };
        });
        let totalWidth = specs.reduce((sum, s) => sum + s.charWidth, 0);

        // 单行排版时按可用宽度整体收缩，避免长句两端被裁到屏幕外（手机竖屏尤其明显）。
        const availableWidth = width * 0.94;
        const fitScale = totalWidth > availableWidth && totalWidth > 0 ? availableWidth / totalWidth : 1;
        if (fitScale !== 1) {
            for (const spec of specs) {
                spec.fontSize *= fitScale;
                spec.charWidth *= fitScale;
            }
            totalWidth *= fitScale;
        }
        // 主体大字（hero 词）字号与占宽：与小字同基线排版，整行按可用宽度让位收缩。
        const wordByIndex = new Map<number, string>();
        shot.glyphs.forEach(g => {
            if (g.isSpace || g.wordIndex < 0) return;
            const existing = wordByIndex.get(g.wordIndex) ?? '';
            wordByIndex.set(g.wordIndex, existing + g.char);
        });
        // 主体大字字号跟随自适应后的 base，再乘 heroScale 对比系数（1~2）。
        const heroMul = this.options.tuning.heroScale ?? 1;
        const heroFontSize = baseFontSize * heroMul;
        const heroWordIndex = shot.heroIndex >= 0 ? shot.heroIndex : -1;
        const heroText = wordByIndex.get(heroWordIndex) ?? '';
        // 主体大字与小字基线对齐，使整组文字垂直居中于可视区。
        const cy = height * 0.5;

        const bodyColor = theme.primaryColor;
        const accentColor = theme.accentColor;
        const echoStyle = new TextStyle({
            fontFamily,
            fontWeight: '600',
            fill: accentColor,
        });
        // 装饰字样式：以 hero 词为“主体大字”，字号直接取整行最大可用字号。
        const decoStyle = new TextStyle({
            fontFamily,
            fontWeight: '700',
            fontSize: heroFontSize,
            fill: theme.primaryColor,
        });

        // 小字字号：按主体大字实际占宽排版，让整行（含主体大字）恰好铺满可用宽度。
        let heroSmallBase = 0;
        specs.forEach(({ glyph, charWidth }) => {
            if (!glyph.isSpace && glyph.wordIndex === heroWordIndex) heroSmallBase += charWidth;
        });
        const heroOccupyWidth = heroSmallBase * heroMul;
        const smallMul = Math.min(1, availableWidth / ((totalWidth - heroSmallBase) + heroOccupyWidth));

        // 水平布局：整行（小字 + hero 占宽）以画布中心为锚点居中；hero 词只占位不逐字绘制。
        const rowWidth = (totalWidth - heroSmallBase) * smallMul + heroOccupyWidth;
        let cursorX = width * 0.5 - rowWidth / 2;
        const heroCenterX = cursorX + (totalWidth - heroSmallBase) * smallMul + heroOccupyWidth / 2;
        specs.forEach(({ glyph, fontSize, charWidth }) => {
            const style = new TextStyle({
                fontFamily,
                fontWeight: '600',
                fontSize: fontSize * smallMul,
                fill: bodyColor,
            });
            const display = new Text({ text: glyph.char, style });
            display.anchor.set(0.5);
            const echo = new Text({ text: glyph.char, style: echoStyle });
            echo.anchor.set(0.5);
            echo.alpha = 0;

            const wrapper = new Container();
            const scaledCharWidth = charWidth * smallMul;
            const isHeroWord = glyph.wordIndex === heroWordIndex;
            const baseX = cursorX + scaledCharWidth / 2;
            cursorX += scaledCharWidth;
            if (isHeroWord) {
                // hero 词由主体大字统一绘制，逐字元素隐藏但仍保留入场动画节奏。
                display.visible = false;
                echo.visible = false;
            }
            wrapper.position.set(baseX, cy);
            wrapper.addChild(echo, display);
            this.textLayer.addChild(wrapper);

            const blurFilter = new this.pixi.BlurFilter({ strength: 0, quality: 2 });
            display.filters = [blurFilter];

            this.glyphViews.push({
                display,
                echo,
                blurFilter,
                baseX,
                baseY: cy,
                fontSize: fontSize * smallMul,
                glyph,
            });
        });

        // 主体大字 = hero 词（放大字），与小字同处一条基线、占同一块中心区域。
        if (this.options.tuning.showDecor && shot.wordCount > 0 && heroText) {
            const deco = new Text({ text: heroText, style: decoStyle });
            deco.anchor.set(0.5);
            // heroFontSize 已含 heroMul，deco 不再叠加 scale；小字按实际占宽让位。
            deco.position.set(heroCenterX, cy);
            this.textLayer.addChildAt(deco, 0);
            this.decoViews.push(deco);
        }

        this.drawRules(width, height);
    }

    private updateGlyphs(time: number) {
        const { tuning } = this.options;
        const wordMul = tuning.glyphMotion;
        for (const view of this.glyphViews) {
            const glyph = view.glyph;
            if (time < glyph.startTime) {
                view.display.alpha = 0;
                view.echo.alpha = 0;
                continue;
            }
            const frame = wordFrame(
                { start: glyph.startTime, end: glyph.endTime, enter: glyph.enter, trackingX: glyph.trackingX, releaseDur: glyph.releaseDur },
                time,
                wordMul,
                tuning.releaseSpread,
                tuning.inkReveal,
            );
            let swell = 1;
            if (time >= glyph.startTime && time < glyph.endTime) {
                const atk = Math.min(0.12, (glyph.endTime - glyph.startTime) * 0.5);
                swell = 1 + 0.05 * easeInOut(clamp01((time - glyph.startTime) / Math.max(atk, 0.02)))
                    * (1 - easeInOut(clamp01((time - glyph.endTime) / 0.26)));
            }
            view.display.alpha = 1;
            view.display.position.set(
                view.baseX + frame.x * view.fontSize,
                view.baseY + frame.y * view.fontSize,
            );
            view.display.rotation = frame.rot;
            view.display.scale.set(frame.scale * swell);
            if (view.blurFilter) view.blurFilter.strength = frame.blur;
            view.echo.alpha = frame.echoAlpha;
            view.echo.position.set(
                view.baseX + frame.ex * 1.6 * view.fontSize,
                view.baseY + frame.ey * 1.6 * view.fontSize,
            );
        }
    }

    private fadeOutPreviousLine(time: number) {
        if (!this.prevTextLayer) return;
        const PREV_FADE_DUR = 0.6;
        const p = (time - this.prevFadeStart) / PREV_FADE_DUR;
        if (p >= 1) {
            this.prevTextLayer.destroy({ children: true });
            this.prevTextLayer = null;
            return;
        }
        this.prevTextLayer.alpha = Math.max(0, 1 - easeInOut(Math.max(0, p)));
    }

    private renderFrame = () => {
        if (this.destroyed || this.shots.length === 0) return;
        const time = this.options.currentTime.get();
        const width = Math.max(this.options.host.clientWidth, 320);
        const height = Math.max(this.options.host.clientHeight, 240);
        const activeIndex = findActiveLineIndex(this.shots, time);
        if (activeIndex !== this.activeLineIndex) {
            this.activeLineIndex = activeIndex;
            this.drawRules(width, height);
            this.rebuildText(width, height);
        }
        // 背景光晕随播放时间呼吸旋转；静态模式仅按行索引取固定构图。
        this.drawHalos(width, height, this.options.staticMode ? this.activeLineIndex * 1.7 : time);
        this.fadeOutPreviousLine(time);
        this.updateGlyphs(time);
    };

    renderOnce() {
        if (this.destroyed || !this.app.canvas.isConnected) return;
        this.renderFrame();
        if (this.destroyed) return;
        this.app.renderer.render(this.app.stage);
    }

    setTuning(tuning: FusionTuning) {
        if (this.destroyed) return;
        this.options.tuning = tuning;
        if (this.options.paused) this.renderOnce();
    }

    setPaused(paused: boolean) {
        if (this.destroyed) return;
        this.options.paused = paused;
        if (paused) {
            this.app.stop();
            this.renderOnce();
        } else {
            this.app.start();
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.app.stop();
        this.app.ticker.remove(this.renderFrame);
        this.app.destroy(true, { children: true });
    }
}
