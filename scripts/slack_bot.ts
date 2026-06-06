/**
 * slack_bot.ts
 *
 * Slack Events API (app_mention / message) 를 수신하여
 * `!config` 명령어를 파싱한 뒤 GitHub Actions workflow_dispatch 를 호출한다.
 *
 * ── 사용 방법 (슬랙에서) ─────────────────────────────────────────────────
 *   @봇이름 !config market=kr period=3m slopeFilter=negative zigzagThreshold=7
 *   @봇이름 !config market=all regressionStdDev=1.5 minTouches=4
 *   @봇이름 !config help
 *
 * ── 환경변수 ─────────────────────────────────────────────────────────────
 *   SLACK_BOT_TOKEN       xoxb-...  (scope: chat:write)
 *   SLACK_SIGNING_SECRET  검증용 서명 시크릿
 *   GITHUB_PAT            repo / workflow scope PAT
 *   GITHUB_OWNER          저장소 소유자 (org 또는 user)
 *   GITHUB_REPO           저장소 이름
 *   PORT                  HTTP 수신 포트 (기본 3000)
 *
 * ── 실행 ──────────────────────────────────────────────────────────────────
 *   tsx scripts/slack_bot.ts
 *
 * ── 의존성 ────────────────────────────────────────────────────────────────
 *   Node 22 내장 fetch / crypto 사용 — 추가 패키지 불필요.
 */

import http   from "http";
import crypto from "crypto";

// ── 타입 ──────────────────────────────────────────────────────────────────

interface ConfigParams {
  market?:                  string;
  period?:                  string;
  slopeFilter?:             string;
  zigzagThreshold?:         string;
  regressionStdDev?:        string;
  trendTouchTolerance?:     string;
  trendBreakoutTolerance?:  string;
  minTouches?:              string;
}

interface ParseResult {
  valid:    boolean;
  help?:    boolean;
  params?:  ConfigParams;
  errors?:  string[];
}

// ── 유효값 목록 ───────────────────────────────────────────────────────────

const VALID_MARKETS      = ["kr", "us", "all"] as const;
const VALID_PERIODS      = ["3m", "1y", "all"] as const;
const VALID_SLOPE_FILTER = ["positive", "negative", "both"] as const;

const HELP_TEXT = `
*!config 사용법*
\`\`\`
@봇 !config [파라미터=값 ...]
\`\`\`
*파라미터 목록:*
• \`market\`                — kr / us / all (기본: all)
• \`period\`                — 3m / 1y / all (기본: all)
• \`slopeFilter\`           — positive / negative / both
• \`zigzagThreshold\`       — 숫자 (예: 5)
• \`regressionStdDev\`      — 숫자 (예: 2.0)
• \`trendTouchTolerance\`   — 숫자 (예: 2)
• \`trendBreakoutTolerance\`— 숫자 (예: 5)
• \`minTouches\`            — 숫자 (예: 3)

*예시:*
\`@봇 !config market=kr period=3m slopeFilter=negative zigzagThreshold=7\`
`.trim();

// ── 명령어 파싱 ───────────────────────────────────────────────────────────

/**
 * 슬랙 메시지 텍스트에서 !config 파라미터를 파싱한다.
 * 멘션(<@Uxxxx>)은 제거하고 처리한다.
 */
