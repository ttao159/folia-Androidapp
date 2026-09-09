import { useCallback, useEffect, useRef, useState } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { usePlatformCapabilities } from './usePlatformCapabilities';

// src/hooks/useLandscapePlayback.ts
// 管理横屏播放模式：锁定原生方向为横屏、隐藏状态栏，并在退出或卸载时恢复。

export interface LandscapePlaybackController {
    /** 是否处于横屏播放模式。 */
    isLandscape: boolean;
    /** 是否运行在 Capacitor 原生壳内（只有原生端才真正锁定方向）。 */
    isNative: boolean;
    enterLandscape: () => Promise<void>;
    exitLandscape: () => Promise<void>;
    toggleLandscape: () => void;
}

export function useLandscapePlayback(): LandscapePlaybackController {
    const { isNative } = usePlatformCapabilities();
    const [isLandscape, setIsLandscape] = useState(false);
    const isNativeRef = useRef(isNative);
    isNativeRef.current = isNative;

    const restoreNative = useCallback(async () => {
        if (!isNativeRef.current) return;
        try {
            await ScreenOrientation.unlock();
        } catch (error) {
            void error;
        }
        try {
            await StatusBar.show();
        } catch (error) {
            void error;
        }
    }, []);

    const enterLandscape = useCallback(async () => {
        setIsLandscape(true);
        if (!isNativeRef.current) return;
        try {
            await ScreenOrientation.lock({ orientation: 'landscape' });
        } catch (error) {
            void error;
        }
        try {
            await StatusBar.hide();
        } catch (error) {
            void error;
        }
    }, []);

    const exitLandscape = useCallback(async () => {
        setIsLandscape(false);
        await restoreNative();
    }, [restoreNative]);

    const toggleLandscape = useCallback(() => {
        if (isLandscape) {
            void exitLandscape();
        } else {
            void enterLandscape();
        }
    }, [isLandscape, enterLandscape, exitLandscape]);

    useEffect(() => () => {
        void restoreNative();
    }, [restoreNative]);

    return { isLandscape, isNative, enterLandscape, exitLandscape, toggleLandscape };
}
