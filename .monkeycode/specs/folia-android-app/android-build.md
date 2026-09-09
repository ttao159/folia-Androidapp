# Folia Android App 构建说明

本文档描述如何把改造后的 Folia 构建为 Android APK。代码改造已完成（Capacitor 集成、桌面功能裁剪、本地库文件导入、在线音源支持），最终 APK 打包需要在带 Android SDK 的环境执行。

## 前置要求

- Node.js >= 24（本环境已升级到 24.20.0）
- Android Studio（含 Android SDK Platform 34+、Build Tools、NDK 可选）
- JDK 17（Android Gradle Plugin 8.x 要求）

## 构建步骤

```bash
# 1. 安装依赖（若尚未安装；Electron 二进制可跳过，纯 Android 构建用不到）
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install

# 2. 构建 Web 产物到 dist/
npm run build

# 3. 同步 Web 产物到 Android 工程（首次会生成 android/ 目录）
npx cap sync android

# 4. 打开 Android 工程，用 Android Studio 或 Gradle 打包
cd android
./gradlew assembleDebug        # debug APK，位于 android/app/build/outputs/apk/debug/
# ./gradlew assembleRelease   # release APK（需配置签名）
```

首次 `npx cap add android` 若尚未生成 `android/` 目录，可先执行：

```bash
npx cap add android
```

## 后台播放配置（MediaSession / 锁屏控制）

渲染层已通过 Web `navigator.mediaSession` 暴露播放/暂停/上一首/下一首。要让 Android 在锁屏与切后台时持续出声，需在 `android/` 工程配置前台音频服务：

1. 在 `AndroidManifest.xml` 声明：
   - `FOREGROUND_SERVICE` 与 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限
   - `android.permission.WAKE_LOCK`
2. 主 Activity 内启动一个 `MediaSessionCompat` + `ExoPlayer`/`AudioTrack` 前台服务，或引入 Capacitor 社区后台音频插件（如 `@capacitor-community/background-audio`）。
3. WebView 设置 `setMediaPlaybackRequiresUserGesture(false)` 允许自动播放。

首期若未接入前台服务，锁屏/切后台时音频会暂停，但应用内播放、媒体元数据显示均正常。

## 在线音源后端配置

在线音源（网易云、QQ 音乐、汽水音乐）均依赖自托管 API 后端，构建前需在构建环境中提供对应环境变量：

| 音源 | 环境变量 | 后端 |
|------|----------|------|
| 网易云 | `VITE_NETEASE_API_BASE` | NeteaseCloudMusicApi 或兼容实现 |
| QQ 音乐 | `VITE_QQ_API_BASE` | 自托管 qq-music-api 或兼容实现 |
| 汽水音乐 | `VITE_QISHUI_API_BASE` | [qishui-api](https://github.com/guowenye/qishui-api) |

汽水音乐在 Android 版仅支持登录、搜索、歌单浏览与歌词展示，不支持在线播放（汽水音频为 AES 加密，qishui-api 无明文直链）。酷狗音源已从在线音源 UI 移除，仅保留其公开搜索接口用于本地歌词匹配，无需配置 `VITE_KUGOU_API_BASE`。

变量需在 `npm run build` 前注入（如 `.env`、`.env.local` 或 shell 环境变量），构建时 `vite` 会将其编译进产物，随后 `npx cap sync android` 同步到 APK。

## Navidrome 服务器配置

Navidrome 是纯客户端直连，无需后端。仅需确保 Navidrome 服务器的 CORS 允许应用来源，或使用 Capacitor 默认的 `https://localhost` 来源；若 Navidrome 未开启 CORS，可在其配置中设置 `BaseUrl` 并允许对应 Origin，或在应用侧走同源代理（后续可加）。

## 横竖屏说明

应用已通过各画布组件的 `resize` 监听在屏幕旋转时自动重绘（网格、可视化、歌词轨道均已覆盖）。竖屏为默认主布局，横屏时播放器与歌词区域自动放大。无需额外方向锁定代码。

## 已裁剪的桌面功能

以下桌面专属能力在移动端不渲染或自动降级：窗口控制、标题栏拖拽、点击穿透/壁纸模式、置顶、遥控窗口、快捷键、文件拖拽导入、OBS 直播源、mods 系统、Discord 状态、自动更新、AI 人声分离（onnxruntime-node / Python）。
