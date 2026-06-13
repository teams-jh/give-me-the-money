/**
 * 파일 I/O 유틸 (Issue #62)
 *
 * - saveJsonAtomic: `.tmp 쓰기 → renameSync` atomic write 패턴 캡슐화 (기존 7곳 중복)
 * - isUpdatedToday: 출력 JSON 의 updated_at 이 오늘(UTC)인지 검사 (기존 6곳 중복)
 */

import fs from "fs";

/** data 를 pretty JSON(2-space) 으로 tmp 파일에 쓴 뒤 rename 하여 원자적으로 저장.
 *  실패 시 잔존 tmp 파일을 삭제(cleanup)하고 원본 에러를 재throw 한다. */
export function saveJsonAtomic(outputPath: string, data: unknown): void {
  const tmp = outputPath + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, outputPath);
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // cleanup 실패는 무시 — 원본 에러를 우선 전파
    }
    throw error;
  }
}

/** file 의 updated_at 이 오늘(UTC) 날짜면 true. 파일 없음/손상/필드 없음 → false */
export function isUpdatedToday(file: string): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { updated_at?: string };
    if (!data.updated_at) return false;
    const updatedDate = new Date(data.updated_at).toISOString().slice(0, 10);
    const today       = new Date().toISOString().slice(0, 10);
    return updatedDate === today;
  } catch {
    return false;
  }
}
