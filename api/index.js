// Vercel Serverless Function entry point
// Importa o Express app compilado pelo esbuild (sem server.listen)
import app from '../dist/handler.js';

export default app;
