# Folia Android

全屏沉浸式歌词播放器，基于 [Folia](https://github.com/chthollyphile/folia-major) 前端 + Capacitor 打包。

## 特点

- 13 种歌词动画，逐词精准匹配
- AI 智能配色，自动生成主题
- 网易云 / 酷狗 / QQ 音乐 / 本地音乐库
- 响应式排版，适配手机与平板

## 构建

```bash
npm install && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
```

## 许可证

AGPL-3.0