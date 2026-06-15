/**
 * scripts/ 공통 CLI 파서 (Issue #65)
 *
 * analyze_*, simulate_trend, position_size 스크립트마다 복붙되어 있던
 * --market / -n / --min-score 파싱을 단일 모듈로 추출.
 *
 * 주의: server_node/scripts/ 의 CLI 파서는 별도 파일
 *       (server_node/scripts/_lib/cli.ts) 에 있다.
 */

export const VALID_MARKETS = ["kr", "us"] as const;
export type Market = typeof VALID_MARKETS[number];

/**
 * --market <kr|us> 파싱 + 유효성 검증.
 *
 * @param args          process.argv.slice(2)
 * @param defaultMarket 플래그 미지정 시 기본값 (기본 "kr")
 * @returns             파싱된 마켓 문자열
 *
 * 유효하지 않은 마켓이면 에러 메시지 출력 후 process.exit(1).
 */
export function parseMarket(args: string[], defaultMarket: Market = "kr"): Market {
  const idx = args.indexOf("--market");
  const raw = idx !== -1 ? (args[idx + 1] ?? defaultMarket) : defaultMarket;

  if (!(VALID_MARKETS as readonly string[]).includes(raw)) {
    console.error(
      `❌ 알 수 없는 마켓: ${raw}. 사용 가능: ${VALID_MARKETS.join(", ")}`
    );
    process.exit(1);
  }

  return raw as Market;
}

/**
 * -n <양의 정수> 파싱 (상위 N개 제한).
 *
 * @param args process.argv.slice(2)
 * @returns    파싱된 N 값, 플래그 없으면 undefined
 *
 * 값이 양의 정수가 아니면 에러 메시지 출력 후 process.exit(1).
 */
export function parseN(args: string[]): number | undefined {
  const idx = args.indexOf("-n");
  if (idx === -1) return undefined;

  const val    = args[idx + 1];
  const parsed = val !== undefined ? parseInt(val, 10) : NaN;

  if (isNaN(parsed) || parsed <= 0) {
    console.error("❌ -n 옵션은 양의 정수여야 합니다.");
    process.exit(1);
  }

  return parsed;
}

/**
 * --min-score <숫자> 파싱.
 *
 * @param args process.argv.slice(2)
 * @returns    파싱된 minScore 값, 플래그 없으면 0
 */
export function parseMinScore(args: string[]): number {
  const idx = args.indexOf("--min-score");
  if (idx === -1) return 0;

  const val    = args[idx + 1];
  const parsed = val !== undefined ? parseFloat(val) : NaN;

  return isNaN(parsed) ? 0 : parsed;
}
