import { defineConfig } from 'tsup';
import fs from 'fs';
import path from 'path';

// Hàm copy thư mục (giữ nguyên cấu trúc)
function copyFolderSync(from: string, to: string) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const src = path.join(from, element);
    const dest = path.join(to, element);
    if (fs.lstatSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    } else {
      copyFolderSync(src, dest);
    }
  });
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  // 👇 ĐOẠN QUAN TRỌNG: Copy assets sau khi build thành công
  onSuccess: async () => {
    console.log('📦 Copying assets and scripts to dist...');
    try {
      // Copy từ thư mục gốc của apps/cli vào apps/cli/dist
      if (fs.existsSync('scripts')) copyFolderSync('scripts', 'dist/scripts');
      if (fs.existsSync('assets')) copyFolderSync('assets', 'dist/assets');
      console.log('✅ Assets & Scripts copied successfully!');
    } catch (e) {
      console.error('❌ Failed to copy assets:', e);
    }
  },
});