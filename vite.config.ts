import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const stripQappCoreCss = () => ({
  name: 'strip-qapp-core-css',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('qapp-core')) {
      return null;
    }

    return code.replace(/import\s+["']\.\/index\.css["'];?/, '');
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [stripQappCoreCss(), react()],
  base: './',
  optimizeDeps: {
    include: ['@mui/material', '@mui/styled-engine', '@mui/system'],
  },
});
