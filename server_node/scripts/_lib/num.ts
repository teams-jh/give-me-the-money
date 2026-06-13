/**
 * 수치 유틸 (Issue #62)
 *
 * fetch 스크립트 6곳에 동일하게 복붙되어 있던 null-safe 반올림 추출.
 * 주의: src/library/shared 의 round(v, d)와는 시그니처/계약이 다르다
 *       (이쪽은 null-safe + 소수 2자리 고정). 통합하지 않는다.
 */

/** 소수점 2자리 반올림. null/undefined/NaN 은 null 반환 */
export function round(v: number | null | undefined): number | null {
  if (v == null || isNaN(v as number)) return null;
  return Math.round((v as number) * 100) / 100;
}
