import { expect, test } from '@playwright/test';
import { APP_VERSION } from './helpers/appState';

// test/ui/fusionSettings.spec.ts
// Verifies entering Fusion from the real settings UI and the fused glyph tuning controls it exposes.

// 新功能弹窗只在 lastSeenGuideVersion 不等于当前版本时弹出，会挡住所有点击。
// 直接读 package.json 对齐版本号，避免每次发版都要回来改这里。
test('enters Fusion from settings and exposes its tuning controls', async ({ page }) => {
    await page.addInitScript((version) => {
        localStorage.clear();
        localStorage.setItem('i18nextLng', 'en');
        localStorage.setItem('visualizer_mode', 'classic');
        localStorage.setItem('static_mode', 'true');
        localStorage.setItem('folia_last_seen_guide_version', version);
    }, APP_VERSION);
    await page.route('**/__mock_netease__/**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await page.evaluate(async () => {
        const storeModulePath = '/src/stores/useSettingsUiStore.ts';
        const { useSettingsUiStore } = await import(storeModulePath);
        useSettingsUiStore.getState().openSettings('options', 'visualizer', 'visualizer');
    });

    // The settings modal opens asynchronously; give the mode list a moment to render.
    await page.waitForTimeout(1500);

    const fusionMode = page.getByRole('button', { name: 'Fusion', exact: true });
    await expect(fusionMode).toBeVisible();
    await fusionMode.click();

    await expect(page.getByText('Fusion Settings', { exact: true })).toBeVisible();
    await expect(page.getByText('Decorative Glyphs', { exact: true })).toBeVisible();
    await expect(page.getByText('Print Halo', { exact: true })).toBeVisible();
    await expect(page.getByText('Glyph Scale Contrast', { exact: true })).toBeVisible();
    await expect(page.getByText('Glyph Motion', { exact: true })).toBeVisible();
    await expect(page.getByText('Release Spread', { exact: true })).toBeVisible();
    await expect(page.getByText('Ink Reveal', { exact: true })).toBeVisible();
    await expect(page.getByText('Camera Intensity', { exact: true })).toBeVisible();
    await expect(page.getByText('Texture Resolution', { exact: true })).toBeVisible();

    const visualizerMode = await page.evaluate(async () => {
        const storeModulePath = '/src/stores/useSettingsUiStore.ts';
        const { useSettingsUiStore } = await import(storeModulePath);
        return useSettingsUiStore.getState().visualizerMode;
    });
    expect(visualizerMode).toBe('fusion');
});