export function parseConfigCommand(text: string): ParseResult {
  // 멘션 제거
  const cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim();

  // !config 명령어 확인
  const match = cleaned.match(/!config(.*)/s);
  if (!match) return { valid: false };

  const argsStr = match[1].trim();

  // help
  if (argsStr === "" || argsStr === "help") {
    return { valid: true, help: true };
  }

  // key=value 파싱
  const errors: string[] = [];
  const params: ConfigParams = {};

  for (const token of argsStr.split(/\s+/)) {
    const [key, val] = token.split("=");
    if (!key || val === undefined) {
      errors.push(`파싱 불가 토큰: \`${token}\``);
      continue;
    }

    switch (key) {
      case "market":
        if (!(VALID_MARKETS as readonly string[]).includes(val)) {
          errors.push(`market 값 오류: \`${val}\` (허용: ${VALID_MARKETS.join(", ")})`);
        } else {
          params.market = val;
        }
        break;

      case "period":
        if (!(VALID_PERIODS as readonly string[]).includes(val)) {
          errors.push(`period 값 오류: \`${val}\` (허용: ${VALID_PERIODS.join(", ")})`);
        } else {
          params.period = val;
        }
        break;

      case "slopeFilter":
        if (!(VALID_SLOPE_FILTER as readonly string[]).includes(val)) {
          errors.push(`slopeFilter 값 오류: \`${val}\` (허용: ${VALID_SLOPE_FILTER.join(", ")})`);
        } else {
          params.slopeFilter = val;
        }
        break;

      case "zigzagThreshold":
      case "regressionStdDev":
      case "trendTouchTolerance":
      case "trendBreakoutTolerance":
      case "minTouches":
        if (isNaN(Number(val)) || val === "") {
          errors.push(`${key} 는 숫자여야 합니다: \`${val}\``);
        } else {
          (params as Record<string, string>)[key] = val;
        }
        break;

      default:
        errors.push(`알 수 없는 파라미터: \`${key}\``);
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, params };
}

// ── GitHub workflow_dispatch 호출 ─────────────────────────────────────────

export async function triggerWorkflow(
  params:      ConfigParams,
  requestedBy: string,
  env:         NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const pat   = env.GITHUB_PAT;
  const owner = env.GITHUB_OWNER;
  const repo  = env.GITHUB_REPO;

  if (!pat || !owner || !repo) {
    throw new Error("GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO 환경변수 미설정");
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/update-sim-config.yml/dispatches`;

  const inputs: Record<string, string> = {
    market:       params.market               ?? "all",
    period:       params.period               ?? "all",
    requested_by: requestedBy,
    // 빈 문자열로 전달 → 워크플로우 측에서 변경 안 함으로 처리
    slopeFilter:            params.slopeFilter            ?? "",
    zigzagThreshold:        params.zigzagThreshold        ?? "",
    regressionStdDev:       params.regressionStdDev       ?? "",
    trendTouchTolerance:    params.trendTouchTolerance    ?? "",
    trendBreakoutTolerance: params.trendBreakoutTolerance ?? "",
    minTouches:             params.minTouches             ?? "",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${pat}`,
      Accept:         "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });

  if (res.status !== 204) {
    const body = await res.text();
    throw new Error(`GitHub API 오류 (${res.status}): ${body}`);
  }
}

// ── Slack 메시지 전송 ─────────────────────────────────────────────────────

export async function postSlackMessage(
  channel: string,
  text:    string,
  env:     NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const token = env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN 미설정");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(`chat.postMessage 실패: ${data.error}`);
}

// ── Slack 서명 검증 ───────────────────────────────────────────────────────

export function verifySlackSignature(
  signingSecret: string,
  signature:     string,
  timestamp:     string,
  body:          string,
): boolean {
  const ts = Number(timestamp);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false; // 5분 초과 거부

  const baseStr = `v0:${timestamp}:${body}`;
  const hmac    = crypto.createHmac("sha256", signingSecret).update(baseStr).digest("hex");
  const expected = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── 이벤트 핸들러 ─────────────────────────────────────────────────────────

async function handleEvent(body: string, env: NodeJS.ProcessEnv): Promise<void> {
  const payload = JSON.parse(body);

  // URL 검증 핸드쉐이크 (Slack 앱 설정 시 1회)
  if (payload.type === "url_verification") return; // 별도 처리는 HTTP 핸들러에서

  if (payload.type !== "event_callback") return;

  const event = payload.event;

  // app_mention 또는 봇이 속한 채널의 message 이벤트
  if (event.type !== "app_mention" && event.type !== "message") return;
  if (event.bot_id) return; // 봇 자신의 메시지 무시
  if (!event.text?.includes("!config")) return;

  const channel    = event.channel as string;
  const userId     = (event.user ?? "unknown") as string;

  const result = parseConfigCommand(event.text as string);

  // help 또는 파싱 실패
  if (!result.valid) {
    const errMsg = result.errors
      ? `❌ 파라미터 오류:\n${result.errors.join("\n")}\n\n${HELP_TEXT}`
      : HELP_TEXT;
    await postSlackMessage(channel, errMsg, env);
    return;
  }

  if (result.help) {
    await postSlackMessage(channel, HELP_TEXT, env);
    return;
  }

  // GitHub Actions 트리거
  await postSlackMessage(channel, `⏳ <@${userId}> GitHub Actions 워크플로우를 실행합니다...`, env);

  try {
    await triggerWorkflow(result.params!, userId, env);
    // 완료 알림은 워크플로우 내 Notify Slack 스텝에서 전송
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await postSlackMessage(channel, `❌ 워크플로우 실행 실패: ${msg}`, env);
  }
}

// ── HTTP 서버 ─────────────────────────────────────────────────────────────

function startServer(env: NodeJS.ProcessEnv): void {
  const port          = Number(env.PORT ?? 3000);
  const signingSecret = env.SLACK_SIGNING_SECRET ?? "";

  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/slack/events") {
      res.writeHead(404).end();
      return;
    }

    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      // 서명 검증
      const signature = req.headers["x-slack-signature"] as string ?? "";
      const timestamp = req.headers["x-slack-request-timestamp"] as string ?? "";

      if (signingSecret && !verifySlackSignature(signingSecret, signature, timestamp, body)) {
        res.writeHead(401).end("Unauthorized");
        return;
      }

      // URL 검증 핸드쉐이크
      try {
        const payload = JSON.parse(body);
        if (payload.type === "url_verification") {
          res.writeHead(200, { "Content-Type": "application/json" })
             .end(JSON.stringify({ challenge: payload.challenge }));
          return;
        }
      } catch { /* ignore */ }

      // 슬랙은 3초 내 응답을 요구 → 즉시 200 반환 후 비동기 처리
      res.writeHead(200).end();

      handleEvent(body, env).catch(err => {
        console.error("이벤트 처리 오류:", err);
      });
    });
  });

  server.listen(port, () => {
    console.log(`✅ Slack 이벤트 서버 실행 중: http://localhost:${port}/slack/events`);
  });
}

// ── main ──────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  startServer(process.env);
}
