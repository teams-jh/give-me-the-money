import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Python output 폴더 경로 ──────────────────────────────
const OUTPUT_DIR = path.resolve(__dirname, '../server_python/output');

// ── CORS: 프론트엔드 도메인 허용 ────────────────────────
const allowedOrigins = [
  'http://localhost:8083',                         // 로컬 Next.js dev
  'https://give-me-the-money.vercel.app',          // Vercel 배포
  process.env.FRONTEND_ORIGIN ?? '',               // 환경변수로 추가 허용
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // 서버 직접 호출(origin 없음) 또는 허용 목록에 있으면 통과
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
  })
);

app.use(express.json());

// ── Health check ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── GET /api/output/list ──────────────────────────────────
// server_python/output/ 폴더의 .html 파일 목록 반환
app.get('/api/output/list', (_req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      res.json({ files: [] });
      return;
    }

    const files = fs
      .readdirSync(OUTPUT_DIR)
      .filter((f) => f.endsWith('.html'))
      .sort();

    res.json({ files });
  } catch (err) {
    console.error('[/api/output/list] Error:', err);
    res.status(500).json({ error: 'Failed to read output directory' });
  }
});

// ── GET /api/output/:filename ─────────────────────────────
// 개별 HTML 파일 서빙 (iframe src 로 사용)
app.get('/api/output/:filename', (req, res) => {
  const { filename } = req.params;

  // 경로 순회 공격 방지: 파일명에 슬래시/점점 포함 시 거부
  if (!filename || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  // .html 확장자만 허용
  if (!filename.endsWith('.html')) {
    res.status(400).json({ error: 'Only .html files are allowed' });
    return;
  }

  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: `File not found: ${filename}` });
    return;
  }

  res.sendFile(filePath);
});

// ── 서버 시작 ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ server_node running on http://localhost:${PORT}`);
  console.log(`   Output dir: ${OUTPUT_DIR}`);
});
