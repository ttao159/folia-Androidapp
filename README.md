<p align="center">
  <img src="/img/head2.png" alt="Folia" width="100%" />
</p>

<div align="center">

# Folia Android

辞曲新境 · 全屏沉浸式歌词播放器 Android 版

[![GitHub release](https://img.shields.io/github/v/release/ttao159/folia-Androidapp?label=release)](https://github.com/ttao159/folia-Androidapp/releases)
[![License](https://img.shields.io/github/license/ttao159/folia-Androidapp)](https://github.com/ttao159/folia-Androidapp/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

## 项目简介

基于 [Folia](https://github.com/chthollyphile/folia-major) 前端，通过 Capacitor 打包的原生 Android 应用（appId `top.izuna.foliamajor`），在移动端提供完整的全屏歌词播放体验。

## 核心特点

- **13 种全屏歌词动画** — 交融、商籁、浮名、心象、群唱、镜台、时计、倾诉、云阶、流光等，媲美文字 PV 的视觉效果
- **AI 智能配色** — 基于歌曲情绪与歌词内容自动生成沉浸式主题与视觉参数
- **多平台音源** — 支持网易云、酷狗、QQ 音乐在线搜索播放，以及本地音乐库导入
- **精准逐词歌词** — 支持 LRC / TTML / QRC / YRC / KRC 格式，自动匹配在线歌词与封面
- **响应式自适应** — 排版随屏幕尺寸自动调整，兼顾手机竖屏与平板横屏
- **Now Playing 接入** — 支持外部播放器歌曲信息与时间轴驱动

## 构建

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

输出 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

## 获取方式

- **Release 下载**：前往 [Releases 页面](https://github.com/ttao159/folia-Androidapp/releases) 获取最新 APK
- **自行构建**：按上方构建步骤生成 APK

## 技术栈

React + TypeScript + Capacitor + PixiJS + Vite

## 许可证

[AGPL-3.0](LICENSE)