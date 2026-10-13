import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/services/audioNativeBridge.test.ts
// A 方案（原生桥）契约测试。
//
// 为什么需要它：src/audioNative/**/*.js 是纯 JS，tsconfig 只开了 allowJs（解析、不做类型检查），
// 「接线错了」在 `tsc --noEmit` 与 `gradle assembleDebug` 里都是绿的，只有装到手机上才发现。
// 这里钉住三段构建期查不出来的接缝：
//   1) PING/PONG 握手：window / Capacitor.Plugins.FoliaNative 的取用方式；
//   2) 请求形状：transport 发出的 payload 要被 folia.js 的 parseInput / mergeOperationParams
//      正确消费（params vs query 写错就不会报错，只是桥取不到参数）；
//   3) 响应按 id 回包：id 对不上时调用方会一直挂着（表现为「登录一直转圈」）。
//
// 仓库的 vitest 跑在 node 环境、没有 jsdom（见 useOnlineProviderQrLogin.test.ts 的说明），
// 这里沿用同一套做法：就地手搓最小 window 桩，不引入新的测试依赖。

const recorded: Record<string, any> = {};
const handlerCalls: any[] = [];

// folia.js 的真身会发真实网络请求；这里只替换它的入口，函数体仍由真实模块提供
// （`importOriginal` 展开），未知路由的用例再用 importActual 拿真身单独验证。
vi.mock('@/audioNative/api/folia.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/audioNative/api/folia.js')>();
    return {
        ...actual,
        handleFoliaApiRequest: vi.fn(async (input: any) => {
            handlerCalls.push(input);
            recorded.provider = input?.provider ?? null;
            recorded.operation = input?.operation ?? null;
            recorded.params = input?.params ?? null;
            recorded.query = input?.query ?? null;
            recorded.path = input?.path ?? null;
            return { ok: true, echoedOperation: input?.operation };
        }),
    };
});

const listenerStub = () => {
    const listeners = new Set<(event: any) => void>();
    const win: any = {
        addEventListener: (type: string, listener: any) => { if (type === 'message') listeners.add(listener); },
        removeEventListener: (type: string, listener: any) => { listeners.delete(listener); },
        // WebView 里 postMessage 是异步派发；用 microtask 复刻，避免同步重入掩盖接线问题。
        postMessage: (data: any) => { const event = { data, source: win }; queueMicrotask(() => listeners.forEach(l => l(event))); },
        setTimeout,
        clearTimeout,
        fetch: vi.fn(async () => new Response('{}')),
        open: vi.fn(),
    };
    return win;
};

const installEnv = async () => {
    const win = listenerStub();
    (globalThis as any).window = win;
    (globalThis as any).localStorage = {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        key: () => null,
        length: 0,
        clear: () => undefined,
    };
    (globalThis as any).chrome = undefined;

    // 关键：installer 的 getPlugin() 读的是 `window.Capacitor.Plugins.FoliaNative`，
    // 只挂 globalThis 不行（那会让它拿不到 plugin 而静默提前返回）。
    const capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
            FoliaNative: {
                httpRequest: vi.fn(async () => ({ status: 200, headers: [], bodyBase64: '' })),
                httpDownload: vi.fn(async () => ({ status: 200, headers: [], bodyBase64: '' })),
                cookiesGetAll: vi.fn(async () => ({ cookies: [] })),
                cookiesGet: vi.fn(async () => ({ cookie: null })),
                cookiesSet: vi.fn(async () => ({ ok: true })),
                cookiesRemove: vi.fn(async () => ({ ok: true })),
                cookiesRemoveBatch: vi.fn(async () => ({ ok: true })),
            },
        },
    };
    win.Capacitor = capacitor;
    (globalThis as any).Capacitor = capacitor;

    // 只模拟原生侧的「握手」：PING → PONG。
    // 真正的 API_REQUEST 交给 installer 自己的消息循环处理，从而把真实回包路径也测到。
    win.addEventListener('message', (event: any) => {
        const data = event?.data;
        if (data?.source !== 'folia-web-page') return;
        if (data.type !== 'FOLIA_BRIDGE_PING') return;
        win.postMessage({ source: 'folia-extension-bridge', type: 'FOLIA_BRIDGE_PONG', ready: true, version: 'test', extId: 'folia-native-android' });
    });
};

