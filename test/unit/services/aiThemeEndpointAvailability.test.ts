import { describe, expect, it } from 'vitest';
import { isAiThemeEndpointUnavailableError, isMissingAiApiKeyError } from '@/services/gemini';

// test/unit/services/aiThemeEndpointAvailability.test.ts
//
// 背景：`/api/generate-theme` 是同源相对路径，Web / Docker / Vercel 部署自带该后端；
// 原生壳（Android App）没有这层后端，请求会落到本地资源服务器并返回 404。
//
// 这类失败**不是用户能修的**（不是缺 key），必须被识别出来，交给调用方退回
// 封面派生配色（useThemeController 已有该兜底），而不是弹「主题生成失败」。
// 参考实现同样没有这个端点，只是没做识别 —— 于是 Android 上 AI 配色直接报错。

describe('AI 配色端点可用性识别', () => {
    it('带 HTTP 状态码的失败：404 / 405 视为端点不可用', () => {
        expect(isAiThemeEndpointUnavailableError(new Error('AI theme endpoint failed with HTTP 404'))).toBe(true);
        expect(isAiThemeEndpointUnavailableError(new Error('AI theme endpoint failed with HTTP 405'))).toBe(true);
    });

    it('返回了 HTML（落到静态资源服务器）视为端点不可用', () => {
        expect(isAiThemeEndpointUnavailableError(new Error('<!DOCTYPE html><html>Not Found</html>'))).toBe(true);
        expect(isAiThemeEndpointUnavailableError(new Error('<html><body>404</body></html>'))).toBe(true);
    });

    it('后端返回了业务错误时**不**误判为端点不可用（否则会掩盖真实问题）', () => {
        expect(isAiThemeEndpointUnavailableError(new Error('GEMINI_API_KEY is not configured'))).toBe(false);
        expect(isAiThemeEndpointUnavailableError(new Error('AI theme endpoint failed with HTTP 500'))).toBe(false);
        expect(isAiThemeEndpointUnavailableError(new Error('Rate limit exceeded'))).toBe(false);
    });

    it('与「缺 key」识别互不重叠：缺 key 归 isMissingAiApiKeyError', () => {
        const missingKey = new Error('openai_api_key is not configured');
        expect(isMissingAiApiKeyError(missingKey)).toBe(true);
        expect(isAiThemeEndpointUnavailableError(missingKey)).toBe(false);
    });
});
