import type { Artist, Album, UnifiedSong } from '../../types';
import type {
    JsonValue,
    MediaId,
    ProviderCollection,
    ProviderUser,
} from '../../types/onlineMusic';
import { getOriginalCoverUrl } from '../../utils/coverUrl';

// src/services/onlineMusic/qishuiNormalize.ts
// 汽水音乐 qishui-api 归一化层：把后端的 track / playlist / profile 结构转成共享 provider 类型。

const record = (value: unknown): any => (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const text = (value: unknown): string => (
    value === undefined || value === null ? '' : String(value).trim()
);

const pick = (raw: any, ...keys: string[]): any => {
    for (const key of keys) {
        const value = raw?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
};

const jsonData = (entries: Array<[string, unknown]>): Record<string, JsonValue> => Object.fromEntries(
    entries.filter((entry): entry is [string, JsonValue] => (
        entry[1] === null || ['string', 'number', 'boolean'].includes(typeof entry[1])
    )),
);

const normalizeCoverUrl = (value: unknown): string => (
    getOriginalCoverUrl(text(value))
);

// 汽水曲目来自 `/search/mixed`（`data.tracks`）或 `/playlist/detail`（`media_resources[].track`）。
// duration 是抖音上游的毫秒值，直接透传为 durationMs。
export const normalizeQishuiSong = (raw: unknown): UnifiedSong => {
    const item = record(raw);
    // `/playlist/detail` 的 media_resource 项把 track 包在 `track` 字段里。
    const track = record(item.track ?? item);
    const album = record(track.album);
    const sourceRef = item.sourceRef?.kind === 'online' && item.sourceRef.providerId === 'qishui'
        ? item.sourceRef
        : undefined;
    const providerData = record(sourceRef?.providerData);

    const trackId = text(pick(track, 'id', 'track_id') ?? sourceRef?.mediaId ?? pick(providerData, 'trackId'));
    const durationMs = Number(pick(track, 'duration', 'duration_ms') ?? item.duration ?? item.duration_ms);
    const artists: Artist[] = (Array.isArray(track.artists) ? track.artists : [])
        .map((artist: any, index: number) => ({
            id: (text(artist.id) || index) as MediaId,
            name: text(pick(artist, 'name', 'simple_display_name') ?? artist.user_info?.nickname),
        }))
        .filter((artist: Artist) => artist.name);

    return {
        id: (trackId || '') as MediaId,
        name: text(pick(track, 'name', 'trackName')) || 'Unknown Song',
        artists,
        album: {
            id: (text(album.id) || '') as MediaId,
            name: text(album.name),
            ...(normalizeCoverUrl(pick(album, 'cover_url', 'coverUrl')) ? {
                coverUrl: normalizeCoverUrl(pick(album, 'cover_url', 'coverUrl')),
            } : {}),
        } as Album,
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0,
        sourceRef: {
            kind: 'online',
            providerId: 'qishui',
            mediaId: trackId || String(trackId),
            providerData: jsonData([
                ['trackId', trackId],
                ...(text(track.vid) ? [['vid', text(track.vid)] as [string, unknown]] : []),
            ]),
        },
    };
};

// 汽水账号 `/auth/me` 的 profile：{ id, nickname, douyin_id, is_vip }。
export const normalizeQishuiUser = (raw: unknown): ProviderUser => {
    const profile = record(record(raw).profile ?? raw);
    const id = text(pick(profile, 'id', 'user_id', 'uid')) || '0';
    return {
        id: id as MediaId,
        nickname: text(pick(profile, 'nickname', 'name')),
        ...(text(pick(profile, 'avatar_url', 'avatarUrl')) ? {
            avatarUrl: normalizeCoverUrl(pick(profile, 'avatar_url', 'avatarUrl')),
        } : {}),
    };
};

// 汽水歌单（`/me/playlists` 与 `/recommend/playlist` 的条目）：
// { id, title, type, description, cover_url, count_tracks }。
export const normalizeQishuiCollection = (raw: unknown, type = 'playlist'): ProviderCollection => {
    const item = record(raw);
    const existing = record(item.providerData);
    const id = text(pick(item, 'id', 'playlist_id') ?? pick(existing, 'playlistId'));
    const name = text(pick(item, 'title', 'name'));
    const coverUrl = normalizeCoverUrl(pick(item, 'cover_url', 'cover', 'coverUrl'));
    const trackCount = Number(pick(item, 'count_tracks', 'track_count', 'song_count', 'trackCount'));

    return {
        providerId: 'qishui',
        id: (id || '') as MediaId,
        name,
        type: text(pick(item, 'type')) || type,
        ...(coverUrl ? { coverUrl } : {}),
        ...(text(pick(item, 'description', 'intro')) ? { description: text(pick(item, 'description', 'intro')) } : {}),
        ...(Number.isFinite(trackCount) && trackCount >= 0 ? { trackCount } : {}),
        providerData: jsonData([
            ['playlistId', id],
        ]),
    };
};
