import { DualTheme } from "../types";
import { applyStoredAnimationIntensityToDualTheme } from "./themePreferences";
import { sanitizeDualTheme } from "./themeSanitizer";
import { getWebAiProvider } from "./runtimeConfig";
import { isNativeShell } from "./runtimePlatform";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? '');
};

export const isMissingAiApiKeyError = (error: unknown) => {
  const message = getErrorMessage(error);
  return /(?:openai_api_key|gemini_api_key|api key)/i.test(message)
    && /(?:not configured|missing|configure)/i.test(message);
};

/**
 * AI 配色端点不可用（而非「缺 key」）。
 *
 * Web / Docker / Vercel 部署自带同源后端，`/api/generate-theme` 可用；原生壳（Android App）
 * 没有这层后端，请求会打到本地资源服务器并返回 404/405。此时调用方（useThemeController）
 * 应当像「缺 key」一样退回封面派生配色，而不是向用户报「主题生成失败」——
 * 后者会让人以为是自己配置错了。参考实现同样如此（它也没有该端点），只是没做这层识别。
 */
export const isAiThemeEndpointUnavailableError = (error: unknown) => {
  const message = getErrorMessage(error);
  if (/HTTP\s+(?:404|405)\b/.test(message)) return true;
  if (/^\s*<(!doctype|html)/i.test(message)) return true;
  return /(?:not\s*found|unavailable)/i.test(message) && /(?:generate-theme|endpoint|api)/i.test(message);
};

export const generateThemeFromLyrics = async (
  lyricsText: string,
  options?: { isPureMusic?: boolean; songTitle?: string }
): Promise<DualTheme> => {
  try {
    // Check if running in Electron environment
    if ((window as any).electron && typeof (window as any).electron.generateTheme === 'function') {
      const dualTheme = await (window as any).electron.generateTheme(lyricsText, options);
      return sanitizeDualTheme(dualTheme);
    }

    const provider = getWebAiProvider();
    const endpoint = provider === 'openai' ? '/api/generate-theme_openai' : '/api/generate-theme';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lyricsText, ...options }),
    });

    if (!response.ok) {
      // 带上状态码，便于上游区分「后端未部署（404）」与「后端返回了业务错误」。
      const errorData = await response.json().catch(() => ({} as { error?: string }));
      throw new Error(errorData.error || `AI theme endpoint failed with HTTP ${response.status}`);
    }

    const dualTheme = await response.json();
    return applyStoredAnimationIntensityToDualTheme(sanitizeDualTheme(dualTheme as DualTheme));
  } catch (error) {
    console.error("Failed to generate theme via API:", error);
    throw error;
  }
};

// The AI connection the web OBS overlay (Dynamic AI mode) generates a theme with. The overlay runs
// in a separate browser context, so it takes an explicit provider instead of reading anything from
// the app; the provider is selected by Docker runtime config or the Vite build fallback.
export interface ObsAiConfig {
  provider: 'gemini' | 'openai';
}

// OBS-overlay variant of generateThemeFromLyrics: keyless (the endpoint uses its own server env
// key), abortable, and with no Electron branch since the overlay is web-only. Used per song by the
// overlay; the caller falls back to the builtin theme if it rejects.
export const generateObsThemeFromLyrics = async (
  lyricsText: string,
  options: { isPureMusic?: boolean; songTitle?: string } | undefined,
  aiConfig: ObsAiConfig,
  signal?: AbortSignal,
): Promise<DualTheme> => {
  const endpoint = aiConfig.provider === 'openai' ? '/api/generate-theme_openai' : '/api/generate-theme';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lyricsText, ...(options ?? {}) }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || 'Failed to generate theme');
  }

  const dualTheme = await response.json();
  return applyStoredAnimationIntensityToDualTheme(sanitizeDualTheme(dualTheme as DualTheme));
};
