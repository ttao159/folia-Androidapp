# Folia Android

辞曲新境 · 全屏沉浸式歌词播放器 Android 版

基于 [Folia](https://github.com/chthollyphile/folia-major) 前端，通过 Capacitor 打包的原生 Android 应用。

## 特点

- 13 种全屏歌词动画，媲美文字 PV 的视觉效果
- AI 智能配色，基于歌曲情绪自动生成主题
- 支持网易云、酷狗、QQ 音乐及本地音乐库
- 逐词精准歌词，适配 LRC / TTML / QRC / YRC / KRC
- 响应式自适应排版，兼顾手机与平板
- Now Playing 接入外部播放器

## 构建

```bash
npm install && npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

## 技术栈

React + TypeScript + Capacitor + PixiJS + Vite

## 许可证

AGPL-3.0