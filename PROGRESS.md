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

## 四、本轮追加（"怎样更好"）——测试 + 激活修复

### A. 契约测试（新增 12 个，全绿）
背景：`src/audioNative/**/*.js` 是纯 JS，`tsconfig` 只开 `allowJs`（解析、**不做类型检查**），
所以「接线写错」在 `tsc` 和 `gradle` 里都是绿的，只有装到手机上才炸。补了两层：
- `test/unit/services/audioNativeBridge.test.ts`（6）：PING/PONG 握手、请求形状、
  响应按 id 回包、未实现路由返回 `__foliaBridgeError`。
- `test/unit/services/bridgeTransportWiring.test.ts`（6）：**transport → 桥**的接线。
  ⚠️ 这层是必要的：初版只测桥自身时，把 transport 里的 `params` 改成 `query` 测试**照样全绿**；
  补上这层后，同样的变异会让 2 个测试立刻变红（已实测验证）。

手搓 `window` 桩（仓库约定：node 环境、无 jsdom）。两个坑记一下：
- `vi.stubEnv` **改不动 `import.meta.env`**（Vite 编译期静态替换），且仓库的真实 `.env`
  会被 vitest 加载——网易云的桥分支在测试里因此进不去，这是环境事实，不是缺陷。
- `netease.ts` 用的是**裸 `fetch`**，node 下与 `window.fetch` 不是同一个，
  必须同时指向 mock，否则会打到真实网络（初版就误连了内网地址）。

### B. 激活修复（关键：不做这个，A 在手机上等于没生效）
发现：`.env` 是**被 git 跟踪的**（`.gitignore` 只忽略 `.env*.local`），内容指向开发机内网
（`VITE_NETEASE_API_BASE` / `VITE_QQ_API_BASE` / `VITE_LYRIC_PROXY_BASE` 三个变量，
均为 `http://<内网IP>:<端口>` 形式，详见下节 C 的处置）：
`vite build` 会把它烤进 `dist`（实测 `dist/assets/songMetadata-*.js` 里确有该 IP），
而 `netease.ts` 的判定是 `extensionConfigured || !configuredApiBase` —— 两者都不满足，
**桥分支永远不会进**，手机只会去连那个内网地址。

修复：新增 `.env.android` + `npm run build:android`（`vite build --mode android`）。
Android 模式注入：`NETEASE=`（空→自动走桥）/ `QQ=extension` / `KUGOU=extension` /
`QISHUI=`（不提供）/ `LYRIC_PROXY=`（见下）。
验证：`npm run build:android` 后 `dist/` 内**已无该内网 IP**，注入值逐项核对正确。

## 六、审计处置（"你决定"）—— 2026-10-13

### 已做
1. **防复发守卫**（最有价值的产出）：`test/unit/security/noHardcodedBackendAddress.test.ts`
   - 扫描仓库内 `.env*` 与源码，禁止出现硬编码的**公网**后端地址
     （RFC1918 / localhost / 链路本地放行；私网与公网按 `ipaddress` 同口径区分）
   - 附带断言 `.env` 未被 git 跟踪
   - **已做变异验证**：注入 `http://93.184.216.34:8080` 后测试立刻变红并精确报出文件行号
   - 为什么重过重写历史：重写只清一次、且对已 fork/clone 的人无效；
     守卫对**此后每一次提交**生效。
2. **AI 配色在原生壳内收敛**：
   - 新增 `isAiThemeEndpointUnavailableError`（识别 HTTP 404/405、HTML 响应）
   - `useThemeController` 复用它，走**已有的** cover 派生兜底（与「缺 key」同路径），
     不再对用户弹「主题生成失败」
   - `gemini.ts` 的错误信息带上状态码，便于区分「后端未部署」与「后端业务报错」
   - 新增 `test/unit/services/aiThemeEndpointAvailability.test.ts`（4）
