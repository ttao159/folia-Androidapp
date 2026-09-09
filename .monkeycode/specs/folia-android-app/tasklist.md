# 需求实施计划

- [ ] 1. 搭建项目骨架与 Capacitor 工程
  - [ ] 1.1 将上游 folia-major 代码落地到工作区并升级 Node 至 24
    - 复制上游源码到工作区，安装 Node 24，确保 `npm install` 与 `vite build` 可跑通
  - [ ] 1.2 初始化 Capacitor 配置与原生壳
    - 添加 `capacitor.config.ts`、`@capacitor/core`、`@capacitor/android`
    - 安装 `@capacitor/filesystem`、`@capacitor/status-bar`、后台播放插件
  - [ ] 1.3 创建平台能力判定 hook（usePlatformCapabilities）
    - 返回 `{ isNative, isDesktop, isTouch, hasElectron }`，替代散落 UA 判断（对应需求 2、7）

- [ ] 2. 裁剪桌面专属功能
  - [ ] 2.1 隐藏窗口控制与自绘标题栏
    - 处理 `WindowControls.tsx`、`TitlebarDragZone.tsx`、`AppShell.tsx` 标题栏（对应需求 2.1）
  - [ ] 2.2 停用桌面快捷键监听
    - 处理 `usePlaybackInteractionBridge.ts`、`CommandPalette.tsx` keydown（对应需求 2.2）
  - [ ] 2.3 停用文件拖拽/OBS/遥控/mods/Discord/自动更新入口
    - 处理 `ModsPanelTab.tsx`、`obs/`、`remote/`、`mods/` 相关入口（对应需求 2.3）
  - [ ] 2.4 补齐 Electron 桥降级分支
    - 确保 `window.electron` 未定义时全部走非 Electron 分支，不抛异常（对应需求 2.4、正确性 1）
  - [ ]* 2.5 为环境判定与降级分支编写单元测试

- [ ] 3. 检查点 - 确认 Web 构建通过且桌面专属功能已隐藏

- [ ] 4. 本地音乐库适配
  - [ ] 4.1 实现 Capacitor 文件选择器适配层
    - 新建 `src/services/capacitor/` 封装 SAF 文件/目录选择与 blob 读取（对应需求 4.1）
  - [ ] 4.2 替换 showDirectoryPicker 调用
    - 改造 `localMusicService.ts`、`localLibraryAvailability.ts` 守卫逻辑（对应需求 4.2、正确性 3）
  - [ ]* 4.3 为文件导入流程编写单元测试

- [ ] 5. Navidrome 登录与播放验证
  - [ ] 5.1 验证 Navidrome 移动端登录/网络流程并补齐错误提示
    - 复用 `navidromeService.ts`，验证 Android WebView 行为，补齐连接失败提示（对应需求 3.4）
  - [ ]* 5.2 为 Navidrome token 计算与错误分支编写单元测试

- [ ] 6. 横竖屏与响应式适配
  - [ ] 6.1 新增方向监听并重新初始化尺寸依赖画布
    - 处理 `Grid3D.tsx`、`GridView.tsx`、visualizer 方向变化重绘（对应需求 6.3）
  - [ ] 6.2 补齐移动端布局断点
    - 处理 `SettingsModal.tsx`、`FloatingPlayerControls.tsx` 等浮层触屏布局（对应需求 6.1、6.2）

- [ ] 7. 触屏交互与流畅化
  - [ ] 7.1 悬停交互替换为点击交互
    - 统一处理 `(hover: hover)` 分支，提供触屏替代（对应需求 7.4）
  - [ ] 7.2 验证并优化列表虚拟化与手势
    - 复用 `react-window` 虚拟列表，确保触屏滚动流畅（对应需求 7.2）

- [ ] 8. 后台播放与系统媒体控制
  - [ ] 8.1 集成后台播放与 MediaSession
    - 注册 Android MediaSession，暴露播放/暂停/上一首/下一首（对应需求 5.3）

- [ ] 9. 检查点 - 确认核心播放、Navidrome、本地库、横竖屏在模拟器可用

- [ ] 10. 构建与打包配置
  - [ ] 10.1 完成 Web 构建与 cap sync
    - `vite build` 产出后 `npx cap sync android` 生成 android 工程
  - [ ] 10.2 提供 APK 本地打包说明
    - 编写 Android Studio 打包步骤，产出 debug/release APK
