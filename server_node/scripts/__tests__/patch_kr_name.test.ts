/**
 * patch_kr_name.ts 테스트
 *
 * TC 계획:
 *   TC01  main() - name_map에서 ticker 일치 → kr_name 주입
 *   TC02  main() - 이미 동일한 kr_name → 파일 쓰기 스킵
 *   TC03  main() - name_map에 ticker 없음 → noMatch 증가 (쓰기 없음)
 *   TC04  main() - name_map 비어있음 → process.exit(1)
 *   TC05  main() - kr_name이 "name" 키 직후에 삽입 확인
 *   TC06  main() - name 키 없는 info → kr_name 맨 뒤에 추가
 *   TC07  main() - 여러 파일 처리 (updated/skipped/noMatch 복합)
 *   TC08  main() - .json 아닌 파일 무시
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── fs 모킹 ───────────────────────────────────────────────────────────────────

const mockReadFileSync  = vi.fn();
const mockWriteFileSync = vi.fn();
const mockRenameSync    = vi.fn();
const mockReaddirSync   = vi.fn();

vi.mock("fs", () => ({
  default: {
    readFileSync:  (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    renameSync:    (...a: unknown[]) => mockRenameSync(...a),
    readdirSync:   (...a: unknown[]) => mockReaddirSync(...a),
  },
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function makeMeta(nameMap: Record<string, string>): string {
  return JSON.stringify({ name_map: nameMap });
}

function makeTickerFile(ticker: string, krName?: string): string {
  return JSON.stringify({
    ticker,
    info: {
      name:    "회사명",
      ...(krName !== undefined ? { kr_name: krName } : {}),
      sector:  null,
    },
  });
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe("patch_kr_name.ts main()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("TC01 - name_map 일치 → kr_name 주입 후 파일 쓰기", async () => {
    const ticker = "000150.KS";
    mockReadFileSync.mockImplementation((path: string) => {
      if (String(path).includes("all_kr_tickers")) return makeMeta({ [ticker]: "두산" });
      return makeTickerFile(ticker);  // kr_name 없음
    });
    mockReaddirSync.mockReturnValue(["000150.json"]);

    await import("../patch/patch_kr_name.js");

    expect(mockWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      info: { kr_name: string };
    };
    expect(written.info.kr_name).toBe("두산");
  });

  it("TC02 - 이미 동일한 kr_name → 파일 쓰기 스킵", async () => {
    const ticker = "000660.KS";
    mockReadFileSync.mockImplementation((path: string) => {
      if (String(path).includes("all_kr_tickers")) return makeMeta({ [ticker]: "SK하이닉스" });
      return makeTickerFile(ticker, "SK하이닉스");  // 이미 동일
    });
    mockReaddirSync.mockReturnValue(["000660.json"]);

    await import("../patch/patch_kr_name.js");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("TC03 - name_map에 ticker 없음 → 쓰기 없음", async () => {
    mockReadFileSync.mockImplementation((path: string) => {
      if (String(path).includes("all_kr_tickers")) return makeMeta({ "999999.KS": "없음" });
      return makeTickerFile("005930.KS");
    });
    mockReaddirSync.mockReturnValue(["005930.json"]);

    await import("../patch/patch_kr_name.js");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("TC04 - name_map 비어있음 → process.exit(1)", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ name_map: {} }));
    mockReaddirSync.mockReturnValue([]);
    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    await import("../patch/patch_kr_name.js");
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it("TC05 - kr_name이 'name' 직후에 삽입", async () => {
    const ticker = "005930.KS";
    mockReadFileSync.mockImplementation((path: string) => {
      if (String(path).includes("all_kr_tickers")) return makeMeta({ [ticker]: "삼성전자" });
      return JSON.stringify({
        ticker,
        info: { name: "Samsung Electronics", sector: "Technology" },
      });
    });
    mockReaddirSync.mockReturnValue(["005930.json"]);

    await import("../patch/patch_kr_name.js");
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      info: Record<string, unknown>;
    };
    const keys = Object.keys(written.info);
    const nameIdx   = keys.indexOf("name");
    const krNameIdx = keys.indexOf("kr_name");
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(krNameIdx).toBe(nameIdx + 1);  // "name" 바로 다음
  });

  it("TC06 - name 키 없는 info → kr_name 추가됨", async () => {
    const ticker = "000020.KS";
    mockReadFileSync.mockImplementation((path: string) => {
      if (String(path).includes("all_kr_tickers")) return makeMeta({ [ticker]: "동화약품" });
      return JSON.stringify({ ticker, info: { sector: null } });  // name 키 없음
    });
    mockReaddirSync.mockReturnValue(["000020.json"]);

    await import("../patch/patch_kr_name.js");
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as {
      info: { kr_name: string };
    };
    expect(written.info.kr_name).toBe("동화약품");
  });

  it("TC07 - 여러 파일 복합 처리 (update + skip + noMatch)", async () => {
    const calls: string[] = [];
    mockReadFileSync.mockImplementation((path: string) => {
      if (String(path).includes("all_kr_tickers")) {
        return makeMeta({ "AAA.KS": "에이에이에이", "BBB.KS": "비비비" });
      }
      if (String(path).includes("AAA")) { calls.push("AAA"); return makeTickerFile("AAA.KS"); }
      if (String(path).includes("BBB")) { calls.push("BBB"); return makeTickerFile("BBB.KS", "비비비"); }
      if (String(path).includes("CCC")) { calls.push("CCC"); return makeTickerFile("CCC.KS"); }
      return "{}";
    });
    mockReaddirSync.mockReturnValue(["AAA.json", "BBB.json", "CCC.json"]);

    await import("../patch/patch_kr_name.js");
    // AAA → 업데이트(write), BBB → 스킵, CCC → noMatch
    const writeCalls = mockWriteFileSync.mock.calls.length;
    expect(writeCalls).toBe(1);  // AAA만 업데이트
  });

  it("TC08 - .json 아닌 파일 무시", async () => {
    mockReadFileSync.mockImplementation((path: string) => {
      if (String(path).includes("all_kr_tickers")) return makeMeta({ "AAA.KS": "에이" });
      return makeTickerFile("AAA.KS");
    });
    mockReaddirSync.mockReturnValue(["README.md", "AAA.json", ".DS_Store"]);

    await import("../patch/patch_kr_name.js");
    // README.md, .DS_Store는 처리 안 됨 → AAA.json만 처리
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });
});
