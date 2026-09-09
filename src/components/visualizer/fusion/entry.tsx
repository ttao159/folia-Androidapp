import React from 'react';
import { DEFAULT_FUSION_TUNING } from '../../../types';
import { defineVisualizer } from '../definition';
import FusionSettingsPanel from './FusionSettingsPanel';
import VisualizerFusion from './VisualizerFusion';

// src/components/visualizer/fusion/entry.tsx
// Registers 交融, the fused glyph-animation lyric-PV director.
export default defineVisualizer({
    mode: 'fusion',
    order: 11,
    labelKey: 'ui.visualizerFusion',
    labelFallback: '交融',
    previewSeed: 'fusion',
    previewStartOffset: 0,
    tuningKind: 'fusion',
    render: props => <VisualizerFusion key={props.seed} {...props} />,
    renderSettingsPanel: props => <FusionSettingsPanel {...props} />,
    resetSettings: ({ resetFusionTuning, setDraftFusionTuning }) => {
        setDraftFusionTuning?.(DEFAULT_FUSION_TUNING);
        resetFusionTuning?.();
    },
});
