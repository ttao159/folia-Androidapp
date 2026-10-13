# PROGRESS — A 方案：移植原生桥（folia-android → 本项目）

目标：参考仓 https://github.com/Timingyyds/folia-android（v1.4.0，上游 folia-major 0.7.16）的
「原生桥架构」移植到本项目（0.7.0）。用户选择：**A-精简（只搬桥，现网 transport 接桥）**、
**覆盖全部音源**、**真实构建 assembleDebug 验证**。

参考仓已克隆到沙箱 `/tmp/folia-ref`（不在工作区，read 工具越界，一律用 base 读取）。

---

## 一、已确认的架构事实（侦察阶段）

1. 桥的完整链路：
   ```
   transport → requestFoliaExtension({provider, operation, ...})
      ↓ window.postMessage 「模拟扩展协议」
   audioNativeInstaller: ① window.fetch shim（已知域名→原生）② chrome.* shim
      ↓
   src/audioNative/api/*.js  ← 设备内的音源协议实现（签名/端点/解析）
      ↓ 被 shim 拦截的 fetch
   FoliaNative.httpRequest (OkHttp) + CookieManager
   ```
   开关：`VITE_*_API_BASE === 'extension'`（`isFoliaExtensionBridgeConfigured`）。
2. 原生插件**只做原始 HTTP + Cookie**；音源协议在 `audioNative/`（JS）里 —— 所以必须连
   `audioNative/` 一起搬进 WebView，否则「无后端」不成立。
3. `src/audioNative/` 自包含：唯一外部依赖 `qrcode`（被 `api/qrImage.js` 引用）。
4. nodejs-mobile 是**已弃用的历史方案**（README 原文），`jniLibs/` 为空，
   `libnode.so` / `nodejs-project.zip` 都不在仓库里 → **不需要 NDK**。
5. 参考仓音源 = netease / qq / kugou / **bodian（波点）**。
   **汽水（qishui）在参考仓没有实现，本仓库也没有汽水后端源码**（`qishui-api` 是外部服务，
   `VITE_QISHUI_API_BASE`）→ 汽水**无法上设备**，需用户决策（见「待决策」）。
6. 参考仓内置桥返回**扁平**结构（如 `userId`），托管后端返回嵌套结构 → transport 需形状归一化。
7. 本项目 `src/services/onlineMusic/` 里：`netease.ts` 在 `src/services/`，
   其余 provider 用 `*Transport.ts`（kugou/qq），且**没有** `toKugouProviderError` 等参考仓辅助函数。

## 二、已完成（代码已落到工作区）

### 原生层
- `android/app/src/main/java/top/izuna/foliamajor/FoliaCorePlugin.java`（新建，326 行）
  从参考仓 `FoliaCorePlugin.java` **用 sed 精确抽取** HTTP/Cookie 子集：
  `httpRequest` / `httpDownload` / `getCookies` / `setCookie` / `clearCookies` + Cookie 辅助方法。
  （切忌手抄：工具输出会把疑似密钥的字符串显示成 `[REDACTED]`，只有磁盘字节才可靠。）
  已校验：无 `REDACTED` 字面量、花括号 48/48 平衡、`parseCookieHeader` 等辅助方法齐全。
- `android/app/src/main/java/top/izuna/foliamajor/MainActivity.java`（重写）：`registerPlugin(FoliaCorePlugin.class)`。
- `android/app/build.gradle`：加 `implementation 'com.squareup.okhttp3:okhttp:4.12.0'`。
- `android/app/src/main/AndroidManifest.xml`：加 `ACCESS_NETWORK_STATE`。

### 前端桥
- `src/audioNative/`（整体复制，自包含）
- `src/services/foliaExtensionBridge.ts`（复制）
- `src/services/audioNativeInstaller.ts`（复制，420 行）
- `src/index.tsx`：`import { installAudioNativeCore }` + 在挂载前 `void installAudioNativeCore();`
- `package.json`：新增 `qrcode ^1.5.4`。

### transport 接桥（已改，未验证）
- `src/services/onlineMusic/kugouTransport.ts`：import 桥；`getKugouTransportAvailability` 识别 `extension`；
  `requestKugou` 增加 extension 分支；新增 `toKugouProviderError` / `readBridgeAccountId` / `persistBridgeAccountHint`。
- `src/services/onlineMusic/qqTransport.ts`：import 桥；availability；`requestQq` extension 分支 + `__foliaBridgeError` 映射。
- `src/services/netease.ts`：import 桥；`fetchWithCreds` 最前面加 extension 分支
  （`!isElectronRuntime() && (extensionConfigured || !configuredApiBase)`，依赖 `getConfiguredApiBase()`，
  **该函数是否存在尚未验证**）。

### 环境
- 装好 JDK 21（`/usr/lib/jvm/java-21-openjdk-arm64`，需先 `apt-get -f install` 修依赖树）。
- 装好 `cmdline-tools` + `platforms;android-36` + `build-tools;36.0.0`（`/opt/android-sdk`）。
- `npm install` 已完成（766 包，`node_modules/qrcode` 就位）。

## 三、未完成 / 下一步

1. **验证并修复类型错误**：`npx tsc --noEmit`（重点：`netease.ts` 的 `getConfiguredApiBase`、
   我们的 `OnlineProviderError` 构造签名、`requestFoliaExtension` 的泛型与参数类型）。
2. **移植 audioNativeInstaller 的依赖闭包**：它可能引用参考仓独有模块（`nativeRemoteAudio` 15 行、
   `nativePlaybackBridge` 67 行、本地库等），需逐个补齐或裁剪（先做 import 闭包追查）。
3. **qishui 通道决策**（见下）。
4. **vite env**：确认/新增 `VITE_*_API_BASE` 的 `extension` 语义（`.env.example`）。
5. **构建验证**：
   `npm run build` → `npx cap sync android` →
   `cd android && JAVA_HOME=/usr/lib/jvm/java-21-openjdk-arm64 ANDROID_HOME=/opt/android-sdk ./gradlew assembleDebug`
   （Gradle 版本是否支持 JDK21/AGP 需现场确认；`compileSdk` 本项目已是 36）。
6. **测试**：`npx vitest run`（增量测试 + 全量不回归）。
7. **提交**：按 `.monkeycode/MEMORY.md` 要求，改动后必须 git commit + 测试通过。

## 四、待决策（阻塞，需问用户）

- **汽水音乐**：参考仓无实现、本仓库无后端源码 → 无法随 A 一起上设备。
  建议：本轮只让 网易云/QQ/酷狗 三源走桥；汽水保留原「外部 base URL」路径。
  若要连汽水一起设备化，需要另写 `audioNative/api/qishui.js`（新工作，等于自研音源协议）。
- 参考仓第 4 个源是**波点（bodian）**，本项目没有该 provider。是否顺带引入？建议不引入（超出 A 范围）。

## 五、关键文件位置
- 参考仓：`/tmp/folia-ref`（base 访问）
- 桥协议：`/tmp/folia-ref/src/services/foliaExtensionBridge.ts`、`audioNativeInstaller.ts`、
  `/tmp/folia-ref/src/audioNative/api/folia.js`（请求路由）
- 原生插件参考：`/tmp/folia-ref/android/app/src/main/java/top/izuna/foliamajor/FoliaCorePlugin.java`
- 项目既有规范：`.monkeycode/specs/folia-android-app/{requirements,design,tasklist,android-build}.md`
  （注意：`android-build.md` 写于更早版本，称「酷狗已移除、汽水仅支持展示」，
  与本仓库当前 `src/services/onlineMusic/` 的 provider 集合**不一致**，以代码为准。）
