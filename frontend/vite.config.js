import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Apps Script HTML Service ไม่มี static file routing — ต้องรวมทุกอย่าง (JS/CSS)
// เข้า index.html ไฟล์เดียวตอน build แล้ว serve ผ่าน HtmlService.createHtmlOutputFromFile
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
});
