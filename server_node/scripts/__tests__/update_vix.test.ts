/**
 * update_vix.ts 테스트
 *
 * TC 계획:
 *   TC01  round()          - 양수 소수점 반올림 2자리
 *   TC02  round()          - null 입력 → null
 *   TC03  round()          - NaN → null
 *   TC04  round()          - undefined → null
 *   TC05  getVixRating()   - score < 15 → "low"
 *   TC06  getVixRating()   - 15 ≤ score < 25 → "moderate"
 *   TC07  getVixRating()   - 25 ≤ score < 35 → "high"
 *   TC08  getVixRating()   - score ≥ 35 → "extreme"
 *   TC09  isUpdatedToday() - 오늘 날짜 파일 → true  (main() 스킵 경로로 간접 검증)
 *   TC10  isUpdatedToday() - 어제 날짜 → false (chart 호출로 간접 검증)
 *   TC11  isUpdatedToday() - 파일 없음(throw) → false (chart 호출로 간접 검증)
 *   TC12  isUpdatedToday() - updated_at 필드 없음 → false (chart 호출로 간접 검증)
 *   TC13  buildJson()      - 정상 입력 → 올바른 구조 (updated_at·score·rating·previous_*·historical)
 *   TC14  buildJson()      - 히스토리 역순 입력 → 날짜 오름차순 정렬
 *   TC15  main()           - 오늘 업데이트 + no --force → 스킵 (chart 미호출)
 *   TC16  main()           - --force 플래그 → 오늘 날짜여도 chart 호출
 *   TC17  main()           - 정상 경로 → writeFileSync + renameSync 호출
 *   TC18  main()           - 가격 데이터 0개 → process.exit(1)
 *   TC19  main()           - yahooFinance.chart() throw → process.exit(1)
 *   TC20  buildJson()      - 모든 close가 null → throw Error
 *
 * 설계 결정:
 *   round(), getVixRating()은 소스에서 export되므로 직접 import하여 검증한다.
 *   isUpdatedToday()는 main() 호출을 통해 chart 호출 여부로 간접 검증한다.
 *   update_vix.ts는 진입점 가드(isMain)를 사용하므로 import 시 main()이 자동 실행되지 않는다.
 *
 * 모킹 전략:
 *   - fs: readFileSync / writeFileSync / mkdirSync / renameSync 모킹
 *   - yahoo-finance2: class default export → chart 메서드를 vi.fn()으로 교체
 *   - process.exit: vi.spyOn으로 가로챔
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { round, getVixRating, buildJson, main } from "../fetch/update_vix.ts";

// ── fs 모킹 ───────────────────────────────────────────────────────────────────

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync     = vi.fn();
const mockRenameSync    = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync:     (...a: unknown[]) => mockMkdirSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
  },
}));

// ── yahoo-finance2 모킹 ───────────────────────────────────────────────────────

const mockChart = vi.fn();

vi.mock("yahoo-finance2", () => ({
  default: class {
    chart = (...args: unknown[]) => mockChart(...args);
  },
}));

// ── 헬퍼: 정상 yahooFinance.chart() 응답 ──────────────────────────────────────

interface QuoteRow {
  date:      Date;
  open:      number | null;
  high:      number | null;
  low:       number | null;
  close:     number | null;
  adjclose:  number | null;
  volume:    number | null;
}

function makeChartResponse(opts: { quoteCount?: number; empty?: boolean } = {}): { quotes: QuoteRow[] } {
  if (opts.empty) return { quotes: [] };

  const count = opts.quoteCount ?? 200;
  const quotes: QuoteRow[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date("2025-01-01");
    d.setDate(d.getDate() + i);
    quotes.push({
      date:     d,
      open:     18.0 + i * 0.01,
      high:     19.0 + i * 0.01,
      low:      17.0 + i * 0.01,
      close:    18.5 + i * 0.01,
      adjclose: 18.5 + i * 0.01,
      volume:   null,
    });
  }
  return { quotes };
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe("update_vix", () => {

  // ── round() ─────────────────────────────────────────────────────────────────

  describe("round()", () => {
    it("TC01 양수 소수점을 2자리로 반올림한다", () => {
      expect(round(18.456)).toBe(18.46);
      expect(round(14.999)).toBe(15.0);
      expect(round(35.001)).toBe(35.0);
    });

    it("TC02 null 입력은 null을 반환한다", () => {
      expect(round(null)).toBeNull();
    });

    it("TC03 NaN 입력은 null을 반환한다", () => {
      expect(round(NaN)).toBeNull();
    });

    it("TC04 undefined 입력은 null을 반환한다", () => {
      expect(round(undefined)).toBeNull();
    });
  });

  // ── getVixRating() ──────────────────────────────────────────────────────────

  describe("getVixRating()", () => {
    it("TC05 score < 15 이면 'low'를 반환한다", () => {
      expect(getVixRating(12)).toBe("low");
      expect(getVixRating(14.99)).toBe("low");
    });

    it("TC06 15 이상 25 미만이면 'moderate'를 반환한다", () => {
      expect(getVixRating(15)).toBe("moderate");
      expect(getVixRating(20)).toBe("moderate");
      expect(getVixRating(24.99)).toBe("moderate");
    });

    it("TC07 25 이상 35 미만이면 'high'를 반환한다", () => {
      expect(getVixRating(25)).toBe("high");
      expect(getVixRating(30)).toBe("high");
      expect(getVixRating(34.99)).toBe("high");
    });

    it("TC08 score 35 이상이면 'extreme'을 반환한다", () => {
      expect(getVixRating(35)).toBe("extreme");
      expect(getVixRating(50)).toBe("extreme");
      expect(getVixRating(80)).toBe("extreme");
    });
  });

  // ── isUpdatedToday() (main() 통한 간접 검증) ─────────────────────────────────

  describe("isUpdatedToday() — main()을 통한 간접 검증", () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
      mockChart.mockClear();
      mockChart.mockResolvedValue(makeChartResponse());
    });

    afterEach(() => {
      exitSpy.mockRestore();
      const idx = process.argv.indexOf("--force");
      if (idx !== -1) process.argv.splice(idx, 1);
    });

    it("TC09 오늘 날짜 updated_at → main()이 chart를 호출하지 않는다 (스킵)", async () => {
      const today = new Date().toISOString();
      mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: today }));

      await main();

      expect(mockChart).not.toHaveBeenCalled();
    });

    it("TC10 어제 날짜 updated_at → main()이 chart를 호출한다", async () => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: yesterday }));

      await main();

      expect(mockChart).toHaveBeenCalled();
    });

    it("TC11 파일 없음(throw) → main()이 chart를 호출한다", async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });

      await main();

      expect(mockChart).toHaveBeenCalled();
    });

    it("TC12 updated_at 필드 없음 → main()이 chart를 호출한다", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      await main();

      expect(mockChart).toHaveBeenCalled();
    });
  });

  // ── buildJson() ─────────────────────────────────────────────────────────────

  describe("buildJson()", () => {
    it("TC13 정상 입력 → 올바른 JSON 구조를 반환한다", () => {
      const quotes: QuoteRow[] = [
        { date: new Date("2025-05-18"), open: 17, high: 19, low: 16, close: 18.0,  adjclose: 18.0,  volume: null },
        { date: new Date("2025-05-19"), open: 18, high: 20, low: 17, close: 19.0,  adjclose: 19.0,  volume: null },
        { date: new Date("2025-05-20"), open: 19, high: 21, low: 18, close: 20.45, adjclose: 20.45, volume: null },
      ];

      const result = buildJson({ quotes });

      expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.score).toBe(20.45);
      expect(result.rating).toBe("moderate");
      expect(result.previous_close).toBe(19.0);
      // 3개 쿼트만 있으므로 1주/1월/1년 전 데이터는 null (인덱스 부족)
      expect(result.previous_1_week).toBeNull();
      expect(result.previous_1_month).toBeNull();
      expect(result.previous_1_year).toBeNull();
      expect(Array.isArray(result.historical)).toBe(true);
      expect(result.historical[0]).toMatchObject({
        date:   expect.any(String),
        score:  expect.any(Number),
        rating: expect.any(String),
      });
    });

    it("TC14 히스토리 역순 입력 → 날짜 오름차순으로 정렬된다", () => {
      const quotes: QuoteRow[] = [
        { date: new Date("2025-05-20"), open: 19, high: 21, low: 18, close: 20.0, adjclose: 20.0, volume: null },
        { date: new Date("2025-05-18"), open: 17, high: 19, low: 16, close: 18.0, adjclose: 18.0, volume: null },
        { date: new Date("2025-05-19"), open: 18, high: 20, low: 17, close: 19.0, adjclose: 19.0, volume: null },
      ];

      const result = buildJson({ quotes });

      const dates = result.historical.map((h) => h.date);
      expect(dates).toEqual([...dates].sort());
    });

    it("TC20 모든 close가 null → Error를 throw한다", () => {
      const quotes: QuoteRow[] = [
        { date: new Date("2025-05-18"), open: null, high: null, low: null, close: null, adjclose: null, volume: null },
        { date: new Date("2025-05-19"), open: null, high: null, low: null, close: null, adjclose: null, volume: null },
      ];

      expect(() => buildJson({ quotes })).toThrow("유효한 close 데이터가 없습니다.");
    });
  });

  // ── main() ──────────────────────────────────────────────────────────────────

  describe("main()", () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
      mockChart.mockClear();
      mockWriteFileSync.mockClear();
      mockRenameSync.mockClear();
      mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
      mockChart.mockResolvedValue(makeChartResponse());
    });

    afterEach(() => {
      exitSpy.mockRestore();
      const idx = process.argv.indexOf("--force");
      if (idx !== -1) process.argv.splice(idx, 1);
    });

    it("TC15 오늘 업데이트 + --force 없음 → chart 미호출 (스킵)", async () => {
      const today = new Date().toISOString();
      mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: today }));

      await main();

      expect(mockChart).not.toHaveBeenCalled();
    });

    it("TC16 --force 플래그 → 오늘 날짜여도 chart 호출", async () => {
      const today = new Date().toISOString();
      mockReadFileSync.mockReturnValue(JSON.stringify({ updated_at: today }));
      process.argv.push("--force");

      await main();

      expect(mockChart).toHaveBeenCalled();
    });

    it("TC17 정상 경로 → writeFileSync + renameSync 호출", async () => {
      await main();

      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(mockRenameSync).toHaveBeenCalled();
    });

    it("TC18 가격 데이터 0개 → process.exit(1) 호출", async () => {
      mockChart.mockResolvedValue(makeChartResponse({ empty: true }));

      await main();

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("TC19 yahooFinance.chart() throw → process.exit(1) 호출", async () => {
      mockChart.mockRejectedValue(new Error("network error"));

      await main();

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

});
