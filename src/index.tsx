import { Buffer } from 'buffer';
import { installGlobalVisualizerFrameRateLimiter } from './utils/frameRateLimiter';
import { installConsoleLogCapture } from './utils/consoleLogBuffer';
import { installDebugModule } from './services/debug/debugModule';
import { installMemorySampleFeed } from './services/debug/memorySamples';
import { installAudioNativeCore } from './services/audioNativeInstaller';
// @ts-ignore
globalThis.Buffer = Buffer;
// First, so the debug overlay's console tab has the startup lines too - they are where a failure
// to reach a library or restore a session shows up.
installConsoleLogCapture();
// Right after it, so the startup lines reach the runtime log file too and not only the in-memory
// buffer. Both no-op off Electron. See services/debug/debugModule.ts.
installDebugModule();
installMemorySampleFeed();
installGlobalVisualizerFrameRateLimiter();
// 安卓原生桥：在 React 挂载前把网络/Cookie 能力接到原生插件（Android 专用，其他平台空操作）。
void installAudioNativeCore();

void import('./bootstrap');
