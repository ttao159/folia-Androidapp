// src/services/lyricProxyBase.ts

import { isNativeShell } from './runtimePlatform';

// 封面 / 歌词的跨域转发入口。
//
// 相对路径 `/api/lyric-proxy` 依赖同源后端（Docker gateway / Vercel）；手机 App（Capacitor）
// 没有同源后端，过去需要 `VITE_LYRIC_PROXY_BASE` 指向一台单独部署的代理服务。
//
// 现在 Android 不再需要它：audioNativeInstaller 的 fetch shim 会把相关域名
// （y.gtimg.cn / kgimg.com / amll-ttml-db.stevexmh.net，见 API_HOSTS）交给原生 OkHttp 请求，
// 不受 CORS 限制。因此**原生壳内直接返回原始 URL**，既不拼代理、也不需要任何外部地址。
// Web / Electron 行为保持不变（它们仍有同源后端或本地端口）。

const getLyricProxyBase = (): string => {
    const viteValue = typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test'
        ? String((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_LYRIC_PROXY_BASE || '')
        : '';
    const processValue = typeof process !== 'undefined'
        ? String(process.env?.VITE_LYRIC_PROXY_BASE || '')
        : '';
    const value = viteValue || processValue;
    return value.trim().replace(/\/$/, '');
};

export const buildLyricProxyUrl = (targetUrl: string): string => {
    // 原生壳内：交给 fetch shim 走 OkHttp，手机上没有那台代理可指。
    if (isNativeShell()) return targetUrl;
    const base = getLyricProxyBase();
    if (!base) return `/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`;
    return `${base}/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`;
};
