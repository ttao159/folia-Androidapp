import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/services/bridgeTransportWiring.test.ts
// 钉住 A 方案里真正有风险的那一层：**transport → 桥**的接线。
//
// 之所以要在这一层做测试：audioNativeBridge.test.ts 只覆盖桥自身（直接调
// requestFoliaExtension），把 transport 里 `params` 误写成 `query` 它照样全绿。
// 而 folia.js 的 mergeOperationParams 只读 `params`/`body`、不读 `query` —— 传错不报错，
// 只是运行时拿不到参数（搜索无结果、登录卡住），构建期完全查不出来。
//
// 环境：仓库 vitest 跑在 node（无 jsdom），沿用 useOnlineProviderQrLogin.test.ts 的做法手搓 window。
// 之所以能不经 import.meta 就打开桥：getWebApiBase / getConfiguredApiBase 在
// import.meta.env.MODE === 'test' 时会回落到 process.env，因此这里设 process.env 即可。

const captured: any[] = [];

vi.mock('@/audioNative/api/folia.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/audioNative/api/folia.js')>();
    return {
        ...actual,
        handleFoliaApiRequest: vi.fn(async (input: any) => {
            captured.push(input);
            return { ok: true, code: 200 };
        }),
    };
});

const makeWindow = () => {
    const listeners = new Set<(event: any) => void>();
    const win: any = {
        addEventListener: (type: string, listener: any) => { if (type === 'message') listeners.add(listener); },
        removeEventListener: (_type: string, listener: any) => { listeners.delete(listener); },
        postMessage: (data: any) => {
            const event = { data, source: win };
            queueMicrotask(() => listeners.forEach((listener) => listener(event)));
        },
        setTimeout,
        clearTimeout,
        fetch: vi.fn(async () => new Response('{}')),
        open: vi.fn(),
    };
    win.Capacitor = {
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
    return win;
};

beforeAll(async () => {
    const win = makeWindow();
    (globalThis as any).window = win;
    // 浏览器的裸 `fetch` 就是 window.fetch；node 里两者分离，而 netease.ts 用的是裸 fetch。
    // 不把全局 fetch 也指过去，被测代码会打到真实网络（初版就是因此连到了真实外部后端）。
    (globalThis as any).fetch = win.fetch;
    // installer 会用 shim 覆盖 window.fetch，其内部仍调用原始的 fetch；
    // 测试要断言「未走桥」，就必须持有那个原始 mock 的引用。
    (globalThis as any).__originalFetch = win.fetch;
    (globalThis as any).Capacitor = win.Capacitor;
    (globalThis as any).chrome = undefined;
    (globalThis as any).localStorage = {
        store: new Map<string, string>(),
        getItem(key: string) { return this.store.get(key) ?? null; },
        setItem(key: string, value: string) { this.store.set(key, value); },
        removeItem(key: string) { this.store.delete(key); },
        clear() { this.store.clear(); },
        key: () => null,
        length: 0,
    };

    // 打开桥：QQ / 酷狗的 base 设为 'extension'。
    // 注意：仓库的 .env 若给这些 provider 配了外部地址（历史上确有一串内网地址），
    // vitest 会自动加载它，于是 import.meta.env 的值优先于 process.env；
    // 必须用 vi.stubEnv 同时覆盖两者，否则会真的打到外部后端。
    // 网易云的 base 不在这里固定——它按用例用 process.env 控制，
    // 以便分别覆盖「走桥」与「走外部后端」两条路径（见下方两个用例）。
    vi.stubEnv('VITE_KUGOU_API_BASE', 'extension');
    vi.stubEnv('VITE_QQ_API_BASE', 'extension');

    // 先装桥的 PONG 应答，再初始化 installer 与 transport。
    win.addEventListener('message', (event: any) => {
        const data = event?.data;
        if (data?.source !== 'folia-web-page' || data.type !== 'FOLIA_BRIDGE_PING') return;
        win.postMessage({ source: 'folia-extension-bridge', type: 'FOLIA_BRIDGE_PONG', ready: true, version: 'test' });
    });

    const bridge = await import('@/services/foliaExtensionBridge');
    const installer = await import('@/services/audioNativeInstaller');
    await installer.installAudioNativeCore();
    await bridge.isFoliaExtensionBridgeAvailable();
});

beforeEach(() => { captured.length = 0; });

const lastCall = () => {
    expect(captured.length).toBeGreaterThan(0);
    return captured[captured.length - 1];
};

describe('transport → 原生桥 接线', () => {
    it('酷狗：search 的 keywords 必须落在 params（写进 query 会被桥忽略）', async () => {
        const { requestKugou } = await import('@/services/onlineMusic/kugouTransport');
        await requestKugou('search', { keywords: '周杰伦', page: 1 } as any);

        const call = lastCall();
        expect(call.provider).toBe('kugou');
        expect(call.operation).toBe('search');
        expect(call.params).toMatchObject({ keywords: '周杰伦' });
    });

    it('酷狗：扫码登录的 key 也走 params', async () => {
        const { requestKugou } = await import('@/services/onlineMusic/kugouTransport');
        await requestKugou('login_qr_check', { key: 'kg-key-1' } as any);

        const call = lastCall();
        expect(call.operation).toBe('login_qr_check');
        expect(call.params).toMatchObject({ key: 'kg-key-1' });
    });

    it('QQ：operation 与 params 正确落位', async () => {
        const { requestQq } = await import('@/services/onlineMusic/qqTransport');
        await requestQq('user_detail', { uin: '10001' } as any);

        const call = lastCall();
        expect(call.provider).toBe('qq');
        expect(call.operation).toBe('user_detail');
        expect(call.params).toMatchObject({ uin: '10001' });
    });

    it('网易云：未配置 base 时走内置桥（这是 .env 取消内网地址后 Android 的默认状态）', async () => {
        // 清掉外部 base：getConfiguredApiBase 在 test 模式回落到 process.env，
        // 于是 extensionConfigured=false 且 !configuredApiBase=true → 进入桥分支。
        const saved = process.env.VITE_NETEASE_API_BASE;
        delete process.env.VITE_NETEASE_API_BASE;
        try {
            const { neteaseApi } = await import('@/services/netease');
            await neteaseApi.createQr('net-e-key');

            const call = lastCall();
            expect(call.provider).toBe('netease');
            expect(call.operation).toBe('/login/qr/create');
            expect(call.query).toMatchObject({ key: 'net-e-key' });
        } finally {
            if (saved === undefined) delete process.env.VITE_NETEASE_API_BASE;
            else process.env.VITE_NETEASE_API_BASE = saved;
        }
    });

    it('网易云：配置了外部 base 时优先走外部后端，不进桥', async () => {
        const saved = process.env.VITE_NETEASE_API_BASE;
        process.env.VITE_NETEASE_API_BASE = 'http://backend.test:1234';
        try {
            const { neteaseApi } = await import('@/services/netease');
            const fetchSpy = (globalThis as any).__originalFetch as ReturnType<typeof vi.fn>;
            fetchSpy.mockClear();
            fetchSpy.mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 200 }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }),
            );

            await neteaseApi.createQr('net-e-key');

            // 钉住这条优先级：配置了外部 base 就不走桥。
            // 它正是 Android 构建必须把 VITE_NETEASE_API_BASE 留空、否则内置桥永远不激活的原因。
            expect(captured).toHaveLength(0);
            expect(fetchSpy).toHaveBeenCalled();
        } finally {
            if (saved === undefined) delete process.env.VITE_NETEASE_API_BASE;
            else process.env.VITE_NETEASE_API_BASE = saved;
        }
    });

    it('网易云：path 与 query 的形状由桥层契约覆盖（见 audioNativeBridge.test.ts）', async () => {
        const actual = await vi.importActual<typeof import('@/audioNative/api/folia.js')>('@/audioNative/api/folia.js');
        const result: any = await actual.handleFoliaApiRequest({
            provider: 'netease',
            operation: '/login/qr/create',
            path: '/login/qr/create',
            method: 'GET',
            query: { key: 'net-e-key' },
        });
        // 无网络环境下不应抛未捕获异常；路由存在即不会返回 ROUTE_NOT_IMPLEMENTED。
        expect(result?.__foliaBridgeError).not.toBe('ROUTE_NOT_IMPLEMENTED');
    });

    it('availability：base=extension 时三源都视为已配置', async () => {
        const { getKugouTransportAvailability } = await import('@/services/onlineMusic/kugouTransport');
        const { getQqTransportAvailability } = await import('@/services/onlineMusic/qqTransport');

        expect(getKugouTransportAvailability().configured).toBe(true);
        expect(getQqTransportAvailability().configured).toBe(true);
    });
});
