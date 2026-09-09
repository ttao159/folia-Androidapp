import { appDatabase } from './appDatabase';

// src/services/mobileAudioStore.ts
// 移动端（Capacitor）本地音频的持久化存取。
// 安卓 WebView 不支持 File System Access API，导入的音频以 Blob 形式存进 IndexedDB，
// 播放时按需生成 object URL，避免把原始音频字节写进 local_music 表（会参与元数据同步）。

const URL_LIFETIME_WARNING = 5 * 60 * 1000;

export async function saveMobileAudioBlob(songId: string, blob: Blob): Promise<void> {
  await appDatabase.mobile_audio_blobs.put({ songId, blob });
}

export async function hasMobileAudioBlob(songId: string): Promise<boolean> {
  const count = await appDatabase.mobile_audio_blobs.where('songId').equals(songId).count();
  return count > 0;
}

export async function getMobileAudioBlob(songId: string): Promise<Blob | null> {
  const record = await appDatabase.mobile_audio_blobs.get(songId);
  return record?.blob ?? null;
}

export async function getMobileAudioBlobUrl(songId: string): Promise<string | null> {
  const blob = await getMobileAudioBlob(songId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function removeMobileAudioBlob(songId: string): Promise<void> {
  await appDatabase.mobile_audio_blobs.delete(songId);
}

export function scheduleMobileAudioUrlRevoke(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), URL_LIFETIME_WARNING);
}
