import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_FUSION_TUNING, type Line } from '../../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../../utils/fontStacks';
import { getLineRenderEndTime } from '../../../utils/lyrics/renderHints';
import type { VisualizerSharedProps } from '../definition';
import { useVisualizerRuntime } from '../runtime';
import VisualizerShell from '../VisualizerShell';
import VisualizerSubtitleOverlay from '../VisualizerSubtitleOverlay';
import type { FusionPixiRuntime } from './createFusionPixiRuntime';

// src/components/visualizer/fusion/VisualizerFusion.tsx
// Mounts the lazily loaded Pixi runtime while React retains shell and subtitle responsibilities.

const EMPTY_LINES: Line[] = [];

const VisualizerFusion: React.FC<VisualizerSharedProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        audioPower,
        audioBands,
        showText = true,
        lyricsFontScale = 1,
        staticMode = false,
        paused = false,
        isDaylight,
        subtitleTheme,
        subtitleFontScale,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        subtitleContentMode,
        background,
        fusionTuning = DEFAULT_FUSION_TUNING,
    } = props;
    const transparentBackground = background?.transparent ?? false;
    const { t } = useTranslation();
    const hostRef = useRef<HTMLDivElement>(null);
    const runtimeRef = useRef<FusionPixiRuntime | null>(null);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const [runtimeFailed, setRuntimeFailed] = useState(false);

    const programLines = useMemo(() => (showText && lines.length > 0 ? lines : EMPTY_LINES), [showText, lines]);

    const { activeLine, recentCompletedLine, nextLines } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });

    const fallbackFontFamily = resolveThemeFontStack(theme);
    const fallbackFontWeight = resolveThemeFontWeight(theme, 600);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        let disposed = false;
        let createdRuntime: FusionPixiRuntime | null = null;
        const abortController = new AbortController();
        setRuntimeFailed(false);
        void import('./createFusionPixiRuntime')
            .then(({ FusionPixiRuntime }) => FusionPixiRuntime.create({
                host,
                lines: programLines,
                theme,
                tuning: fusionTuning,
                currentTime,
                lyricsFontScale,
                staticMode,
                transparentBackground,
                paused: pausedRef.current,
                isDaylight,
                signal: abortController.signal,
            }))
            .then(runtime => {
                if (disposed) {
                    runtime.destroy();
                    return;
                }
                createdRuntime = runtime;
                runtimeRef.current = runtime;
                runtime.setPaused(pausedRef.current);
            })
            .catch(error => {
                if (error instanceof DOMException && error.name === 'AbortError') return;
                console.error('[Fusion] Pixi runtime initialization failed', error);
                if (!disposed) setRuntimeFailed(true);
            });
        return () => {
            disposed = true;
            abortController.abort();
            if (createdRuntime) {
                createdRuntime.destroy();
                if (runtimeRef.current === createdRuntime) runtimeRef.current = null;
            } else if (runtimeRef.current) {
                runtimeRef.current.destroy();
                runtimeRef.current = null;
            }
            host.replaceChildren();
        };
    }, [
        currentTime,
        isDaylight,
        lyricsFontScale,
        programLines,
        fusionTuning,
        staticMode,
        theme,
        transparentBackground,
    ]);

    useEffect(() => {
        runtimeRef.current?.setPaused(paused);
    }, [paused]);

    useEffect(() => {
        runtimeRef.current?.setTuning(fusionTuning);
    }, [fusionTuning]);

    useEffect(() => currentTime.on('change', () => {
        if (paused) runtimeRef.current?.renderOnce();
    }), [currentTime, paused]);

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
        >
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                <div ref={hostRef} className="absolute inset-0 z-10" aria-hidden="true" />
                {(runtimeFailed || programLines.length === 0) && (
                    <div
                        className="absolute inset-0 flex items-center justify-center px-10 text-center transition-opacity duration-300"
                        style={{
                            color: theme.primaryColor,
                            fontFamily: fallbackFontFamily,
                            fontWeight: fallbackFontWeight,
                            fontSize: `clamp(2rem, ${5.4 * lyricsFontScale}vw, 5.6rem)`,
                        }}
                    >
                        {showText ? (activeLine?.fullText || t('ui.waitingForMusic')) : null}
                    </div>
                )}
            </div>

            <VisualizerSubtitleOverlay
                showText={showText}
                activeLine={activeLine}
                recentCompletedLine={recentCompletedLine}
                nextLines={nextLines}
                theme={theme}
                subtitleTheme={subtitleTheme}
                translationFontSize={`clamp(${1.05 * lyricsFontScale}rem, ${2.2 * lyricsFontScale}vw, ${1.25 * lyricsFontScale}rem)`}
                upcomingFontSize={`clamp(${0.9 * lyricsFontScale}rem, ${1.8 * lyricsFontScale}vw, ${1.05 * lyricsFontScale}rem)`}
                subtitleFontScale={subtitleFontScale}
                subtitleOverlayOpacity={subtitleOverlayOpacity}
                subtitleOverlayBackground={subtitleOverlayBackground}
                isPlayerChromeHidden={isPlayerChromeHidden}
                hideTranslationSubtitle={hideTranslationSubtitle}
                showSubtitleTranslation={showSubtitleTranslation}
                subtitleContentMode={subtitleContentMode}
            />
        </VisualizerShell>
    );
};

export default VisualizerFusion;
