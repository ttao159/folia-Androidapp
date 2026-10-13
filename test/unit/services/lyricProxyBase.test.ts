import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/services/lyricProxyBase.test.ts
// 钉住「取消内网」后的封面/歌词取址行为。
//
// 背景：这些资源原先经 VITE_LYRIC_PROXY_BASE 指向的外部代理转发（而仓库里那个值曾是
// 开发机内网地址，被打进过发布包）。现在原生壳内改为直连原始 URL，由 fetch shim
// （audioNativeInstaller 的 API_HOSTS）交给 OkHttp 取，绕开 CORS。
// 这里保证三件事：壳内不拼代理、壳外退回原行为、以及 shim 真的覆盖了这些域名。

const ORIGIN_COVER = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000abc.jpg';
const AMLL = 'https://amll-ttml-db.stevexmh.net/ttml/123.ttml';

const stubWindow = (capacitor?: Record<string, unknown>) => {
    const win: any = {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        postMessage: () => undefined,
        setTimeout,
        clearTimeout,
    };
    if (capacitor) win.Capacitor = capacitor;
    (globalThis as any).window = win;
};

const loadModule = async () => {
    vi.resetModules();
    return import('@/services/lyricProxyBase');
};

beforeEach(() => {
    process.env.VITE_LYRIC_PROXY_BASE = '';
});

describe('buildLyricProxyUrl', () => {
    it('原生壳（isNativePlatform）：直连原始 URL，不经过任何代理', async () => {
        stubWindow({ isNativePlatform: () => true, getPlatform: () => 'android' });
        const { buildLyricProxyUrl } = await loadModule();

        expect(buildLyricProxyUrl(ORIGIN_COVER)).toBe(ORIGIN_COVER);
        expect(buildLyricProxyUrl(AMLL)).toBe(AMLL);
    });

    it('原生壳（仅 getPlatform=android）：同样直连原始 URL', async () => {
        stubWindow({ isNativePlatform: () => false, getPlatform: () => 'android' });
        const { buildLyricProxyUrl } = await loadModule();

        expect(buildLyricProxyUrl(ORIGIN_COVER)).toBe(ORIGIN_COVER);
    });

    it('Web（非壳）且未配置代理：保持同源相对路径（不改变既有行为）', async () => {
        stubWindow(undefined);
        const { buildLyricProxyUrl } = await loadModule();

        const url = buildLyricProxyUrl(ORIGIN_COVER);
        expect(url.startsWith('/api/lyric-proxy?url=')).toBe(true);
        expect(url).toContain(encodeURIComponent(ORIGIN_COVER));
    });

    it('Web 配置了代理：仍指向该代理（仅原生壳跳过）', async () => {
        stubWindow({ isNativePlatform: () => false, getPlatform: () => 'web' });
        process.env.VITE_LYRIC_PROXY_BASE = 'https://proxy.example.com';
        const { buildLyricProxyUrl } = await loadModule();

        expect(buildLyricProxyUrl(ORIGIN_COVER)).toBe(
            `https://proxy.example.com/api/lyric-proxy?url=${encodeURIComponent(ORIGIN_COVER)}`,
        );
    });

    it('桥的域名白名单覆盖封面 CDN 与 AMLL（否则壳内直连会被 CORS 拦掉）', async () => {
        stubWindow({ isNativePlatform: () => true, getPlatform: () => 'android' });
        // isBridgedApiUrl 内部用 `new URL(url, location.href)`：node 环境没有 location，
        // 不补上的话会走 catch 分支一律返回 false，测试就变成假阴性。
        (globalThis as any).location = { href: 'http://localhost/' };

        vi.resetModules();
        const { isBridgedApiUrl } = await import('@/services/audioNativeInstaller');

        // 封面与歌词资源必须命中白名单，才能改走 OkHttp、绕开 CORS。
        expect(isBridgedApiUrl(ORIGIN_COVER)).toBe(true);
        expect(isBridgedApiUrl(AMLL)).toBe(true);
        expect(isBridgedApiUrl('https://imge.kugou.com/stdmusic/abc.jpg')).toBe(true);
        // 不在白名单的普通域名不应被劫持。
        expect(isBridgedApiUrl('https://example.com/whatever.jpg')).toBe(false);
    });
});
