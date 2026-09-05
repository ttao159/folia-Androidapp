# Requirements Document

## Introduction

基于开源项目 Folia（https://github.com/ttao159/folia-major，React 19 + Vite 的全屏沉浸式歌词播放器）构建安卓 App。采用 Capacitor 将现有 Web 应用封装为原生 Android APK，首期聚焦 Navidrome 与本地音乐库两个音源（纯客户端、零后端），去除桌面端专属交互，实现横竖屏自适应与触屏流畅操作。架构上保留在线音源（网易云/酷狗/QQ）的可配置后端入口，未来可复用项目现有 Docker 方案接入。

## Glossary

- **Folia**：上游开源项目（folia-major），全屏沉浸式歌词播放器。
- **Capacitor**：将 Web 应用封装为原生移动应用的运行时（提供原生桥与插件）。
- **Navidrome**：兼容 Subsonic API 的自托管音乐服务器，客户端直连其 REST 接口。
- **本地音乐库**：存储在设备本地存储（或通过系统文件选择器授权）的音乐文件集合。
- **桌面专属功能**：依赖 Electron 主进程能力（`window.electron` 桥）、File System Access API 的目录选择器、键盘快捷键、OBS、mods、Discord 等仅在桌面端有意义的交互。
- **App**：本需求所构建的安卓应用。

## Requirements

### Requirement 1 — 应用安装与启动

**User Story:** 作为移动端用户，我想要在安卓设备上安装并打开 Folia，以便在手机上使用歌词播放器。

#### Acceptance Criteria

1. WHEN 用户在 Android 8.0（API 26）及以上系统安装 APK 并启动，App SHALL 展示 Folia 主界面。
2. WHILE App 首次启动，App SHALL 完成 Capacitor 运行时初始化并加载 Web 资源。
3. IF 设备 WebView 不支持某项浏览器能力，App SHALL 降级到替代实现或隐藏对应入口，而不使应用崩溃。

### Requirement 2 — 去除桌面端专属操作

**User Story:** 作为移动端用户，我不希望看到窗口控制、快捷键、文件拖拽等桌面专属功能，以便界面更简洁、操作更符合手机习惯。

#### Acceptance Criteria

1. WHEN App 运行在安卓环境，App SHALL 隐藏 Electron 窗口控制、标题栏拖拽区、点击穿透、壁纸模式、置顶、遥控窗口等桌面专属入口。
2. WHEN App 运行在安卓环境，App SHALL 停用键盘快捷键监听与桌面端热区判定。
3. WHEN App 运行在安卓环境，App SHALL 停用文件拖拽导入、OBS 直播源、mods 系统、Discord 状态、自动更新入口。
4. IF 代码引用了 `window.electron` 且未定义，App SHALL 走非 Electron 降级分支，不抛出异常。
5. WHEN App 运行在安卓环境，App SHALL 停用依赖 Node 原生模块的人声分离（onnxruntime-node / Python sidecar），并以服务端或隐藏方式处理该能力。

### Requirement 3 — Navidrome 登录与播放

**User Story:** 作为 Navidrome 用户，我想要在 App 内配置服务器地址并登录，以便播放我的 Navidrome 曲库。

#### Acceptance Criteria

1. WHEN 用户输入服务器地址、用户名、密码并连接，App SHALL 通过 Subsonic REST 验证凭据并建立会话。
2. WHILE 登录成功后，App SHALL 拉取并展示 Navidrome 的歌手、专辑、歌单、曲目列表。
3. WHEN 用户播放 Navidrome 曲目，App SHALL 通过预签名流地址直连播放音频。
4. IF 服务器地址不可达或凭据错误，App SHALL 展示可读的错误提示。
5. WHEN 用户退出登录，App SHALL 清除本地保存的会话状态。

### Requirement 4 — 本地音乐库导入与播放

**User Story:** 作为移动端用户，我想要通过系统文件选择器导入本地音乐，以便播放设备上的歌曲。

#### Acceptance Criteria

1. WHEN 用户点击导入本地音乐，App SHALL 调用 Capacitor 文件选择器（替代 `showDirectoryPicker`）选择文件或目录。
2. WHILE 导入完成，App SHALL 解析音频元数据（标题、艺术家、专辑、封面）并写入本地数据库。
3. WHEN 用户播放本地曲目，App SHALL 通过本地文件 URI 播放音频。
4. IF 用户拒绝文件授权，App SHALL 保持当前曲库并展示提示。

### Requirement 5 — 音乐播放核心

**User Story:** 作为移动端用户，我想要流畅播放音乐并查看全屏歌词，以便获得沉浸式听歌体验。

#### Acceptance Criteria

1. WHEN 用户选择曲目播放，App SHALL 使用 HTMLAudioElement 与 Web Audio API 输出音频。
2. WHILE 播放进行中，App SHALL 展示实时同步的歌词。
3. WHEN 用户锁屏或切后台，App SHALL 通过 Capacitor 后台播放能力保持音频播放，并暴露系统媒体控制（播放/暂停/上一首/下一首）。

### Requirement 6 — 横竖屏切换

**User Story:** 作为移动端用户，我想要在旋转屏幕时界面正确适配，以便横屏与竖屏都有良好体验。

#### Acceptance Criteria

1. WHEN 设备从竖屏旋转到横屏，App SHALL 重新布局主界面与播放器，不出现错位或空白。
2. WHILE 处于播放界面，App SHALL 根据方向调整歌词与可视化区域的比例。
3. WHEN 方向变化触发，App SHALL 重新初始化依赖窗口尺寸的画布（3D 网格、可视化），并保持当前播放状态。
4. IF 方向变化导致音频中断，App SHALL 在布局完成后恢复播放位置。

### Requirement 7 — 触屏交互与流畅化

**User Story:** 作为移动端用户，我想要通过触屏手势顺畅操作，以便获得接近原生 App 的体验。

#### Acceptance Criteria

1. WHEN 用户在网格、歌词、列表上滑动，App SHALL 通过触屏手势完成滚动、切换与拖动。
2. WHILE 列表包含大量条目，App SHALL 使用虚拟化渲染以控制内存与帧率。
3. WHEN 用户轻触进度条与音量条，App SHALL 响应拖动操作。
4. IF 设备触屏不支持悬停，App SHALL 将悬停交互替换为点击交互。

### Requirement 8 — 在线音源扩展入口（预留）

**User Story:** 作为长期规划，我希望在线音源（网易云/酷狗/QQ）未来可接入，以便扩展曲库来源。

#### Acceptance Criteria

1. WHEN 配置了在线音源后端地址，App SHALL 通过该地址完成登录与播放链接解析。
2. IF 未配置后端地址，App SHALL 隐藏在线音源入口而不报错。
