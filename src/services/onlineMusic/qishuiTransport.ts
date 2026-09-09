import { OnlineProviderError } from '../../types/onlineMusic';
import { readProviderSessionValue, removeProviderSessionValue } from './providerStorage';

// src/services/onlineMusic/qishuiTransport.ts
// 汽水音乐（字节跳动）后端 qishui-api 的请求层。统一响应为 { code, message, data }，
// code === 0 表示成功，本层负责解包并把 data 返回给 adapter。

export const QISHUI_OPERATIONS = [
    'search_mixed', 'lyric', 'audio_info', 'song_detail',
    'auth_qrcode', 'auth_qrcode_status', 'auth_me',
    'me_playlists', 'me_collection_mixed',
    'playlist_detail', 'recommend_playlist',
] as const;

export type QishuiOperation = typeof QISHUI_OPERATIONS[number];

const ENDPOINTS: Record<QishuiOperation, string> = {
    search_mixed: '/search/mixed',
    lyric: '/lyric',
    audio_info: '/audio/info',
    song_detail: '/song/detail',
    auth_qrcode: '/auth/qrcode',
    auth_qrcode_status: '/auth/qrcode/status',
    auth_me: '/auth/me',
    me_playlists: '/me/playlists',
    me_collection_mixed: '/me/collection/mixed',
    playlist_detail: '/playlist/detail',
    recommend_playlist: '/recommend/playlist',
};

// 这些路由在 qishui-api 里标记为 bodyOnly，敏感参数必须放在 POST JSON body 中。
const BODY_ONLY_OPERATIONS: readonly QishuiOperation[] = [
    'auth_qrcode_status', 'auth_me', 'me_playlists', 'me_collection_mixed',
];

const getWebApiBase = (): string => {
    const viteValue = typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test'
        ? String((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_QISHUI_API_BASE || '')
        : '';
    const processValue = typeof process !== 'undefined'
        ? String(process.env?.VITE_QISHUI_API_BASE || '')
        : '';
    const value = viteValue || processValue;
    return value.trim().replace(/\/$/, '');
};

export const getQishuiSessionId = (): string => readProviderSessionValue('qishui', 'sessionid') || '';

export const hasQishuiSession = (): boolean => Boolean(getQishuiSessionId());

export const clearQishuiSession = (): void => removeProviderSessionValue('qishui', 'sessionid');

export const getQishuiTransportAvailability = (): { configured: boolean; reason?: 'not-configured' } => (
    getWebApiBase()
        ? { configured: true } as const
        : { configured: false, reason: 'not-configured' as const }
);

const readJsonBody = async (response: Response): Promise<any> => {
    try {
        return await response.json();
    } catch {
        return undefined;
    }
};

// qishui-api 的统一响应：{ code, message, data, trace_id }。code === 0 才是成功。
const unwrapData = (operation: QishuiOperation, body: any): any => {
    if (!body || typeof body !== 'object') {
        throw new OnlineProviderError('invalid-response', `qishui-api returned an unreadable ${operation} body`, 'qishui');
    }
    const code = Number(body.code);
    if (!Number.isFinite(code) || code !== 0) {
        throw new OnlineProviderError(
            'invalid-response',
            `qishui-api ${operation} failed (code ${code})${body.message ? `: ${body.message}` : ''}`,
            'qishui',
            body,
        );
    }
    return body.data;
};

export type QishuiParams = Record<string, string | number | boolean | undefined>;

export const requestQishui = async <T = unknown>(operation: QishuiOperation, params: QishuiParams = {}): Promise<T> => {
    const base = getWebApiBase();
    if (!base) {
        throw new OnlineProviderError('unavailable', 'VITE_QISHUI_API_BASE is not configured', 'qishui');
    }

    const endpoint = ENDPOINTS[operation];
    let response: Response;
    if (BODY_ONLY_OPERATIONS.includes(operation)) {
        response = await fetch(`${base}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
    } else {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
        });
        response = await fetch(`${base}${endpoint}?${query.toString()}`);
    }

    if (!response.ok) {
        throw new OnlineProviderError('network', `qishui-api request failed: ${response.status}`, 'qishui');
    }

    const body = await readJsonBody(response);
    return unwrapData(operation, body) as T;
};
