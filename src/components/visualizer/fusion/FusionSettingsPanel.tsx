import React, { useMemo } from 'react';
import { DEFAULT_FUSION_TUNING, type FusionTuning } from '../../../types';
import { type VisualizerSettingsPanelProps } from '../definition';
import VisualizerPresetGroup, { type VisualizerPresetOption } from '../VisualizerPresetGroup';

// src/components/visualizer/fusion/FusionSettingsPanel.tsx
// Mode-owned preview settings panel for 交融's fused glyph animation knobs.
type PresetOption<T> = VisualizerPresetOption<T>;
const PresetGroup = VisualizerPresetGroup;

const FusionSettingsPanel: React.FC<VisualizerSettingsPanelProps> = ({
    t,
    isDaylight,
    theme,
    controlCardBg,
    rangeInputClass,
    onSliderPointerDown,
    onSliderCommit,
    fusionTuning = DEFAULT_FUSION_TUNING,
    onFusionTuningChange,
}) => {
    const resolved: FusionTuning = {
        cameraIntensity: Math.min(2, Math.max(0, fusionTuning.cameraIntensity ?? DEFAULT_FUSION_TUNING.cameraIntensity)),
        heroScale: Math.min(2, Math.max(1, fusionTuning.heroScale ?? DEFAULT_FUSION_TUNING.heroScale)),
        glyphMotion: Math.min(2, Math.max(0, fusionTuning.glyphMotion ?? DEFAULT_FUSION_TUNING.glyphMotion)),
        releaseSpread: Math.min(2, Math.max(0, fusionTuning.releaseSpread ?? DEFAULT_FUSION_TUNING.releaseSpread)),
        inkReveal: Math.min(1, Math.max(0, fusionTuning.inkReveal ?? DEFAULT_FUSION_TUNING.inkReveal)),
        showDecor: fusionTuning.showDecor ?? DEFAULT_FUSION_TUNING.showDecor,
        showHalo: fusionTuning.showHalo ?? DEFAULT_FUSION_TUNING.showHalo,
        textureResolution: Math.min(4, Math.max(0.5, fusionTuning.textureResolution ?? DEFAULT_FUSION_TUNING.textureResolution)),
    };

    const visibilityOptions: PresetOption<boolean>[] = useMemo(() => ([
        { value: true, label: t('options.partitaGuideLinesOn') },
        { value: false, label: t('options.partitaGuideLinesOff') },
    ]), [t]);

    const handleChange = (patch: Partial<FusionTuning>) => {
        onFusionTuningChange?.(patch);
    };

    const range = (
        label: string,
        value: number,
        min: number,
        max: number,
        step: number,
        format: (v: number) => string,
        key: keyof FusionTuning,
    ) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-primary)' }}>
                <span>{label}</span>
                <span className="font-mono opacity-70" style={{ color: 'var(--text-secondary)' }}>
                    {format(value)}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => handleChange({ [key]: parseFloat(event.target.value) } as Partial<FusionTuning>)}
                onPointerDown={onSliderPointerDown}
                onPointerUp={onSliderCommit}
                className={rangeInputClass}
            />
        </div>
    );

    return (
        <div
            className="rounded-[24px] border border-white/10 p-4 space-y-4"
            style={{ backgroundColor: controlCardBg }}
        >
            <div className="space-y-1">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t('options.fusionSettings')}
                </div>
                <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.fusionSettingsDesc')}
                </div>
            </div>

            <PresetGroup
                label={t('options.fusionShowDecor')}
                value={resolved.showDecor}
                options={visibilityOptions}
                onChange={(next) => handleChange({ showDecor: next })}
                isDaylight={isDaylight}
                theme={theme}
            />

            <PresetGroup
                label={t('options.fusionShowHalo')}
                value={resolved.showHalo}
                options={visibilityOptions}
                onChange={(next) => handleChange({ showHalo: next })}
                isDaylight={isDaylight}
                theme={theme}
            />

            {range(t('options.fusionHeroScale'), resolved.heroScale, 1, 2, 0.02, (v) => `${v.toFixed(2)}x`, 'heroScale')}
            {range(t('options.fusionGlyphMotion'), resolved.glyphMotion, 0, 2, 0.05, (v) => v.toFixed(2), 'glyphMotion')}
            {range(t('options.fusionReleaseSpread'), resolved.releaseSpread, 0, 2, 0.05, (v) => v.toFixed(2), 'releaseSpread')}
            {range(t('options.fusionInkReveal'), resolved.inkReveal, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, 'inkReveal')}
            {range(t('options.fusionCameraIntensity'), resolved.cameraIntensity, 0, 2, 0.05, (v) => v.toFixed(2), 'cameraIntensity')}
            {range(t('options.fusionTextureResolution'), resolved.textureResolution, 0.5, 4, 0.1, (v) => `${v.toFixed(1)}x`, 'textureResolution')}
        </div>
    );
};

export default FusionSettingsPanel;
