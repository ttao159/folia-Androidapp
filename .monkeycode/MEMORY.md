# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

### User Instruction Entry
User instruction entries should follow this format:

[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content of user teaching or instruction, described line by line]

### Project Knowledge Entry
Entries discovered by the Agent during task execution should follow this format:

[Project Knowledge Summary]
- Date: [YYYY-MM-DD]
- Context: Discovered by Agent while performing [specific task description]
- Category: [Operations & Deployment|Build Methods|Testing Methods|Troubleshooting & Debugging|Workflow & Collaboration|Environment Configuration]
- Instructions:
  - [Specific knowledge points, described line by line]

## Deduplication Strategy
- Before adding a new entry, check for similar or identical instructions.
- If a duplicate is found, skip the new entry or merge it with the existing one.
- When merging, update the context or date information.
- This helps avoid redundant entries and keeps the memory file tidy.

## Entries

[禁止无意义重复读取循环]
- Date: 2026-09-07
- Context: 用户在交融歌词布局调试过程中指出模型反复执行相同 grep/read 命令而不推进改动
- Instructions:
  - 当陷入无意义的重复读取（连续多次对同一文件/区域执行相同的 grep、sed、read 确认命令）时，必须立刻停止扫描动作。
  - 停止后先查明原因：区分「确实需要重新确认状态」与「在已掌握信息时仍反复验证」。若属于后者，直接基于已知信息动手编辑代码。
  - 每次只读取完成下一步改动所必需的最小范围；改动前一次性把相关上下文读全，改完用类型检查或测试验证，而不是靠反复重读来"确认自己没记错"。
  - 若发现自己第三次读取同一段内容仍未推进任务，应判定为循环并中断，转为实际编辑或向用户报告阻塞点。

[Android APK 构建环境]
- Date: 2026-09-05
- Context: Discovered by Agent while building the Android APK
- Category: Environment Configuration
- Instructions:
  - Gradle 构建需要 Java 21，JDK 21 位于 `/tmp/opencode/jdk21`（系统默认 `java` 是 17，直接跑 gradlew 会报 toolchain `languageVersion=21` 找不到）
  - Android SDK 位于 `/tmp/opencode/android-sdk`，`android/local.properties` 已配置 `sdk.dir`
  - 构建 APK 流程：`npm run build`（Vite 读取 `.env`）→ `npx cap sync android` → `cd android && JAVA_HOME=/tmp/opencode/jdk21 ANDROID_HOME=/tmp/opencode/android-sdk ./gradlew assembleDebug`
  - 构建产物：`android/app/build/outputs/apk/debug/app-debug.apk`，下载服务在容器 `0.0.0.0:8080`（`/tmp/opencode/apk-download`）

[每次任务开始前浏览 Skill 商店]
- Date: 2026-09-05
- Context: 用户要求每次开始工作或任务时先浏览 CocoLoop skill 市场
- Instructions:
  - 每次开始工作或任务前，浏览 https://hub.cocoloop.cn/ 以及用户已加入/收藏的 skill 专题，参考其中的任务技能以提高效率和工作能力
  - 该网站是第三方 AI Agent Skills 商店（CocoLoop），仅作浏览与参考；如需下载或执行第三方 skill，必须先查看安全评级与权限声明，实际运行风险自行承担

[手机后端部署与内网穿透]
- Date: 2026-09-05
- Context: Discovered by Agent while deploying mobile backend
- Category: Operations & Deployment
- Instructions:
  - 后端部署在闲置安卓手机 Termux（无云服务器），进程用 tmux 会话保活（`nohup` 关终端即被回收）
  - Termux 后端路径与端口：netease `/data/data/com.termux/files/home/netease-api`（3000）、qq `/data/data/com.termux/files/home/qq-api`（3200）、lyric-proxy `/data/data/com.termux/files/usr/lyric-proxy`（3400）
  - 公网通过 mefrp 暴露：先在 `mefrp.com` 控制台创建 TCP 隧道，再启动 frpc；frpc 命令需带 `tcp` 子命令，远程端口约需 ≥30000（过小报 `端口不在允许范围内`）
  - mefrp 端口映射：netease 3000→35691、qqmusic 3200→35246、lyricproxy 3400→44768；若报 `隧道当前在线` 需在控制台「强制下线」，报 `隧道已禁用` 需在控制台启用
  - 手机用 ZeroTermux（hanxinhao000/ZeroTermux，Termux 改版，默认清华/北航国内源），内置「定时任务」和「开机启动」
  - 开机自启执行 `~/.xinhao_history/start_command.sh`（不是官方 Termux:Boot 的 `~/.termux/boot/`）；该脚本须显式 `export PATH=/data/data/com.termux/files/usr/bin:...` 和 `export HOME=/data/data/com.termux/files/home`，否则开机时环境不完整、tmux/node 找不到而静默失败
  - 开机脚本建议把输出重定向到日志（如 `~/.xinhao_history/boot.log`）便于排查
  - vivo/iQOO（OriginOS）需同时：应用自启动允许 + 电池「允许后台高耗电」+ 最近任务锁定；且重启后需首次解锁才发开机广播
  - 网络：`termux-change-repo` 切清华/北航国内源后可直连、无需 VPN；未切源时所有镜像 `bad` 需开 VPN

[歌词动画视觉偏好]
- Date: 2026-09-05
- Context: 歌词动画预览迭代中用户明确表达的审美方向
- Instructions:
  - 背景偏好「浮名报章纸面」风格：纸张底色 + 四周线形几何光环（缺口圆环/方框/十字/星光）+ 报章栏线 + 按深度的视差；不要满屏色块海报式背景
  - 设置面板保持精简，只保留配色 / 字体 / 强度等核心项
  - 字体堆栈、字重、随机字号层次须对齐项目内商籁/浮名/凝彩的真实实现（fontStacks、resolveWordScales）
