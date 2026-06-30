/**
 * notify_slack.test.ts
 *
 * 커버 대상 함수:
 *   parseNotifyArgs     — CLI 파싱 (--files, --market)
 *   uploadFileToSlack   — files.getUploadURLExternal → PUT 업로드 → file_id
 *   completeUpload      — files.completeUploadExternal (채널 게시)
 *   notifySlack         — 전체 오케스트레이션
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── fs mock ───────────────────────────────────────────────────────────────────
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockStatSync     = vi.hoisted(() => vi.fn());
const mockExistsSync   = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    statSync:     mockStatSync,
    existsSync:   mockExistsSync,
  },
}));

import {
  parseNotifyArgs,
  uploadFileToSlack,
  completeUpload,
  buildTickerListText,
  loadTickerListText,
  notifySlack,
  main,
} from './notify_slack.ts';

// ── parseNotifyArgs ─────────────────────────────────────────────────────────────

describe('parseNotifyArgs', () => {
  it('--files 쉼표 구분 → 배열, --market 파싱', () => {
    const argv = ['node', 'script.ts', '--files', 'a.png,b.png', '--market', 'kr'];
    expect(parseNotifyArgs(argv)).toEqual({ files: ['a.png', 'b.png'], market: 'kr', jsonPath: '' });
  });
  it('단일 파일', () => {
    const argv = ['node', 'script.ts', '--files', 'only.png', '--market', 'us'];
    expect(parseNotifyArgs(argv)).toEqual({ files: ['only.png'], market: 'us', jsonPath: '' });
  });
  it('공백/빈 항목 제거', () => {
    const argv = ['node', 'script.ts', '--files', 'a.png, ,b.png,', '--market', 'kr'];
    expect(parseNotifyArgs(argv)).toEqual({ files: ['a.png', 'b.png'], market: 'kr', jsonPath: '' });
  });
  it('--files 없으면 빈 배열', () => {
    const argv = ['node', 'script.ts', '--market', 'kr'];
    expect(parseNotifyArgs(argv)).toEqual({ files: [], market: 'kr', jsonPath: '' });
  });
  it('--market 없으면 빈 문자열', () => {
    const argv = ['node', 'script.ts', '--files', 'a.png'];
    expect(parseNotifyArgs(argv)).toEqual({ files: ['a.png'], market: '', jsonPath: '' });
  });
  it('--json 파싱', () => {
    const argv = ['node', 'script.ts', '--files', 'a.png', '--market', 'kr', '--json', 'src/db/kr/trend_sim/sim_kr.json'];
    expect(parseNotifyArgs(argv)).toEqual({
      files: ['a.png'],
      market: 'kr',
      jsonPath: 'src/db/kr/trend_sim/sim_kr.json',
    });
  });
});

// ── uploadFileToSlack ───────────────────────────────────────────────────────────

describe('uploadFileToSlack', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from('PNGDATA'));
    mockStatSync.mockReturnValue({ size: 7 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getUploadURLExternal → PUT → file_id 반환', async () => {
    const fetchMock = vi.fn()
      // 1단계: getUploadURLExternal
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, upload_url: 'https://files.slack/upload/X', file_id: 'F123' }),
      })
      // 2단계: PUT 업로드
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    const fileId = await uploadFileToSlack('xoxb-token', '/path/sim_kr.png');
    expect(fileId).toBe('F123');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 1단계 호출: Authorization 헤더 포함
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall[0]).toContain('files.getUploadURLExternal');
    expect(firstCall[1].headers.Authorization).toBe('Bearer xoxb-token');

    // 2단계 호출: upload_url로 PUT/POST, 파일 바이트 전송
    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall[0]).toBe('https://files.slack/upload/X');
  });

  it('getUploadURLExternal ok:false → 에러', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'invalid_auth' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileToSlack('bad', '/path/x.png')).rejects.toThrow(/invalid_auth/);
  });

  it('getUploadURLExternal HTTP 5xx(non-ok) → 에러 (json 파싱 전 차단)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => '<html>Bad Gateway</html>',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileToSlack('t', '/path/x.png')).rejects.toThrow(/502/);
  });

  it('업로드 URL PUT 실패(non-2xx) → 에러', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, upload_url: 'https://files.slack/u', file_id: 'F1' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'ERR' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileToSlack('t', '/path/x.png')).rejects.toThrow(/500/);
  });
});

// ── buildTickerListText ───────────────────────────────────────────────────────

describe('buildTickerListText', () => {
  it('us: 티커명만 콤마로 나열', () => {
    const text = buildTickerListText('us', [
      { ticker: 'AAPL', name: 'Apple Inc.' },
      { ticker: 'MSFT', name: 'Microsoft' },
    ]);
    expect(text).toBe('AAPL, MSFT');
  });

  it('kr: 종목코드(종목명) 형태로 나열', () => {
    const text = buildTickerListText('kr', [
      { ticker: '005930', name: '삼성전자' },
      { ticker: '000660', name: 'SK하이닉스' },
    ]);
    expect(text).toBe('005930(삼성전자), 000660(SK하이닉스)');
  });

  it('결과 없으면 빈 문자열', () => {
    expect(buildTickerListText('us', [])).toBe('');
  });
});

// ── loadTickerListText ──────────────────────────────────────────────────────────

describe('loadTickerListText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('json 파일 읽어 종목 리스트 텍스트 반환 (kr)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      results: [{ ticker: '005930', name: '삼성전자' }],
    }));

    expect(loadTickerListText('kr', '/a/sim_kr.json')).toBe('005930(삼성전자)');
  });

  it('파일 없으면 빈 문자열', () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadTickerListText('kr', '/a/missing.json')).toBe('');
  });

  it('jsonPath 빈 문자열이면 빈 문자열', () => {
    expect(loadTickerListText('kr', '')).toBe('');
  });

  it('파싱 실패 시 빈 문자열', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('NOT JSON');
    expect(loadTickerListText('kr', '/a/bad.json')).toBe('');
  });
});

// ── completeUpload ──────────────────────────────────────────────────────────────

describe('completeUpload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completeUploadExternal 호출 — channel/files/comment 전달', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await completeUpload('xoxb', 'C999', ['F1', 'F2'], '📈 차트');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('files.completeUploadExternal');
    expect(opts.headers.Authorization).toBe('Bearer xoxb');
    const body = JSON.parse(opts.body);
    expect(body.channel_id).toBe('C999');
    expect(body.files.map((f: { id: string }) => f.id)).toEqual(['F1', 'F2']);
    expect(body.initial_comment).toBe('📈 차트');
  });

  it('ok:false → 에러', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'channel_not_found' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(completeUpload('t', 'C1', ['F1'], 'x')).rejects.toThrow(/channel_not_found/);
  });

  it('HTTP 5xx(non-ok) → 에러 (json 파싱 전 차단)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 504,
      text: async () => '<html>Gateway Timeout</html>',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(completeUpload('t', 'C1', ['F1'], 'x')).rejects.toThrow(/504/);
  });
});

// ── notifySlack (오케스트레이션) ─────────────────────────────────────────────────

describe('notifySlack', () => {
  beforeEach(() => {
    mockReadFileSync.mockReturnValue(Buffer.from('PNG'));
    mockStatSync.mockReturnValue({ size: 3 });
    mockExistsSync.mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('파일 N개 업로드 후 completeUpload 1회', async () => {
    const fetchMock = vi.fn()
      // file1: getUploadURL + PUT
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, upload_url: 'u1', file_id: 'F1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' })
      // file2: getUploadURL + PUT
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, upload_url: 'u2', file_id: 'F2' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' })
      // complete
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await notifySlack({
      token: 'xoxb',
      channel: 'C1',
      files: ['/a/sim_kr_1.png', '/a/sim_kr_2.png'],
      market: 'kr',
    });

    // 2파일 * 2호출 + complete 1회 = 5
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const completeCall = fetchMock.mock.calls[4];
    expect(completeCall[0]).toContain('files.completeUploadExternal');
    const body = JSON.parse(completeCall[1].body);
    expect(body.files.map((f: { id: string }) => f.id)).toEqual(['F1', 'F2']);
    expect(body.initial_comment).toContain('KR');
  });

  it('존재하지 않는 파일은 건너뜀', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('exists'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, upload_url: 'u1', file_id: 'F1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await notifySlack({
      token: 'xoxb',
      channel: 'C1',
      files: ['/a/missing.png', '/a/exists.png'],
      market: 'us',
    });

    // 1파일만 업로드(2호출) + complete(1) = 3
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('업로드할 파일이 하나도 없으면 API 호출 안 함', async () => {
    mockExistsSync.mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await notifySlack({ token: 'xoxb', channel: 'C1', files: ['/a/x.png'], market: 'kr' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('jsonPath 제공 시 종목 리스트가 comment에 포함됨 (kr)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === '/a/sim_kr.json') {
        return JSON.stringify({
          results: [
            { ticker: '005930', name: '삼성전자' },
            { ticker: '000660', name: 'SK하이닉스' },
          ],
        });
      }
      return Buffer.from('PNG');
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, upload_url: 'u1', file_id: 'F1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await notifySlack({
      token: 'xoxb',
      channel: 'C1',
      files: ['/a/sim_kr.png'],
      market: 'kr',
      jsonPath: '/a/sim_kr.json',
    });

    const completeCall = fetchMock.mock.calls[2];
    const body = JSON.parse(completeCall[1].body);
    expect(body.initial_comment).toContain('005930(삼성전자), 000660(SK하이닉스)');
  });
});

// ── main ────────────────────────────────────────────────────────────────────────

describe('main', () => {
  const origArgv = process.argv;

  beforeEach(() => {
    mockReadFileSync.mockReturnValue(Buffer.from('PNG'));
    mockStatSync.mockReturnValue({ size: 3 });
    mockExistsSync.mockReturnValue(true);
  });
  afterEach(() => {
    process.argv = origArgv;
    vi.unstubAllGlobals();
  });

  it('토큰/채널 env 없으면 throw', async () => {
    process.argv = ['node', 'notify_slack.ts', '--files', 'a.png', '--market', 'kr'];
    await expect(main({})).rejects.toThrow(/SLACK_BOT_TOKEN/);
  });

  it('채널만 없어도 throw', async () => {
    process.argv = ['node', 'notify_slack.ts', '--files', 'a.png', '--market', 'kr'];
    await expect(main({ SLACK_BOT_TOKEN: 'xoxb' })).rejects.toThrow(/SLACK/);
  });

  it('--files 비면 전송 없이 정상 반환', async () => {
    process.argv = ['node', 'notify_slack.ts', '--market', 'kr'];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await main({ SLACK_BOT_TOKEN: 'xoxb', SLACK_CHANNEL_ID: 'C1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('정상 env + 파일 → notifySlack 실행', async () => {
    process.argv = ['node', 'notify_slack.ts', '--files', '/a/sim_kr.png', '--market', 'kr'];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, upload_url: 'u1', file_id: 'F1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await main({ SLACK_BOT_TOKEN: 'xoxb', SLACK_CHANNEL_ID: 'C1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
