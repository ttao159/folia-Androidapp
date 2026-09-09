// src/services/lyricProxyBase.ts

// lyric-proxy 是 QQ / 酷狗 / AMLL 歌词与封面跨域转发的统一入口。相对路径 `/api/lyric-proxy`
// 依赖同源后端（Docker gateway / Vercel），而手机 App（Capacitor）没有同源后端，需要
// `VITE_LYRIC_PROXY_BASE` 指向独立部署的代理服务；未配置时保持原来的同源相对路径行为。
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
    const base = getLyricProxyBase();
    if (!base) return `/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`;
    return `${base}/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`;
};
