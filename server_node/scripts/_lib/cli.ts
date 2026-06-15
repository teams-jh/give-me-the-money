/**
 * server_node/scripts/ 공통 CLI 파서 (Issue #65)
 *
 * fetch/*, cleanup/* 스크립트마다 복붙되어 있던
 * --market / --force / --dry-run 파싱을 단일 모듈로 추출.
 *
 * 주의: scripts/ 의 CLI 파서는 별도 파일
 *       (scripts/_lib/cli.ts) 에 있다.
 */

export const VALID_MARKETS = ["kr", "us"] as const;
export type Market = typeof VALID_MARKETS[number];

/**
 * --market <kr|us[|all]> 파싱 + 유효성 검증.
 *
 * @param args     process.argv.slice(2)
 * @param opts.allowAll  "all" 값을 허용할지 여부 (cleanup 스크립트용, 기본 false)
 * @param opts.default   플래그 미지정 시 기본값 (기본 "us")
 * @returns              파싱된 마켓 문자열
 *
 * 유효하지 않은 마켓이면 에러 메시지 출력 후 process.exit(1).
 */
export function parseMarket(
  args: string[],
  opts: { allowAll?: boolean; default?: string } = {}
): string {
  const { allowAll = false, default: defaultMarket = "us" } = opts;

  const idx = args.indexOf("--market");
  const raw =
    idx !== -1 && args[idx + 1] && !args[idx + 1]!.startsWith("-")
      ? args[idx + 1]!
      : defaultMarket;

  const validValues: string[] = [...VALID_MARKETS];
  if (allowAll) validValues.push("all");

  if (!validValues.includes(raw)) {
    console.error(
      `❌ 알 수 없는 마켓: ${raw}. 사용 가능: ${validValues.join(", ")}`
    );
    process.exit(1);
  }

  return raw;
}

/**
 * --force 플래그 파싱.
 *
 * @param args process.argv.slice(2)
 * @returns    --force 포함 여부
 */
export function parseForce(args: string[]): boolean {
  return args.includes("--force");
}

/**
 * --dry-run 플래그 파싱.
 *
 * @param args process.argv.slice(2)
 * @returns    --dry-run 포함 여부
 */
export function parseDryRun(args: string[]): boolean {
  return args.includes("--dry-run");
}
