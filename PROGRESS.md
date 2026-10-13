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

## 三、状态（A 已完成并构建验证）

1. ✅ **类型检查**：`npx tsc --noEmit` 全绿。
2. ✅ **测试**：`npm test` → 2491 passed / 9 failed；`git stash` 基线对比确认这 9 个
   （6 个文件：coverCache、amllDbProvider、appDatabaseMigration、localMusicService、
   onlineProviderAccountStore、tuningRegistry）**改动前即为红**，本次零回归。
3. ✅ **前端构建**：`npm run build` → `✓ built in 8.81s`，`dist/` 140 文件；
   `audioNative` 已打包（`dist/assets/folia-*.js` 267KB）。
4. ✅ **真实 APK**：`npx cap sync android` + `gradle assembleDebug` → **BUILD SUCCESSFUL**，
   产物 `android/app/build/outputs/apk/debug/app-debug.apk`（12MB）。
   已核验 APK 内含：`FoliaCorePlugin`（classes9.dex）、`okhttp3`（classes.dex/9）、
   `assets/public/assets/folia-*.js`（设备内音源协议）。
5. ✅ **提交**：`e02e909`（+ 本进度文件）。
6. ✅ **汽水通道决策：保留现状（选项①）**。已核实是**零代码改动**即成立：
   - `audioNativeInstaller` 的 fetch shim 只拦截白名单 `API_HOSTS`
     （163 / qq / kugou / kuwo / weixin / qrserver），**不含任何汽水域名**
     → 汽水请求原样走 `originalFetch`，未被桥劫持。
   - `getQishuiTransportAvailability()`：base 未配置时返回
     `{configured:false, reason:'not-configured'}` → 入口隐藏（不报错），行为与改动前一致。
   - `.env.example` 已补充：`extension` 语义、各 provider 实际判定、汽水不在桥内（并补了缺失的
     `VITE_KUGOU_API_BASE` 条目）。提交 `0014813`。
7. ⬜ **vite env**：`VITE_*_API_BASE=extension` 尚未写入配置。当前逻辑：
   netease 在 base 未配置时也走桥；kugou/qq 在 `runtime hostname === 'extension'` 时走桥。
   若要显式强制走桥，需在构建环境设 `VITE_NETEASE_API_BASE=extension` 等。

### 本机构建环境（下次直接复用）
- JDK：`/usr/lib/jvm/java-21-openjdk-arm64`（apt 装的 openjdk-21-jdk-headless）
- Android SDK：`/opt/android-sdk`（platform-36 + build-tools 36.0.0 + cmdline-tools latest）
- Gradle：`/opt/gradle/gradle-8.14.3/bin/gradle`（**用它，不要用 `./gradlew`**——
  wrapper 要联网下发行包且 networkTimeout 只有 10s，本环境会超时；
  `gradle-wrapper.properties` 已还原为原始 url，未改动）
- `android/local.properties` 写 `sdk.dir=/opt/android-sdk`（已被 gitignore）
- 构建命令：
  ```
  cd android && JAVA_HOME=/usr/lib/jvm/java-21-openjdk-arm64 \
    ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk \
    PATH=/opt/gradle/gradle-8.14.3/bin:$PATH gradle assembleDebug --no-daemon
  ```
- `.build-tools/`（工作区内的下载缓存）**不要提交**。

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
