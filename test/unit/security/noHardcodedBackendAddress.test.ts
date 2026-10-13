import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// test/unit/security/noHardcodedBackendAddress.test.ts
// 防止「开发机地址被打进发布产物」再次发生。
//
// 背景：这个仓库曾把 .env 提交进版本库，内容形如 `VITE_*_API_BASE=http://<公网IP>:<端口>`，
// 而 vite 会把这些变量静态替换进产物 —— APK / 安装包里因此带着外部后端地址，
// 既连不通（那台机器只对开发者可达），又把入口位置公开了出去。
//
// 这类问题的特点是：**构建、类型检查、单元测试全绿**，只有装到手机上或翻产物才会发现。
// 所以用一条静态守卫钉死它。
//
// 演进记录：初版只认「带 http:// 前缀」的写法，结果我在 PROGRESS.md 里顺手写下真实
// `IP:端口` 时它没拦住 —— 泄漏以裸 IP 形式回流。现改为按 IPv4 八位组校验，
// 无论有无协议前缀、有无端口都能识别。

const REPO_ROOT = path.resolve(__dirname, '../../..');

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage', '.gradle',
    'android', 'ios', 'electron-dist', '.build-tools', 'vendor',
]);
const TEXT_EXT = new Set([
    '.env', '.example', '.local', '.android', '.ts', '.tsx', '.js', '.jsx',
    '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.sh',
]);

/** 允许出现的地址：环回 / 私有 / 链路本地 / RFC5737 文档段（这些不可能是真实后端）。 */
const isAllowedIpv4 = (octets: number[]): boolean => {
    const [a, b, c] = octets;
    if (a === 0 || a === 127) return true;                      // unspecified / loopback
    if (a === 10) return true;                                  // RFC1918
    if (a === 192 && b === 168) return true;                    // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true;           // RFC1918
    if (a === 169 && b === 254) return true;                    // link-local
    if (a === 192 && b === 0 && c === 2) return true;           // TEST-NET-1
    if (a === 198 && b === 51 && c === 100) return true;        // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true;         // TEST-NET-3
    return false;
};

// 前面紧跟 `字母/` 的是「产品/版本」写法（如 UA 里的 Chrome/120.0.0.0），不是主机地址。
// 注意不能简单地排除「前一个字符是 /」，否则会把 http://1.2.3.4 也一起漏掉。
const IPV4 = /(?<![A-Za-z]\/)\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;

/** 返回该行中所有「看起来像真实后端的公网 IPv4」字面量（含端口写法也能命中其 IP 部分）。 */
const findPublicIps = (line: string): string[] => {
    const hits: string[] = [];
    IPV4.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IPV4.exec(line)) !== null) {
        const octets = [match[1], match[2], match[3], match[4]].map(Number);
        // 版本号之类通常不是合法 IPv4（八位组 >255），借此排除误伤。
        if (octets.some((n) => n > 255)) continue;
        if (isAllowedIpv4(octets)) continue;
        hits.push(match[0]);
    }
    return hits;
};

const collectFiles = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
        const self = path.relative(REPO_ROOT, __filename);

        for (const file of collectFiles(REPO_ROOT)) {
            const rel = path.relative(REPO_ROOT, file);
            if (rel === self) continue; // 守卫自身用规则描述模式，不含具体地址

            const content = fs.readFileSync(file, 'utf8');
            for (const line of content.split('\n')) {
                const hits = findPublicIps(line);
                if (hits.length === 0) continue;
                offenders.push(`${rel}: [${hits.join(', ')}] ${line.trim().slice(0, 110)}`);
            }
        }

        expect(offenders, [
            '发现硬编码的公网地址。这类值会被 vite 静态替换进产物，导致发布包里带着外部后端',
            '（连不通，且泄漏入口位置）。',
            '正确做法：源码保持为空，环境相关地址只写在**未被跟踪**的 .env 里；',
            '安卓构建用 `npm run build:android`（.env.android）。',
        ].join('\n')).toEqual([]);
    });

    it('.env 未被 git 跟踪（避免开发地址再次入库）', () => {
        let tracked: string;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { execSync } = require('child_process');
            tracked = execSync('git ls-files .env', { cwd: REPO_ROOT }).toString().trim();
        } catch {
            return; // 非 git 环境（导出包）跳过
        }
        expect(tracked, '.env 不应被 git 跟踪：确认 .gitignore 含 `.env` 且已 git rm --cached').toBe('');
    });

    // 守卫本身也得有牙齿：确认它真能抓住「裸 IP」这种曾漏掉的形态，
    // 同时不误伤版本号 / 时间 / 合法内网地址。
    it('守卫自检：能抓住裸 IP 与 IP:端口，且不误伤合法内容', () => {
        const mustFlag = [
            'host = 93.184.216.34',
            'backend at 93.184.216.34:8080',
            'VITE_X=http://93.184.216.34:8080',
            '替换 93.184.216.34 与三个端口号',
        ];
        const mustPass = [
            'http://localhost:3000',
            'http://192.168.1.5:3000',
            'http://10.0.0.7:8080',
            'http://192.0.2.44:8080',
            'vite@8.14.3 与 react@19.2.8',
            '10:14:35 与 03:53:34',
            '999.999.999.999',
        ];

        for (const line of mustFlag) {
            expect(findPublicIps(line), `应标记: ${line}`).not.toEqual([]);
        }
        for (const line of mustPass) {
            expect(findPublicIps(line), `不应标记: ${line}`).toEqual([]);
        }
    });
});
