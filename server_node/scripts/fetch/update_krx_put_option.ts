/**
 * KRX KOSPI200 풋옵션 매매동향 데이터 업데이트
 *
 * KRX 정보데이터시스템(data.krx.co.kr)에 로그인하여
 * KOSPI200 풋옵션 거래대금 매매동향 데이터를 2년치 다운로드하고
 * src/db/market_sentiment/krx_put_option.json 에 저장한다.
 *
 * 스킵 조건:
 *   - krx_put_option.json 의 updated_at 이 오늘 날짜이면 건너뜀
 *   - --force 플래그로 강제 재다운로드 가능
 *   - --debug 플래그로 실행 중 디버그 스크린샷 활성화 가능
 *
 * 실행:
 *   npx tsx scripts/fetch/update_krx_put_option.ts
 *   npx tsx scripts/fetch/update_krx_put_option.ts --force
 */

import puppeteer from 'puppeteer';
import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 설정 ─────────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.resolve(__dirname, "../../../src/db/market_sentiment");
const OUTPUT = path.join(OUTPUT_DIR, "krx_put_option.json");

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [INFO] ${msg}`);
}

function errorLog(msg: string): void {
  console.error(`${new Date().toISOString()} [ERROR] ${msg}`);
}

/** krx_put_option.json 의 updated_at 이 오늘 날짜면 true */
function isUpdatedToday(): boolean {
  try {
    if (!fs.existsSync(OUTPUT)) return false;
    const data = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as { updated_at?: string };
    if (!data.updated_at) return false;
    const updatedDate = new Date(data.updated_at).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return updatedDate === today;
  } catch {
    return false;
  }
}

/** CI(GitHub Actions) 및 로컬 실행 환경 대응 크롬 실행 경로 */
function getExecutablePath(): string | undefined {
  if (process.env["PUPPETEER_EXECUTABLE_PATH"]) {
    return process.env["PUPPETEER_EXECUTABLE_PATH"];
  }
  if (process.env["CI"]) {
    return "/usr/bin/google-chrome";
  }
  const winChromeDefault = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const winChromeX86 = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  
  if (fs.existsSync(winChromeDefault)) return winChromeDefault;
  if (fs.existsSync(winChromeX86)) return winChromeX86;

  return undefined;
}

// ── 핵심 스크래퍼 실행 ──────────────────────────────────────────────────────────

async function runScraper(debugMode: boolean): Promise<Buffer> {
  const TEST_ID = process.env.KRX_ID;
  const TEST_PW = process.env.KRX_PW;

  if (!TEST_ID || !TEST_PW) {
    throw new Error('KRX_ID 또는 KRX_PW 환경변수가 설정되지 않았습니다.');
  }

  const formatYYYYMMDD = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };

  const today = new Date();
  const finalEndDate = formatYYYYMMDD(today);
  
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(today.getFullYear() - 2);
  const finalStartDate = formatYYYYMMDD(twoYearsAgo);

  log(`조회 기간 (최대 2년): ${finalStartDate} ~ ${finalEndDate}`);

  const executablePath = getExecutablePath();
  if (executablePath) log(`크롬 실행 경로: ${executablePath}`);

  const browser = await puppeteer.launch({
    headless: !debugMode, // 디버그 플래그에 따라 브라우저 화면 표시 조절
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-geolocation',
      '--ignore-certificate-errors',
      '--allow-running-insecure-content',
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessNonSecureContextsAllowed,PrivateNetworkAccess,PrivateNetworkAccessTechnicalMitigation',
    ],
  });

  const context = browser.defaultBrowserContext();
  await context.overridePermissions('https://data.krx.co.kr', ['notifications', 'geolocation']);

  let page: puppeteer.Page | null = null;

  try {
    page = await browser.newPage();
    
    // [CDP] local-network-access 권한 사전 승인 (LNA 차단 완벽 우회)
    try {
      const cdp = await page.createCDPSession();
      await cdp.send('Browser.setPermission', {
        origin: 'https://data.krx.co.kr',
        permission: { name: 'local-network-access' },
        setting: 'granted'
      });
      log('CDP: local-network-access 권한 허용 완료');
    } catch (cdpErr: any) {
      log(`⚠️ CDP local-network-access 권한 설정 실패: ${cdpErr.message}`);
    }
    
    // 네이티브 다이얼로그 가드
    page.on('dialog', async dialog => {
      const msg = dialog.message();
      log(`🚨 [브라우저 알림] 종류: ${dialog.type()}, 메시지: ${msg}`);
      await dialog.dismiss().catch(() => {});
    });
    
    page.on('console', msg => {
      const text = msg.text();
      // 불필요한 nProtect 로깅 노이즈 필터링
      if (!text.includes('nppfs') && !text.includes('NPPFS')) {
        log(`[브라우저 로그] ${text}`);
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // window confirm/alert 차단 선언
    await page.evaluateOnNewDocument(`
      (function() {
        window.confirm = function(message) {
          console.log('[Guard] window.confirm 차단됨: "' + message + '"');
          return false;
        };
        window.alert = function(message) {
          console.log('[Guard] window.alert 차단됨: "' + message + '"');
        };
      })();
    `);

    // 1단계: 게이트웨이 페이지 진입
    const mainPageUrl = 'https://data.krx.co.kr/';
    log(`1. 메인 게이트웨이 접속 시작: ${mainPageUrl}`);
    try {
      await page.goto(mainPageUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      log('메인 페이지 로드 완료.');
    } catch (e: any) {
      log('메인 페이지 접속 타임아웃 발생 (무시하고 진행).');
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2단계: 로그인 페이지 이동
    const loginPageUrl = 'https://data.krx.co.kr/contents/MDC/COMS/client/view/login.jsp?site=mdc';
    log(`2. 로그인 페이지 이동: ${loginPageUrl}`);
    await page.goto(loginPageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    
    log('nProtect 초기화 및 웹소켓 연결 안정화를 위해 대기...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 로그인 실행 함수 정의
    const performLoginSubmission = async () => {
      log('크리덴셜 타이핑 입력 진행...');
      
      // ID 입력
      await page!.click('input#mbrId');
      await page!.evaluate(() => {
        const el = document.querySelector('input#mbrId') as HTMLInputElement;
        if (el) el.value = '';
      });
      await page!.type('input#mbrId', TEST_ID!, { delay: 60 });
      
      // nProtect 키보드 보안 우회 (Node 복제)
      log('nProtect 키락킹 해제를 위한 Node Clone Bypass 적용...');
      await page!.evaluate(() => {
        const pwInput = document.querySelector('input[name="pw"]') as HTMLInputElement;
        if (pwInput) {
          const cleanInput = pwInput.cloneNode(true) as HTMLInputElement;
          cleanInput.removeAttribute('onkeydown');
          cleanInput.removeAttribute('onkeypress');
          cleanInput.removeAttribute('onkeyup');
          cleanInput.removeAttribute('onfocus');
          cleanInput.removeAttribute('onblur');
          cleanInput.removeAttribute('onclick');
          cleanInput.value = '';
          pwInput.replaceWith(cleanInput);
        }
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      // 복제된 필드에 비밀번호 입력
      await page!.click('input[name="pw"]');
      await page!.type('input[name="pw"]', TEST_PW!, { delay: 60 });
      
      await page!.evaluate(() => {
        const pw = document.querySelector('input[name="pw"]') as HTMLInputElement;
        if (pw) pw.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      if (debugMode) {
        try {
          const snapshotPath = path.join(__dirname, 'krx_login_fill_snapshot.png');
          await page!.screenshot({ path: snapshotPath });
          log(`[디버그] 로그인 입력 스냅샷 저장: ${snapshotPath}`);
        } catch (e) {}
      }

      log('로그인 제출 버튼 클릭...');
      await page!.evaluate(() => {
        const $ = (window as any).jQuery;
        if ($ && $('.jsLoginBtn').length > 0) {
          $('.jsLoginBtn').trigger('click');
        } else {
          const loginBtn = document.querySelector('a.jsLoginBtn') as HTMLElement;
          if (loginBtn) loginBtn.click();
        }
      });
    };

    // 1차 로그인 시도
    await performLoginSubmission();

    // 중복 로그인 팝업 대응 감지 및 처리
    log('중복 로그인 모달 감지 중...');
    let dupChecked = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        const hasDupModal = await page.evaluate(() => {
          const text = document.body.innerText;
          if (text.includes('이미 로그인된 계정입니다')) {
            const elements = Array.from(document.querySelectorAll('a, button, span, div, input')) as HTMLElement[];
            const confirmBtn = elements.find(el => {
              const elText = (el.innerText || el.getAttribute('value') || '').trim();
              return elText === '확인' || elText === 'Ok' || elText === 'YES';
            });
            if (confirmBtn) { confirmBtn.click(); return true; }
          }
          return false;
        });

        if (hasDupModal) {
          log('🚨 [중복 세션 발견] 이전 세션을 종료하고 강제 로그아웃 조치를 클릭했습니다.');
          dupChecked = true;
          break;
        }
      } catch (err: any) {
        if (err.message && err.message.includes('destroyed')) break;
      }
    }

    if (dupChecked) {
      log('세션 갱신을 위한 브라우저 리로드 대기 (5초)...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      log('🔄 [재시도] 갱신된 로그인 페이지에서 2차 로그인을 실행합니다...');
      await performLoginSubmission();
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 로그인 완료 대기 및 검증
    let loggedIn = false;
    for (let i = 0; i < 30; i++) {
      if (!page.url().includes('login.jsp')) {
        loggedIn = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (loggedIn) {
      log(`✅ 로그인 성공! 현재 경로: ${page.url()}`);
    } else {
      log(`⚠️ 경고: 아직 로그인 페이지에 남아있습니다. 현재 경로: ${page.url()}`);
    }

    if (debugMode) {
      try {
        const afterLoginPath = path.join(__dirname, 'krx_after_login_click.png');
        await page.screenshot({ path: afterLoginPath });
        log(`[디버그] 로그인 완료 후 스냅샷 저장: ${afterLoginPath}`);
      } catch (e) {}
    }

    // 3단계: 회원 이용약관 동의 팝업 처리
    log('3. 규정 동의/보안 정책 동의 팝업 체크...');
    const popupDiagnosis = await page.evaluate(() => {
      const popupEl = document.querySelector('#previousMemberPopup') as HTMLElement;
      const isVisible = popupEl && window.getComputedStyle(popupEl).display !== 'none';
      return {
        popupVisible: !!isVisible,
      };
    });

    if (popupDiagnosis.popupVisible) {
      log('🚨 [이용약관 동의] 팝업이 노출되어 자동 동의 절차를 클릭합니다.');
      await page.evaluate(() => {
        const checkboxY = document.querySelector('#isUseRuleOk3_Y') as HTMLInputElement;
        if (checkboxY) checkboxY.click();
        const agreeBtn = document.querySelector('#agreeComplete') as HTMLElement;
        if (agreeBtn) agreeBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 혹시 모를 Consent 페이지 직접 진입 처리
    if (page.url().includes('MDCCOMS002_S1.cmd')) {
      log('⚠️ [규약 동의서] 동의 페이지 리다이렉트 감지. 전체 동의 버튼을 클릭합니다.');
      await page.evaluate(() => {
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
        checkboxes.forEach(cb => { if (!cb.checked) cb.click(); });
        const buttons = Array.from(document.querySelectorAll('a, button, input[type="button"]')) as HTMLElement[];
        const targetBtn = buttons.find(btn => {
          const text = (btn.innerText || btn.getAttribute('value') || '').trim();
          return text.includes('확인') || text.includes('동의') || text.includes('완료');
        });
        if (targetBtn) targetBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 8000));
    }

    log('쿠키 세션 안정화를 위해 잠시 대기...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4단계: 타겟 옵션 통계 페이지 이동 (토큰 싱크)
    const targetPageUrl = 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201050302';
    log(`4. 데이터 통계 프레임 로더로 이동: ${targetPageUrl}`);
    try {
      await page.goto(targetPageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      log('통계 프레임 로딩 완료.');
    } catch (e: any) {
      log('프레임 로딩 타임아웃 발생 (무시하고 OTP 발급 진행).');
    }

    log('iframe 토큰 동기화 대기 (10초)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (debugMode) {
      try {
        const targetPath = path.join(__dirname, 'krx_final_target_page.png');
        await page.screenshot({ path: targetPath });
        log(`[디버그] 타겟 로딩 스냅샷 저장: ${targetPath}`);
      } catch (e) {}
    }

    const cookies = await page.cookies();
    const jsessionExists = cookies.some(c => c.name === 'JSESSIONID');
    log(`JSESSIONID 확보 검증: ${jsessionExists ? '✅ 확보 성공' : '❌ 실패'}`);
    
    // 5단계: OTP 갱신 및 CSV 다운로드 트리거
    log('5. OTP(One Time Password) 발급 및 CSV 수집 개시...');
    
    let csvBytes: number[] = [];
    let retries = 3;
    while (retries > 0) {
      try {
        csvBytes = await page.evaluate(async (startVal, endVal) => {
          const otpUrl = 'https://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd';
          const otpParams = new URLSearchParams({
            bld: 'dbms/MDC/STAT/standard/MDCSTAT13102',
            locale: 'ko_KR',
            prodId: '',
            strtDd: startVal,
            endDd: endVal,
            inqTpCd: '2',
            prtType: 'AMT',
            prtCheck: 'SUN',
            isuCd: 'KR___OPK2I',
            isuOpt: 'P',
            aggBasTpCd: '',
            strtDdBox1: startVal,
            endDdBox1: endVal,
            money: '3',
            csvxls_isNo: 'false',
            name: 'fileDown',
            url: 'dbms/MDC/STAT/standard/MDCSTAT13102'
          });

          const controller1 = new AbortController();
          const timer1 = setTimeout(() => controller1.abort(), 20000);
          let otpCode = '';
          try {
            const otpResponse = await fetch(otpUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
              },
              body: otpParams.toString(),
              signal: controller1.signal
            });
            if (!otpResponse.ok) throw new Error(`GenerateOTP HTTP ${otpResponse.status}`);
            otpCode = await otpResponse.text();
          } finally {
            clearTimeout(timer1);
          }

          if (otpCode === 'LOGOUT') throw new Error('GenerateOTP returned LOGOUT. Session restricted.');

          const downloadUrl = 'https://data.krx.co.kr/comm/fileDn/download_csv/download.cmd';
          const controller2 = new AbortController();
          const timer2 = setTimeout(() => controller2.abort(), 20000);
          try {
            const downloadResponse = await fetch(downloadUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ code: otpCode }).toString(),
              signal: controller2.signal
            });
            if (!downloadResponse.ok) throw new Error(`CSV Download HTTP ${downloadResponse.status}`);
            const arrayBuffer = await downloadResponse.arrayBuffer();
            return Array.from(new Uint8Array(arrayBuffer));
          } finally {
            clearTimeout(timer2);
          }
        }, finalStartDate, finalEndDate);
        
        break;
      } catch (err: any) {
        retries--;
        log(`⚠️ OTP 발급 시도 실패 (남은 횟수: ${retries}): ${err.message}`);
        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 3000));
        else throw err;
      }
    }

    log(`CSV 다운로드 수집 완료 (파일 크기: ${csvBytes.length} 바이트)`);
    return Buffer.from(csvBytes);

  } catch (error: any) {
    if (page) {
      try {
        const errorPath = path.join(__dirname, 'krx_error_screenshot.png');
        await page.screenshot({ path: errorPath, fullPage: true });
        errorLog(`자동화 예외 발생 스냅샷 저장: ${errorPath}`);
      } catch (e) {}
    }
    throw error;
  } finally {
    await browser.close();
    log('Puppeteer 크롬 인스턴스 종료.');
  }
}

// ── 데이터 가공 및 파일 저장 ────────────────────────────────────────────────────

function parseAndSave(csvBuffer: Buffer): void {
  const decodedCsv = iconv.decode(csvBuffer, 'euc-kr');
  
  // CSV 라인 분해 헬퍼
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const lines = decodedCsv.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV 파싱 실패: 수집된 데이터 라인 수가 부족합니다.');
  }

  let headerIndex = -1;
  let headers: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseCsvLine(lines[i]);
    const cleaned = parsed.map(h => h.replace(/"/g, '').trim());
    if (cleaned.includes('일자')) {
      headerIndex = i;
      headers = cleaned;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('CSV 구조 감지 실패: "일자" 컬럼 헤더가 존재하지 않습니다.');
  }

  const dateIdx = headers.findIndex(h => h.includes('일자'));
  const retailIdx = headers.findIndex(h => h.includes('개인'));
  const foreignerIdx = headers.findIndex(h => h.includes('외국인'));
  const institutionIdx = headers.findIndex(h => h.includes('기관'));

  if (dateIdx === -1 || retailIdx === -1 || foreignerIdx === -1 || institutionIdx === -1) {
    throw new Error(`필수 헤더 매핑 오류: [일자:${dateIdx}, 개인:${retailIdx}, 외국인:${foreignerIdx}, 기관:${institutionIdx}]`);
  }

  const historical: any[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]).map(val => val.replace(/"/g, '').trim());
    if (row.length <= dateIdx || !row[dateIdx]) continue;
    
    let rawDate = row[dateIdx].replace(/[-\/]/g, '');
    if (rawDate.length !== 8) continue;
    const formattedDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
    
    const parseNum = (val: string) => {
      if (!val) return 0;
      const clean = val.replace(/,/g, '');
      return parseFloat(clean) || 0;
    };

    const retailVal = parseNum(row[retailIdx]);
    const foreignerVal = parseNum(row[foreignerIdx]);
    const institutionVal = parseNum(row[institutionIdx]);

    historical.push({
      date: formattedDate,
      retail: retailVal,
      foreigner: foreignerVal,
      institution: institutionVal
    });
  }

  // 날짜 오름차순으로 데이터 정렬
  historical.sort((a, b) => a.date.localeCompare(b.date));

  const latest = historical[historical.length - 1] || null;
  const dbData = {
    updated_at: new Date().toISOString(),
    latest: latest ? {
      date: latest.date,
      retail: latest.retail,
      foreigner: latest.foreigner,
      institution: latest.institution
    } : null,
    historical
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const tmpFile = OUTPUT + ".tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(dbData, null, 2), 'utf-8');
  fs.renameSync(tmpFile, OUTPUT);

  log(`저장 완료: ${OUTPUT}`);
  log(`최근 풋옵션 매매동향 날짜: ${dbData.latest?.date}`);
  log(`  - 개인:   ${dbData.latest?.retail}`);
  log(`  - 외국인: ${dbData.latest?.foreigner}`);
  log(`  - 기관:   ${dbData.latest?.institution}`);
  log(`히스토리 수집일수: ${dbData.historical.length}일`);
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const debugMode = process.argv.includes("--debug");

  log("=== KRX 풋옵션 데이터 업데이트 시작 ===");

  if (!force && isUpdatedToday()) {
    log("오늘 이미 데이터가 수집 완료되었습니다. 업데이트를 건너뜁니다 (강제 실행: --force 플래그)");
    log("=== 실행 종료 (스킵) ===");
    return;
  }

  try {
    const csvBuffer = await runScraper(debugMode);
    parseAndSave(csvBuffer);
    log("=== KRX 풋옵션 데이터 업데이트 완료 ===");
  } catch (e: unknown) {
    errorLog(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

// 직접 실행 판별
const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((e: unknown) => {
    errorLog(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
