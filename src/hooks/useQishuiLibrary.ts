import { useCallback, useEffect } from 'react';
import { omni } from '../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import type { ProviderCollection, ProviderUser } from '../types/onlineMusic';
import {
    clearProviderAccountSnapshot,
    loadProviderAccountSnapshot,
    saveProviderAccountSnapshot,
} from '../services/onlineMusic/providerAccountCache';

// src/hooks/useQishuiLibrary.ts
// 汽水音乐账号库。汽水无 likes / 云盘能力，只加载账号与歌单。

const PAGE_SIZE = 50;

export const useQishuiLibrary = () => {
    const updateAccount = useOnlineProviderAccountStore(state => state.updateAccount);
    const clearAccount = useOnlineProviderAccountStore(state => state.clearAccount);

    // Clears the visible account first so a broken session cannot leave stale authenticated UI behind.
    const clearAuthState = useCallback(async (error?: string) => {
        clearAccount('qishui', error);
        console.info('[QishuiLibrary] auth-state-cleared', {
            reason: error || 'manual-logout',
        });
        const cleanupResults = await Promise.allSettled([
            omni.logout('qishui'),
            clearProviderAccountSnapshot('qishui'),
        ]);
        cleanupResults.forEach((result, index) => {
            if (result.status === 'fulfilled') return;
            console.warn('[QishuiLibrary] auth-cleanup:error', {
                target: index === 0 ? 'provider-session' : 'account-snapshot',
                name: result.reason instanceof Error ? result.reason.name : 'Error',
                message: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
        });
    }, [clearAccount]);

    const checkLoginStatus = useCallback(async (): Promise<ProviderUser | null> => {
        const cachedAccount = useOnlineProviderAccountStore.getState().accounts.qishui;
        try {
            const user = await omni.getLoginStatus('qishui');
            if (!user) {
                await clearAuthState(cachedAccount?.user ? 'auth-required' : undefined);
                console.info('[QishuiLibrary] login-status:anonymous', {
                    previousAccountExpired: Boolean(cachedAccount?.user),
                });
                return null;
            }
            updateAccount('qishui', {
                status: 'authenticated',
                user,
                hydration: 'ready',
                error: undefined,
            });
            return user;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'qishui_login_status_failed';
            await clearAuthState(cachedAccount?.user ? 'auth-required' : undefined);
            console.warn('[QishuiLibrary] login-status:error', {
                hadCachedAccount: Boolean(cachedAccount?.user),
                name: error instanceof Error ? error.name : 'Error',
                message,
            });
            return null;
        }
    }, [clearAuthState, updateAccount]);

    const refresh = useCallback(async () => {
        const availability = omni.getProviderAvailability('qishui');
        console.info('[QishuiLibrary] refresh:start', { configured: availability.configured });
        if (!omni.getProviderCapabilities('qishui').auth || !availability.configured) {
            updateAccount('qishui', {
                status: availability.configured ? 'error' : 'anonymous',
                user: null,
                error: availability.reason,
                hydration: 'ready',
                freshness: availability.configured ? 'error' : 'fresh',
            });
            console.warn('[QishuiLibrary] refresh:unavailable', { reason: availability.reason });
            return false;
        }

        const cachedAccount = useOnlineProviderAccountStore.getState().accounts.qishui;
        updateAccount('qishui', {
            status: cachedAccount?.user ? 'authenticated' : 'unknown',
            hydration: cachedAccount?.user ? 'ready' : 'loading',
            freshness: 'refreshing',
            error: undefined,
        });
        const user = await checkLoginStatus();
        if (!user) return false;

        console.info('[QishuiLibrary] refresh:authenticated', {
            hasAvatar: Boolean(user.avatarUrl),
        });

        const collections: ProviderCollection[] = [];
        try {
            if (omni.getProviderCapabilities('qishui').userLibrary) {
                let offset = 0;
                let hasMore = true;
                while (hasMore && offset < 1000) {
                    const page = await omni.getProviderUserPlaylists('qishui', user.id, { limit: PAGE_SIZE, offset });
                    collections.push(...page.items);
                    console.info('[QishuiLibrary] playlists:page', {
                        offset,
                        itemCount: page.items.length,
                        hasMore: page.hasMore,
                    });
                    hasMore = page.hasMore && page.nextOffset > offset;
                    offset = page.nextOffset;
                }
            }
            const snapshot = await saveProviderAccountSnapshot('qishui', { user, collections, likedSongIds: [] });
            updateAccount('qishui', {
                status: 'authenticated',
                user,
                collections,
                likedSongIds: [],
                error: undefined,
                hydration: 'ready',
                freshness: 'fresh',
                lastUpdatedAt: snapshot.savedAt,
            });
            console.info('[QishuiLibrary] refresh:complete', {
                collectionCount: collections.length,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'qishui_library_failed';
            updateAccount('qishui', {
                status: 'authenticated',
                user,
                error: message,
                hydration: 'ready',
                freshness: 'error',
            });
            console.warn('[QishuiLibrary] playlists:error', {
                name: error instanceof Error ? error.name : 'Error',
                message,
            });
        }
        return true;
    }, [checkLoginStatus, updateAccount]);

    const logout = useCallback(async () => {
        await clearAuthState();
    }, [clearAuthState]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const snapshot = await loadProviderAccountSnapshot('qishui');
            if (cancelled) return;
            if (snapshot) {
                const user = omni.normalizeCachedUser('qishui', snapshot.user);
                if (user) {
                    const collections = snapshot.collections
                        .map(collection => omni.normalizeCachedCollection('qishui', collection, collection.type))
                        .filter(Boolean) as ProviderCollection[];
                    updateAccount('qishui', {
                        status: 'authenticated',
                        user,
                        collections,
                        likedSongIds: snapshot.likedSongIds,
                        hydration: 'ready',
                        freshness: 'stale',
                        lastUpdatedAt: snapshot.savedAt,
                    });
                }
            }
            if (!cancelled) void refresh();
        })();
        return () => { cancelled = true; };
    }, [refresh]);

    return { refresh, logout, checkLoginStatus };
};
