/**
 * notify_slack.ts
 *
 * simulate_trend 워크플로우가 생성한 PNG 차트를 Slack 채널에 첨부 전송한다.
 * Slack files.uploadV2 플로우 (3단계):
 *   1. files.getUploadURLExternal  → upload_url, file_id 발급
 *   2. upload_url 로 파일 바이트 업로드 (POST)
 *   3. files.completeUploadExternal → 채널에 게시 (initial_comment 포함)
 *
 * 사용:
 *   tsx scripts/notify_slack.ts --files "a.png,b.png" --market kr
 *
 * 환경변수:
 *   SLACK_BOT_TOKEN   — xoxb-... (scope: files:write, chat:write)
 *   SLACK_CHANNEL_ID  — C...
 *
 * 의존성 없음 (Node 22 내장 fetch 사용).
 */

import fs                from "fs";
import path              from "path";
import { fileURLToPath } from "url";

const SLACK_API = "https://slack.com/api";

// ── 타입 ────────────────────────────────────────────────────────────────────────

export interface NotifyArgs {
  files:  string[];
  market: string;
}

export interface NotifyOptions {
  token:   string;
  channel: string;
  files:   string[];
  market:  string;
}

interface GetUploadUrlResponse {
  ok:          boolean;
  upload_url?: string;
  file_id?:    string;
  error?:      string;
}

interface SlackApiResponse {
  ok:     boolean;
  error?: string;
}

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────────

/**
 * --files "a.png,b.png" --market kr 형태를 파싱한다.
 * 빈 항목/공백은 제거한다.
 */
export function parseNotifyArgs(argv: string[]): NotifyArgs {
  let files:  string[] = [];
  let market = "";

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--files" && i + 1 < argv.length) {
      files = argv[i + 1]
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);
      i++;
    } else if (argv[i] === "--market" && i + 1 < argv.length) {
      market = argv[i + 1].trim();
      i++;
    }
  }

  return { files, market };
}

// ── 1+2단계: 파일 업로드 → file_id ─────────────────────────────────────────────────

/**
 * 단일 파일을 Slack 에 업로드하고 file_id 를 반환한다.
 * 1) files.getUploadURLExternal 로 업로드 URL 발급
 * 2) 발급된 URL 로 파일 바이트 전송
 */
export async function uploadFileToSlack(token: string, filePath: string): Promise<string> {
  const filename = path.basename(filePath);
  const size     = fs.statSync(filePath).size;

  // 1단계: 업로드 URL 발급
  const params = new URLSearchParams({ filename, length: String(size) });
  const getRes = await fetch(`${SLACK_API}/files.getUploadURLExternal`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const getData = (await getRes.json()) as GetUploadUrlResponse;
  if (!getData.ok || !getData.upload_url || !getData.file_id) {
    throw new Error(`files.getUploadURLExternal 실패: ${getData.error ?? "unknown"} (${filename})`);
  }

  // 2단계: 파일 바이트 업로드
  const fileBuffer = fs.readFileSync(filePath);
  const putRes = await fetch(getData.upload_url, {
    method: "POST",
    body:   fileBuffer,
  });

  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`업로드 URL 전송 실패 (status ${putRes.status}): ${text} (${filename})`);
  }

  return getData.file_id;
}

// ── 3단계: 채널 게시 ───────────────────────────────────────────────────────────────

/**
 * 업로드된 file_id 들을 채널에 게시한다.
 */
export async function completeUpload(
  token:          string,
  channel:        string,
  fileIds:        string[],
  initialComment: string,
): Promise<void> {
  const res = await fetch(`${SLACK_API}/files.completeUploadExternal`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      files:           fileIds.map(id => ({ id })),
      channel_id:      channel,
      initial_comment: initialComment,
    }),
  });

  const data = (await res.json()) as SlackApiResponse;
  if (!data.ok) {
    throw new Error(`files.completeUploadExternal 실패: ${data.error ?? "unknown"}`);
  }
}

// ── 오케스트레이션 ─────────────────────────────────────────────────────────────────

/**
 * 주어진 PNG 파일들을 모두 업로드한 뒤 한 메시지로 채널에 게시한다.
 * 존재하지 않는 파일은 건너뛴다.
 */
export async function notifySlack(opts: NotifyOptions): Promise<void> {
  const existing = opts.files.filter(f => fs.existsSync(f));

  if (existing.length === 0) {
    console.warn("⚠️  업로드할 PNG 파일이 없습니다 — Slack 전송 건너뜀");
    return;
  }

  const fileIds: string[] = [];
  for (const f of existing) {
    const id = await uploadFileToSlack(opts.token, f);
    fileIds.push(id);
    console.log(`⬆️  업로드 완료: ${path.basename(f)} → ${id}`);
  }

  const marketLabel = opts.market.toUpperCase();
  const timestamp   = new Date().toISOString().slice(0, 16).replace("T", " ");
  const comment     = `📈 [${marketLabel}] 추세 시뮬레이션 차트 (${timestamp} UTC)`;

  await completeUpload(opts.token, opts.channel, fileIds, comment);
  console.log(`✅ Slack 전송 완료: ${fileIds.length}개 파일 → 채널 ${opts.channel}`);
}

// ── main ──────────────────────────────────────────────────────────────────────────

/**
 * CLI 진입점. argv 파싱 + env 검증 후 notifySlack 호출.
 * env 는 주입 가능(테스트 용이). 미지정 시 process.env 사용.
 */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { files, market } = parseNotifyArgs(process.argv);

  const token   = env.SLACK_BOT_TOKEN;
  const channel = env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    throw new Error(
      "SLACK_BOT_TOKEN / SLACK_CHANNEL_ID 환경변수가 설정되지 않았습니다.",
    );
  }

  if (files.length === 0) {
    console.warn("⚠️  --files 인자가 비어 있습니다 — 전송할 파일 없음");
    return;
  }

  await notifySlack({ token, channel, files, market });
}

// 직접 실행 시에만 main 호출 (테스트 import 시 실행 방지)
/* c8 ignore start */
const _isEntry = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (_isEntry) {
  main().catch(err => {
    console.error("❌ Slack 알림 실패:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
/* c8 ignore stop */