let bridge: typeof import('@/services/foliaExtensionBridge');
let installer: typeof import('@/services/audioNativeInstaller');

beforeAll(async () => {
    await installEnv();
    // 必须在 import 之后再装环境：两个模块都在模块顶层读取 window。
    bridge = await import('@/services/foliaExtensionBridge');
    installer = await import('@/services/audioNativeInstaller');
    await installer.installAudioNativeCore();
});

beforeEach(() => {
    handlerCalls.length = 0;
    for (const key of Object.keys(recorded)) delete recorded[key];
});

describe('audioNative 原生桥契约', () => {
    it('PING/PONG 握手成功，并以 android 扩展身份上报', async () => {
        await expect(bridge.isFoliaExtensionBridgeAvailable()).resolves.toBe(true);
        expect(bridge.getFoliaExtensionBridgeInfo().extensionId).toBe('folia-native-android');
    });

    it('netease：path/query 被桥正确消费（parseInput 读的是 path 与 query）', async () => {
        const response = await bridge.requestFoliaExtension<{ echoedOperation: string }>({
            provider: 'netease',
            operation: '/login/qr/key',
            path: '/login/qr/key',
            method: 'GET',
            query: { timestamp: '123' },
        });

        expect(response.echoedOperation).toBe('/login/qr/key');
        expect(handlerCalls).toHaveLength(1);
        expect(recorded.provider).toBe('netease');
        expect(recorded.path).toBe('/login/qr/key');
        expect(recorded.query).toEqual({ timestamp: '123' });
    });

    it('kugou：参数必须走 params（mergeOperationParams 只读 params / body，不读 query）', async () => {
        await bridge.requestFoliaExtension({
            provider: 'kugou',
            operation: 'search',
            method: 'GET',
            params: { keywords: '周杰伦', page: 1 },
        });

        expect(recorded.provider).toBe('kugou');
        expect(recorded.operation).toBe('search');
        // 这条断言就是防线：若误写成 query，桥侧 params 会是 null，搜索词直接丢失。
        expect(recorded.params).toEqual({ keywords: '周杰伦', page: 1 });
    });

    it('qq：operation + path + params 三者齐备', async () => {
        await bridge.requestFoliaExtension({
            provider: 'qq',
            operation: 'user_detail',
            method: 'GET',
            path: '/user/detail',
            params: { uin: '10001' },
        });

        expect(recorded.provider).toBe('qq');
        expect(recorded.operation).toBe('user_detail');
        expect(recorded.path).toBe('/user/detail');
        expect(recorded.params).toEqual({ uin: '10001' });
    });

    it('响应按 id 回包：请求不会悬挂（挂了就是登录一直转圈）', async () => {
        await expect(
            bridge.requestFoliaExtension({ provider: 'qq', operation: 'login_status', method: 'GET', params: {} }),
        ).resolves.toMatchObject({ echoedOperation: 'login_status' });
        expect(handlerCalls).toHaveLength(1);
    });

    it('真实 folia.js：未知路由返回 __foliaBridgeError，而不是静默 undefined', async () => {
        const actual = await vi.importActual<typeof import('@/audioNative/api/folia.js')>('@/audioNative/api/folia.js');
        const result: any = await actual.handleFoliaApiRequest({
            provider: 'netease',
            operation: '/definitely/not/a/route',
            path: '/definitely/not/a/route',
            method: 'GET',
        });

        expect(result.__foliaBridgeError).toBeTruthy();
    });
});
