import { useMemo } from 'react';

// src/hooks/usePlatformCapabilities.ts
// 统一平台能力判定，替代散落在各处的 UA / window.electron / matchMedia 判断。
// Capacitor 运行时注入 window.Capacitor，Electron 运行时注入 window.electron，
// 其余情况视为 Web（浏览器 / PWA）。

export interface PlatformCapabilities {
  /** 是否运行在 Capacitor 原生壳内（Android App）。 */
  isNative: boolean;
  /** 是否运行在 Android 平台上。 */
  isAndroid: boolean;
  /** 是否运行在 Electron 桌面环境。 */
  isElectron: boolean;
  /** 是否为触屏设备（无精确悬停指针）。 */
  isTouch: boolean;
  /** 是否支持 File System Access API（showDirectoryPicker）。 */
  hasFileSystemAccess: boolean;
  /** 是否支持 Web Media Session API。 */
  supportsMediaSession: boolean;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function detectCapabilities(): PlatformCapabilities {
  if (typeof window === 'undefined') {
    return {
      isNative: false,
      isAndroid: false,
      isElectron: false,
      isTouch: false,
      hasFileSystemAccess: false,
      supportsMediaSession: false,
    };
  }

  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  const isAndroid = isNative && capacitor?.getPlatform?.() === 'android';
  const isElectron = Boolean(
    (window as unknown as { electron?: unknown }).electron,
  );

  let isTouch = false;
  try {
    isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    isTouch = 'ontouchstart' in window;
  }

  return {
    isNative,
    isAndroid,
    isElectron,
    isTouch,
    hasFileSystemAccess: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
    supportsMediaSession: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
  };
}

export function usePlatformCapabilities(): PlatformCapabilities {
  return useMemo(detectCapabilities, []);
}
