import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// test/unit/security/noHardcodedBackendAddress.test.ts
// 防止「开发机地址被打进发布产物」再次发生。
//
// 背景：这个仓库曾经把 .env 提交进版本库，内容形如
//   VITE_NETEASE_API_BASE=http://<某个公网 IP>:<端口>
// 而这些变量会被 vite 静态替换进产物——APK 里因此带着一个外部后端地址，
// 既连接不通（那台机器只对开发者可达），又把入口位置公开出去了。
//
// 这类问题的特点是：**构建、类型检查、单元测试全都是绿的**，只有真正装到手机上
// 或者去翻产物才会发现。所以用一条静态守卫把它钉死。
//
// 注意：本文件里的示例地址会被自身扫描到，故一律用占位写法（见 ALLOWED_* 注释）。

const REPO_ROOT = path.resolve(__dirname, '../../..');

// 只扫描会被打包/会被提交的文本类文件；这些目录不涉及「运行时可达的后端地址」。
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage', '.gradle',
    'android', 'ios', 'electron-dist', '.build-tools', 'vendor',
]);
const TEXT_EXT = new Set(['.env', '.example', '.local', '.android', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md']);

// RFC1918 / 环回 / 链路本地 / RFC5737 文档段：属于「本地或示例地址」，允许出现。
const LOCAL_ADDRESS = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+)/;
// 其余带端口的公网 IP 字面量：视为「硬编码的外部后端」。
const HARDCODED_PUBLIC = /https?:\/\/(?!(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.))\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?/g;

const collectFiles = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.env.example' && entry.name !== '.env.android') {
            if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
        }
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            collectFiles(path.join(dir, entry.name), out);
            continue;
        }
        const ext = path.extname(entry.name);
        if (TEXT_EXT.has(ext) || entry.name.startsWith('.env')) out.push(path.join(dir, entry.name));
    }
    return out;
};

describe('发布产物安全守卫', () => {
    it('.env* 与源码中不得出现硬编码的公网后端地址', () => {
        const offenders: string[] = [];

        for (const file of collectFiles(REPO_ROOT)) {
            // 白名单：守卫自身用正则描述规则，不包含具体地址。
            if (file === __filename) continue;

            const rel = path.relative(REPO_ROOT, file);
            const content = fs.readFileSync(file, 'utf8');
            for (const line of content.split('\n')) {
                if (!HARDCODED_PUBLIC.test(line)) continue;
                if (LOCAL_ADDRESS.test(line)) continue;
                HARDCODED_PUBLIC.lastIndex = 0;
                offenders.push(`${rel}: ${line.trim().slice(0, 120)}`);
            }
        }

        expect(offenders, [
            '发现硬编码的公网后端地址。这类变量在多环境配置里会被 vite 静态替换进产物，',
            '导致发布包里带着外部地址（连不通且泄漏入口）。',
            '正确做法：源码保持为空，环境相关地址只写在**未被跟踪**的 .env 里；',
            '安卓构建请用 `npm run build:android`（.env.android）。',
        ].join('\n')).toEqual([]);
    });

    it('.env 未被 git 跟踪（避免开发地址再次入库）', () => {
        // 用文件系统判断即可：.gitignore 必须覆盖 .env；这里直接查 git 的忽略结果。
        // 若仓库未初始化 git（如导出包），跳过该断言。
        let tracked: string;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { execSync } = require('child_process');
            tracked = execSync('git ls-files .env', { cwd: REPO_ROOT }).toString().trim();
        } catch {
            return;
        }
        expect(tracked, '.env 不应被 git 跟踪：请确认 .gitignore 含 `.env` 并已 git rm --cached').toBe('');
    });
});
