import puppeteer from 'puppeteer';
import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';


// =========================================================================
// [개발자 가이드] 로컬 테스트용 사용자 기입 계정 정보 유지
// =========================================================================
const TEST_ID = process.env.KRX_ID; 
const TEST_PW = process.env.KRX_PW; 

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

async function testKrxOptionWithConsent() {
  console.log('=== Starting KRX Put Option 100% Automated Fetch ===');
  
  // 날짜 계산 유틸리티
  const formatYYYYMMDD = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };

  const today = new Date();
  const finalEndDate = formatYYYYMMDD(today);
  
  // 최대 조회 기간인 2년 전 날짜 계산 (윤년 등 대응 안전 로직)
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(today.getFullYear() - 2);
  const finalStartDate = formatYYYYMMDD(twoYearsAgo);

  console.log(`Inquiry Period (Max 2 Years): ${finalStartDate} ~ ${finalEndDate}`);
  
  if (!TEST_ID || !TEST_PW) {
    console.error('[Error] KRX 아이디 또는 비밀번호가 설정되지 않았습니다.');
    return;
  }

  const executablePath = getExecutablePath();
  if (executablePath) console.log(`Browser Path: ${executablePath}`);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-geolocation',
    ],
  });

  const context = browser.defaultBrowserContext();
  await context.overridePermissions('https://data.krx.co.kr', ['notifications', 'geolocation']);

  let page: puppeteer.Page | null = null;

  try {
    page = await browser.newPage();
    
    // 브라우저 Native Dialog 감지: alert/confirm은 닫되 내용은 로깅
    page.on('dialog', async dialog => {
      const msg = dialog.message();
      console.log(`🚨 [Dialog] Type: ${dialog.type()}, Message: ${msg}`);
      // 보안프로그램 설치 안내 팝업이면 dismiss(취소), 일반 confirm이면 accept
      if (msg.includes('보안프로그램') || msg.includes('설치')) {
        await dialog.dismiss().catch(() => {});
      } else {
        await dialog.dismiss().catch(() => {});
      }
    });
    
    page.on('console', msg => {
      const text = msg.text();
      // 과도한 nProtect 콘솔 출력은 필터링
      if (!text.includes('nppfs') && !text.includes('NPPFS')) {
        console.log(`[Browser] ${text}`);
      }
    });

    page.on('pageerror', err => {
      console.error(`🚨 [PageError] ${err.message}`);
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // =========================================================================
    // [전략] nProtect 로컬 설치 환경에서 정상 동작하도록 우회 코드 제거
    // nProtect 에이전트가 로컬에서 구동 중이면:
    //  - nppfs-1.13.0.js가 로컬 에이전트(127.0.0.1:14440~14449)에 정상 연결
    //  - 서버 측 세션이 restricted가 되지 않음
    //  - GenerateOTP가 유효 토큰 반환
    //
    // window.confirm만 가로채어 혹시라도 발생하는 팝업을 자동 처리
    // =========================================================================
    await page.evaluateOnNewDocument(`
      (function() {
        // confirm/alert 가드
        window.confirm = function(message) {
          console.log('[Guard] window.confirm intercepted: "' + message + '"');
          return false;
        };
        window.alert = function(message) {
          console.log('[Guard] window.alert intercepted: "' + message + '"');
        };
      })();
    `);

    // 1단계: 메인 진입 세션 형성
    const mainPageUrl = 'https://data.krx.co.kr/';
    console.log(`1. [Gateway] Navigating to KRX Main: ${mainPageUrl}`);
    try {
      await page.goto(mainPageUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      console.log('Main Page loaded.');
    } catch (e: any) {
      console.log('Note: Main page navigation warning, proceeding.');
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2단계: 로그인 페이지 이동
    const loginPageUrl = 'https://data.krx.co.kr/contents/MDC/COMS/client/view/login.jsp?site=mdc';
    console.log(`2. [Login] Moving to Login Page: ${loginPageUrl}`);
    await page.goto(loginPageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    
    // nProtect 로드 및 초기화 대기 (에이전트 연결 시간 확보)
    console.log('Waiting 5 seconds for nProtect agent connection...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // nProtect 연결 완료 대기 (wsOpen === true 또는 최대 10초)
    console.log('Waiting for nProtect agent WebSocket to connect...');
    let nprotectReady = false;
    for (let i = 0; i < 20; i++) {
      const status = await page.evaluate(() => {
        const ctrl = (window as any).npPfsCtrl;
        return {
          exists: !!ctrl,
          isInstall: ctrl ? String(ctrl.isInstall) : 'N/A',
          wsOpen: ctrl ? ctrl.wsOpen : false,
          wsState: ctrl ? ctrl.wsState : -1,
        };
      });
      console.log(`[nProtect] Check ${i+1}/20:`, JSON.stringify(status));
      if (status.wsOpen === true) {
        console.log('✅ nProtect agent connected (wsOpen=true)!');
        nprotectReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!nprotectReady) {
      console.log('⚠️  nProtect agent connection not confirmed. Proceeding anyway...');
    }

    // 로그인 크리덴셜 입력 — page.type()으로 실제 키보드 이벤트 발생
    // (nProtect 키보드 보안 모듈이 키스트로크를 직접 캡처하여 암호화)
    console.log('Typing credentials via keyboard simulation...');
    
    // ID 필드 클리어 후 입력
    await page.click('input#mbrId');
    await page.evaluate(() => {
      const el = document.querySelector('input#mbrId') as HTMLInputElement;
      if (el) el.value = '';
    });
    await page.type('input#mbrId', TEST_ID, { delay: 80 });
    
    // 비밀번호 필드: 실제 키 입력으로 nProtect 암호화 모듈 통과
    await page.click('input[name="pw"]');
    await page.evaluate(() => {
      const el = document.querySelector('input[name="pw"]') as HTMLInputElement;
      if (el) el.value = '';
    });
    await page.type('input[name="pw"]', TEST_PW, { delay: 80 });
    
    // blur 이벤트로 nProtect doFocusOut 트리거 (암호화 완료)
    await page.evaluate(() => {
      const pw = document.querySelector('input[name="pw"]') as HTMLInputElement;
      if (pw) pw.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 로그인 스크린샷
    try {
      await page.screenshot({ path: 'scripts/krx_login_fill_snapshot.png' });
      console.log('Login fill snapshot saved.');
    } catch (e) {}

    // 로그인 버튼 클릭
    console.log('Clicking login button...');
    
    const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {
      console.log('Note: Login navigation completed or timed out.');
    });

    try {
      await page.evaluate(() => {
        const $ = (window as any).jQuery;
        if ($ && $('.jsLoginBtn').length > 0) {
          $('.jsLoginBtn').trigger('click');
        } else {
          const loginBtn = document.querySelector('a.jsLoginBtn') as HTMLElement;
          if (loginBtn) loginBtn.click();
        }
      });
    } catch (e: any) {
      if (e.message && e.message.includes('destroyed')) {
        console.log('Note: Immediate navigation triggered.');
      } else {
        console.error('Login button click error:', e.message);
      }
    }

    // 중복 로그인 팝업 감지 및 자동 클릭 처리
    console.log('Checking for duplicate login modal...');
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
          console.log('🚨 [Duplicate Login] Clicked "Confirm" on duplicate session modal.');
          dupChecked = true;
          break;
        }
      } catch (err: any) {
        if (err.message && err.message.includes('destroyed')) break;
      }
    }

    if (dupChecked) {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {
        console.log('Note: Duplicate login navigation timed out.');
      });
    } else {
      await navigationPromise;
    }

    // 로그인 완료 URL 확인
    let loggedIn = false;
    for (let i = 0; i < 30; i++) {
      const currentUrl = page.url();
      if (!currentUrl.includes('login.jsp')) {
        loggedIn = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (loggedIn) {
      console.log(`✅ Login success! Redirected to: ${page.url()}`);
    } else {
      console.log(`⚠️  Warning: Still on login page. Current URL: ${page.url()}`);
      // 로그인 페이지 상태 진단
      const loginState = await page.evaluate(() => {
        return {
          url: window.location.href,
          errorMsg: (document.querySelector('.loginError, .error_msg, #loginError') as HTMLElement)?.innerText || '',
          hasForm: !!document.querySelector('form'),
        };
      });
      console.log('[Login State Diagnosis]:', loginState);
    }

    try {
      await page.screenshot({ path: 'scripts/krx_after_login_click.png' });
      console.log('After-login snapshot saved.');
    } catch (e) {}

    // 3단계: 이용약관 동의 팝업 처리
    console.log('3. Checking for terms popup...');
    const popupDiagnosis = await page.evaluate(() => {
      const popupEl = document.querySelector('#previousMemberPopup') as HTMLElement;
      const isVisible = popupEl && window.getComputedStyle(popupEl).display !== 'none';
      return {
        popupVisible: !!isVisible,
        checkboxExists: !!document.querySelector('#isUseRuleOk3_Y'),
        agreeBtnExists: !!document.querySelector('#agreeComplete'),
      };
    });

    console.log('[Popup Diagnosis]:', popupDiagnosis);

    if (popupDiagnosis.popupVisible) {
      console.log('🚨 [Terms Popup] Auto-agreeing...');
      await page.evaluate(() => {
        const checkboxY = document.querySelector('#isUseRuleOk3_Y') as HTMLInputElement;
        if (checkboxY) checkboxY.click();
        const agreeBtn = document.querySelector('#agreeComplete') as HTMLElement;
        if (agreeBtn) agreeBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    const currentUrlCheck = page.url();
    console.log(`Current URL after login: ${currentUrlCheck}`);

    if (currentUrlCheck.includes('MDCCOMS002_S1.cmd')) {
      console.log('⚠️ [Consent Page] Auto-submitting additional consent...');
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

    // 세션 쿠키 안착 대기
    console.log('Waiting 5 seconds for session cookies...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4단계: 타겟 옵션 통계 페이지 이동
    const targetPageUrl = 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201050302';
    console.log(`4. [Target] Moving to Target Page: ${targetPageUrl}`);
    try {
      await page.goto(targetPageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      console.log('Target Page loaded.');
    } catch (e: any) {
      console.log('Note: Target page navigation timed out, proceeding.');
    }

    console.log('Waiting 10 seconds for iframe/token sync...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    try {
      await page.screenshot({ path: 'scripts/krx_final_target_page.png' });
    } catch (e) {}

    const cookies = await page.cookies();
    const jsessionExists = cookies.some(c => c.name === 'JSESSIONID');
    console.log(`JSESSIONID 확보: ${jsessionExists ? '✅ 성공' : '❌ 실패'}`);
    
    // 5단계: OTP 요청 및 CSV 다운로드
    console.log('5. Requesting OTP & Downloading CSV...');
    
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
            console.log('GenerateOTP result:', otpCode.substring(0, 30));
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
            console.log('CSV downloaded! Size:', arrayBuffer.byteLength, 'bytes');
            return Array.from(new Uint8Array(arrayBuffer));
          } finally {
            clearTimeout(timer2);
          }
        }, finalStartDate, finalEndDate);
        
        break;
      } catch (err: any) {
        retries--;
        console.warn(`OTP attempt failed (retries left: ${retries}): ${err.message}`);
        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 3000));
        else throw err;
      }
    }

    console.log(`\n🎉 Success! CSV byte length: ${csvBytes.length}`);
    const decodedCsv = iconv.decode(Buffer.from(csvBytes), 'euc-kr');
    console.log('\n--- CSV DATA PREVIEW ---');
    console.log(decodedCsv.slice(0, 1500));
    console.log('------------------------\n');

    console.log('Parsing CSV data...');
    
    // CSV 파싱을 위한 헬퍼 함수
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
    if (lines.length >= 2) {
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

      if (headerIndex !== -1) {
        const dateIdx = headers.indexOf('일자');
        const retailIdx = headers.indexOf('개인');
        const foreignerIdx = headers.indexOf('외국인');
        const institutionIdx = headers.indexOf('기관합계');

        if (dateIdx !== -1) {
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

            const retailVal = retailIdx !== -1 ? parseNum(row[retailIdx]) : 0;
            const foreignerVal = foreignerIdx !== -1 ? parseNum(row[foreignerIdx]) : 0;
            const institutionVal = institutionIdx !== -1 ? parseNum(row[institutionIdx]) : 0;

            historical.push({
              date: formattedDate,
              retail: retailVal,
              foreigner: foreignerVal,
              institution: institutionVal
            });
          }

          // 날짜 기준 오름차순 정렬
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
            historical: historical
          };

          // 저장 디렉토리 동적 확인
          let dbDir = path.join(process.cwd(), 'src', 'db', 'market_sentiment');
          if (!fs.existsSync(dbDir)) {
            dbDir = path.join(process.cwd(), '..', 'src', 'db', 'market_sentiment');
          }
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
          }

          const dbFilePath = path.join(dbDir, 'krx_put_option.json');
          fs.writeFileSync(dbFilePath, JSON.stringify(dbData, null, 2), 'utf-8');
          console.log(`✅ Data successfully saved to: ${dbFilePath}`);
        } else {
          console.error('CSV "일자" 컬럼을 찾을 수 없습니다.');
        }
      } else {
        console.error('CSV에서 헤더 줄을 찾을 수 없습니다.');
      }
    } else {
      console.error('CSV 데이터 행수가 충분하지 않습니다.');
    }


  } catch (error: any) {
    console.error('Automation Error:', error.message || error);
    if (page) {
      try {
        await page.screenshot({ path: 'scripts/krx_error_screenshot.png', fullPage: true });
        console.log('Error snapshot saved.');
      } catch (e) {}
    }
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

testKrxOptionWithConsent();


