// src/services/capacitor/filePicker.ts
// 移动端音频文件选择桥：复用系统 Storage Access Framework。
// Android WebView 下 <input type="file" multiple> 会唤起系统文件选择器，
// 返回的 File 对象由本模块消费后持久化到 IndexedDB。

const AUDIO_ACCEPT = 'audio/*,.mp3,.flac,.m4a,.wav,.ogg,.opus,.aac';

export function pickMobileAudioFiles(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = AUDIO_ACCEPT;
    input.style.display = 'none';

    const cleanup = () => {
      input.removeEventListener('change', onChange);
      input.remove();
    };

    const onChange = () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      resolve(files);
    };

    input.addEventListener('change', onChange);
    document.body.appendChild(input);
    input.click();
  });
}
