// src/services/runtimePlatform.ts
// 运行环境判定的单一来源。
//
// 为什么需要它：原生壳（Capacitor / Android App）**没有同源后端**，
// 任何依赖 `/api/*` 相对路径的功能都必须显式降级或改走原生层，
// 否则请求会打到本地资源服务器、得到 404（而不是被后端正常处理）。

/**
 * 当前是否运行在原生壳内。
 *
 * 判定条件必须与 `installAudioNativeCore` 的启用条件保持一致——
 * 否则会出现「跳过了 HTTP 兜底、但 fetch shim 也没装」的双输组合。
 */
export const isNativeShell = (): boolean => {
    if (typeof window === 'undefined' || !window) return false;
    const capacitor = (window as typeof window & {
        Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    return Boolean(capacitor?.isNativePlatform?.()) || capacitor?.getPlatform?.() === 'android';
};
