/**
 * 스크립트 공통 로거 (Issue #62)
 *
 * fetch/merge/patch/cleanup/analyze 스크립트에 파일마다 복붙되어 있던
 * log() 를 단일 모듈로 추출. 포맷: `ISO타임스탬프 [LEVEL] 메시지`
 */

function line(level: string, msg: string): string {
  return `${new Date().toISOString()} [${level}] ${msg}`;
}

export function log(msg: string): void {
  console.log(line("INFO", msg));
}

export function warn(msg: string): void {
  console.warn(line("WARN", msg));
}

export function err(msg: string): void {
  console.error(line("ERROR", msg));
}
