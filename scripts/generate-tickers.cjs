const fs = require('fs');
const path = require('path');

const krMetaFile  = path.join(__dirname, '../src/db/metadata/all_kr_tickers.json');
const usMetaFile  = path.join(__dirname, '../src/db/metadata/all_us_tickers.json');
const krTickersDir = path.join(__dirname, '../src/db/kr/tickers');
const usTickersDir = path.join(__dirname, '../src/db/us/tickers');
const outputFile  = path.join(__dirname, '../src/library/all-tickers-data.ts');

/** metadata JSON에서 ticker 목록을 읽어 실제 파일이 존재하는 것만 반환 */
function getTickerFiles(metaFile, tickersDir, prefix) {
  if (!fs.existsSync(metaFile)) {
    console.warn(`[WARN] metadata not found: ${metaFile}`);
    return [];
  }
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  return meta.tickers
    .map((ticker) => ({
      ticker,
      file: (ticker.split('.')[0] ?? ticker) + '.json',
    }))
    .filter(({ file }) => fs.existsSync(path.join(tickersDir, file)));
}

const krEntries = getTickerFiles(krMetaFile, krTickersDir, 'kr');
const usEntries = getTickerFiles(usMetaFile, usTickersDir, 'us');

let content = '/**\n * Auto-generated file containing all ticker data.\n * Do not edit manually.\n */\n\n';
content += "import type { TickerData } from './tickers';\n\n";

// KR Tickers
krEntries.forEach(({ ticker, file }) => {
  const varName = `data_kr_${file.replace('.json', '').replace(/-/g, '_')}`;
  content += `import ${varName} from '../db/kr/tickers/${file}';\n`;
});

// US Tickers
usEntries.forEach(({ ticker, file }) => {
  const varName = `data_us_${file.replace('.json', '').replace(/-/g, '_')}`;
  content += `import ${varName} from '../db/us/tickers/${file}';\n`;
});

content += '\nexport const allTickersData: Record<string, TickerData> = {\n';

krEntries.forEach(({ ticker, file }) => {
  const varName = `data_kr_${file.replace('.json', '').replace(/-/g, '_')}`;
  content += `  '${ticker}': ${varName} as unknown as TickerData,\n`;
});

usEntries.forEach(({ ticker, file }) => {
  const varName = `data_us_${file.replace('.json', '').replace(/-/g, '_')}`;
  content += `  '${ticker}': ${varName} as unknown as TickerData,\n`;
});

content += '};\n';

fs.writeFileSync(outputFile, content);
console.log(`Successfully generated ${outputFile} with ${krEntries.length + usEntries.length} tickers. (KR: ${krEntries.length}, US: ${usEntries.length})`);