3. **抽出 `src/services/runtimePlatform.ts`**：把重复在 5 处的「原生壳」判定集中一处
   （含我曾复制进的 `audioNativeInstaller`），并使降级条件与 shim 安装条件同源。

### 明确不做
4. **不重写 git 历史**：破坏性、影响已合并的 PR；且清历史**不解决**真实风险
   （轮换/下线那些服务才解决）。已在审计节记录该地址仍可从远程历史检索到。
5. **不修既有失败测试**：诊断结论是确定性逻辑漂移，非 flaky、与本轮无关：
   - `appDatabaseMigration:82,123` → `expected 1 to be 0.9`
   - `onlineProviderAccountStore:55` → `expected 'netease' to be 'kugou'`
   - `localMusicService`×2、`tuningRegistry`×1
   （`themeSyncRegistry`×2 确认为时序 flaky，稳定复现时需要隔离 IndexedDB 时序。）
   不了解设计意图就改会掩盖真实回归，留作独立任务。

### 验证
`tsc` 通过；`npm test` → **2518 passed / 6 failed（全部在原基线集合内，零新增）**；
`vite build --mode android` + `assembleDebug` → **BUILD SUCCESSFUL**；
APK 内仅剩 `127.0.0.1:32107/32109`（localhost，属允许类），**无任何后端地址**。


## 七、审计发现（"还有什么"）—— 2026-10-13

> 「发现 1/2/3」是审计**结论**（问题在哪）；上方第六节是**处置**（怎么处理的）。

### 核查为正常的项
- `dist/` 未被 git 跟踪；产物内已无开发机地址（APK 内网 IP 命中数 = 0）。
- `VITE_*` 注入值正确（NETEASE 空 / QQ·KUGOU=extension / LYRIC_PROXY 空）。
- 源码里的 `localhost` / `127.0.0.1` 均为合法用途（Electron OBS 集成、Navidrome
  服务器地址用户自填、歌词 API 本地端口），**不是**被误打包的开发配置。
- `audioNative/api/router.js` 覆盖 60+ 条 `/api/*` 路由：三源音源、歌词、封面、
  `/api/audio`（走内部 `proxyFetch`，含 Range/referer）、beatmap、weather、podcast 等。

### 发现 1（安全）：那个 IP 是公网地址，且已推送到 GitHub（处置见第六节）
`<redacted-host>` **不是内网地址**——`ipaddress` 判定 `is_global=True`（RFC1918 才会是 private）。
三个端口分别暴露 API / QQ API / 歌词代理。
- 引入：`60711ba`（**已推送，`origin/main` 就在该提交**）
- 移除：`fa5112c`（本次，尚未推送）
→ 远程仓库历史里仍可检索到该地址与端口。若这些服务仍在运行，等于公开了入口位置。
处置需重写历史并 force push（破坏性，需确认）。

### 发现 2（功能缺口）：AI 智能配色在 Android 上不可用（处置见第六节）
- `src/services/gemini.ts:31,70`：`fetch('/api/generate-theme')` —— **同源相对路径**。
- `router.js` **未**覆盖该路由 → 内置桥不接管。
- Android 无同源后端 → Capacitor 下打到本地资源服务器 → 404。
- 用户可见行为：`useThemeController` 捕获后 `isMissingAiApiKeyError` 判定失败
  （不是缺 key 的错误），最终提示 `status.themeGenerationFailed`（"主题生成失败"）。
- **参考仓代码完全相同、同样缺失** → 属两个仓库共有的缺口，非本次移植引入。
- 根因（推测，合理但未逐个确认）：AI key 是服务端变量（`GEMINI_API_KEY` / `OPENAI_API_KEY`，
  无 `VITE_` 前缀），设计上刻意不打包进客户端；而移动端没有部署那层后端。
- 而 README 把「AI 智能配色，自动生成主题」列为**首条卖点**；既有规范
  `.monkeycode/specs/.../android-build.md` 只把「AI **人声分离**」列为移动端降级，
  未提 AI 配色 → 存在预期落差。

