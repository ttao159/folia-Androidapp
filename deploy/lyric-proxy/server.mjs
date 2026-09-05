// 精简歌词代理服务：只承载 /api/lyric-proxy，供 Capacitor（Android）独立部署。
// 依赖极简（仅 express），不含 AI 主题生成，可在闲置手机 Termux 上直接运行。
import express from 'express';
import lyricProxy from './lyric-proxy.js';

const app = express();
const port = Number(process.env.PORT || 3400);

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '4mb' }));
app.use(express.text({ type: ['text/*', 'application/xml'], limit: '4mb' }));

app.get('/api/healthz', (_req, res) => {
    res.json({ ok: true, service: 'folia-lyric-proxy' });
});
app.all('/api/lyric-proxy', lyricProxy);

app.use((error, _req, res, _next) => {
    console.error('[folia-lyric-proxy] Unhandled request error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`[folia-lyric-proxy] listening on 0.0.0.0:${port}`);
});
