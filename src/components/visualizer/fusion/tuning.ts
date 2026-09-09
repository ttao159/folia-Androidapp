import { defineVisualizerTuning } from '../tuningRegistry';

// src/components/visualizer/fusion/tuning.ts
// Injects Fusion's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({
    mode: 'fusion',
    settingsKey: 'fusionTuning',
    settingsSetterKey: 'handleSetFusionTuning',
    apply: (props, tuning) => ({ ...props, fusionTuning: tuning }),
});