### 发现 3（既有，与本次改动无关）
`npm test` 仍有 7~9 个失败，均已用改动前基线确认同集合：
appDatabaseMigration×2、localMusicService×2、onlineProviderAccountStore、tuningRegistry、
themeSyncRegistry×2（时序 flaky，单独跑通过）。

`.env` 原先被 git 跟踪，且指向开发机内网：
```
VITE_NETEASE_API_BASE / VITE_QQ_API_BASE / VITE_LYRIC_PROXY_BASE  ->  开发机内网地址
```
`vite build` 会把它烤进 `dist`，Android 上既连不通、又把内网拓扑带进发布包。现已按下述方式根除：

1. **`.env` 取消跟踪并清空**：`git rm --cached .env`；内容改为全空的本地模板。
   `.gitignore` 从「只忽略 `.env*.local`」改为忽略 `.env`，并显式保留
   `.env.example` / `.env.android`（`!.env.example` / `!.env.android`）。
2. **封面与歌词改走原生层**：`API_HOSTS` 补入 `y.gtimg.cn`、`kgimg.com`、
   `amll-ttml-db.stevexmh.net`，由 OkHttp 取二进制/JSON，不再依赖任何代理。
3. **`buildLyricProxyUrl` 在原生壳内直接返回原 URL**：不再拼 `/api/lyric-proxy`
   （Capacitor 下会落到本地资源服务器 → 404），也不需要外部代理地址。
   判定条件与 `installAudioNativeCore` 的启用条件保持一致，避免「跳过代理但 shim 没装」。
4. **附带的测试收益**：那串被跟踪的 `.env` 一直在污染测试——`coverCache`(×2) 与
   `amllDbProvider` 三个用例原本失败，正是因为 `VITE_LYRIC_PROXY_BASE` 让 URL 变成了
   内网地址、而非预期的同源相对路径。清掉内网后**这三个自动转绿**。
   当前基线：`2510 passed / 8 failed`，失败集合全部落在原基线内（未修复的那几个：
   appDatabaseMigration×2、localMusicService×2、onlineProviderAccountStore、tuningRegistry），
   其中 `themeSyncRegistry×2` 是既有的时序 flaky（单独跑 3/3 通过）。
   → **净效果：修复 3 个既有失败，零新增。**
5. 新增 `test/unit/services/lyricProxyBase.test.ts`（5）：壳内直连原始 URL、壳外行为不变、
   白名单覆盖 `y.gtimg.cn` / `kgimg.com` / AMLL。（`isBridgedApiUrl` 内用 `location.href`，
   node 环境需补 `location` 桩，否则会走 catch 一律 false，变成假阴性。）

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

## 八、待决策（阻塞，需问用户）

- **汽水音乐**：参考仓无实现、本仓库无后端源码 → 无法随 A 一起上设备。
  建议：本轮只让 网易云/QQ/酷狗 三源走桥；汽水保留原「外部 base URL」路径。
  若要连汽水一起设备化，需要另写 `audioNative/api/qishui.js`（新工作，等于自研音源协议）。
- 参考仓第 4 个源是**波点（bodian）**，本项目没有该 provider。是否顺带引入？建议不引入（超出 A 范围）。

## 九、关键文件位置
- 参考仓：`/tmp/folia-ref`（base 访问）
- 桥协议：`/tmp/folia-ref/src/services/foliaExtensionBridge.ts`、`audioNativeInstaller.ts`、
  `/tmp/folia-ref/src/audioNative/api/folia.js`（请求路由）
- 原生插件参考：`/tmp/folia-ref/android/app/src/main/java/top/izuna/foliamajor/FoliaCorePlugin.java`
- 项目既有规范：`.monkeycode/specs/folia-android-app/{requirements,design,tasklist,android-build}.md`
  （注意：`android-build.md` 写于更早版本，称「酷狗已移除、汽水仅支持展示」，
  与本仓库当前 `src/services/onlineMusic/` 的 provider 集合**不一致**，以代码为准。）
