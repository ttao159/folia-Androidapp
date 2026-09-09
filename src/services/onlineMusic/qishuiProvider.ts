import type { SongResult, UnifiedSong } from '../../types';
import type {
    MediaId,
    OnlineMusicProvider,
    ProviderCollection,
    ProviderLyricsResult,
    ProviderPage,
    ProviderUser,
    QrLoginState,
} from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { parseLRC } from '../../utils/lyrics/parserCore';
import { writeProviderSessionValue } from './providerStorage';
import { normalizeQishuiCollection, normalizeQishuiSong, normalizeQishuiUser } from './qishuiNormalize';
import { clearQishuiSession, getQishuiSessionId, getQishuiTransportAvailability, hasQishuiSession, requestQishui } from './qishuiTransport';

// src/services/onlineMusic/qishuiProvider.ts
// 汽水音乐（字节跳动）provider 适配层。汽水音频是 AES 加密的，qishui-api 不提供可直连的
// 明文播放地址，所以这里只实现登录、搜索、歌单、歌词与推荐，不做在线播放（playback=false）。

const errorFields = (error: unknown) => ({
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
});

// `/auth/qrcode` 一次同时返回 token 与二维码图片，token 是轮询 key，二维码按 token 暂存在这里，
// `createQr` 只做取回，避免二次请求。
const qrTokenCache = new Map<string, string>();

const getSearchTracks = async (query: string, limit: number, offset: number) => {
    const response = await requestQishui<any>('search_mixed', {
        keywords: query,
        cursor: Math.max(0, offset),
    });
    const tracks = Array.isArray(response?.tracks) ? response.tracks : [];
    const items = tracks.map(normalizeQishuiSong);
    return {
        items,
        hasMore: items.length === limit,
        nextOffset: offset + items.length,
    };
};

const getQishuiTrackId = (song: SongResult): string => {
    const sourceRef = song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'qishui'
        ? song.sourceRef
        : undefined;
    return String(sourceRef?.mediaId || song.id || '').trim();
};

const getLyrics = async (song: SongResult): Promise<ProviderLyricsResult> => {
    const trackId = getQishuiTrackId(song);
    if (!trackId) {
        console.warn('[QishuiProvider] lyrics:missing-track-id');
        return { lyrics: null, isPureMusic: false };
    }

    const response = await requestQishui<any>('lyric', { track_id: trackId });
    const lrc = String(response?.lrc || '');
    if (!lrc) return { lyrics: null, isPureMusic: false };
    return { lyrics: parseLRC(lrc), isPureMusic: false };
};

const getLoginStatus = async (): Promise<ProviderUser | null> => {
    if (!hasQishuiSession()) return null;

    try {
        const response = await requestQishui<any>('auth_me', { sessionid: getQishuiSessionId() });
        const profile = response?.profile;
        if (!profile || typeof profile !== 'object' || !profile.id) {
            console.info('[QishuiProvider] login-status:anonymous');
            return null;
        }
        return normalizeQishuiUser(profile);
    } catch (error) {
        // 会话缺失或失效统一按匿名处理，避免启动时的会话探测把异常抛回渲染路径。
        console.info('[QishuiProvider] login-status:error', errorFields(error));
        return null;
    }
};

const logout = async (): Promise<void> => {
    clearQishuiSession();
};

// 汽水上游扫码状态：confirmed 表示已确认并携带 sessionid，scanned 表示已扫待确认，
// expired / canceled 表示失效，其余（new / waiting）都视为继续等待。
const checkQr = async (key: string): Promise<QrLoginState> => {
    const response = await requestQishui<any>('auth_qrcode_status', { token: key });
    const status = String(response?.status || '');
    if (status === 'confirmed') {
        const sessionid = String(response?.auth?.sessionid || '').trim();
        if (sessionid) writeProviderSessionValue('qishui', 'sessionid', sessionid);
        qrTokenCache.delete(key);
        return { state: 'confirmed' };
    }
    if (status === 'expired' || status === 'canceled' || status === 'invalid') {
        qrTokenCache.delete(key);
        return { state: 'expired' };
    }
    if (status === 'scanned' || status === 'scanning') return { state: 'scanned' };
    return { state: 'waiting' };
};

const getUserPlaylists = async (
    _userId: MediaId,
    limit: number,
    offset: number,
): Promise<ProviderPage<ProviderCollection>> => {
    const response = await requestQishui<any>('me_playlists', { sessionid: getQishuiSessionId() });
    const playlists = Array.isArray(response?.playlists) ? response.playlists : [];
    const items = playlists
        .slice(offset, offset + Math.max(0, limit))
        .map((item: unknown) => normalizeQishuiCollection(item));
    const nextOffset = offset + items.length;
    return { items, hasMore: nextOffset < playlists.length, nextOffset };
};

const getPlaylistTracks = async (
    id: MediaId,
    limit: number,
    offset: number,
): Promise<ProviderPage<UnifiedSong>> => {
    const response = await requestQishui<any>('playlist_detail', { id: String(id ?? '').trim() });
    const resources = Array.isArray(response?.media_resources) ? response.media_resources : [];
    const items = resources
        .slice(offset, offset + Math.max(0, limit))
        .map((item: unknown) => normalizeQishuiSong(item));
    const nextOffset = offset + items.length;
    return { items, hasMore: nextOffset < resources.length, nextOffset };
};

const getRecommendedCollections = async (limit: number): Promise<ProviderCollection[]> => {
    const response = await requestQishui<any>('recommend_playlist', { count: Math.max(1, Math.floor(limit)) });
    const playlists = Array.isArray(response?.playlists) ? response.playlists : [];
    return playlists
        .map((item: unknown) => normalizeQishuiCollection(item))
        .filter((collection: ProviderCollection) => collection.id !== '');
};

export const qishuiProvider: OnlineMusicProvider = {
    id: 'qishui',
    displayName: 'Qishui Music',
    shortName: '汽水音乐',
    getAvailability: getQishuiTransportAvailability,
    capabilities: {
        search: true,
        playback: false,
        lyrics: true,
        auth: true,
        userLibrary: true,
        playlists: true,
        albums: false,
        artists: false,
        recommendations: true,
        mutations: false,
        wordByWordLyrics: false,
    },
    normalizeSong: normalizeQishuiSong,
    normalizeUser: normalizeQishuiUser,
    normalizeCollection: normalizeQishuiCollection,
    search: { searchSongs: getSearchTracks },
    lyrics: { getLyrics },
    auth: {
        getLoginStatus,
        logout,
        async getQrKey() {
            const response = await requestQishui<any>('auth_qrcode');
            const token = String(response?.token || '').trim();
            const qrcode = String(response?.qrcode || '');
            if (!token) throw new OnlineProviderError('invalid-response', 'qishui qrcode missing token', 'qishui');
            qrTokenCache.set(token, qrcode);
            return token;
        },
        async createQr(key) {
            return qrTokenCache.get(key) || '';
        },
        checkQr,
    },
    library: { getUserPlaylists },
    catalog: { getPlaylistTracks },
    recommendations: { getRecommendedCollections },
};
