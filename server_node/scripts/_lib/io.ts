/**
 * 파일 I/O 유틸 (Issue #62 → Issue #64 에서 src/library/shared/io.ts 로 이동)
 *
 * shared 계층이 scripts/ 와 server_node/scripts/ 양쪽에서 접근 가능한 유일한
 * 공통 계층이므로 구현을 그쪽으로 옮기고, 기존 import 경로 호환을 위해
 * 여기서는 re-export 만 한다.
 */

export { saveJsonAtomic, isUpdatedToday } from "../../../src/library/shared/io.ts";
