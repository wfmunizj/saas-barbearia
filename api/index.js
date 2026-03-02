// A Vercel executa este arquivo como uma Serverless Function.
// Ele apenas importa o servidor que já foi compilado pelo esbuild durante o build.
import app from '../dist/index.js';

export default app;
