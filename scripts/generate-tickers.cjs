const fs = require('fs');
const path = require('path');

const krTickersDir = path.join(__dirname, '../src/db/kr/tickers');
const usTickersDir = path.join(__dirname, '../src/db/us/tickers');
const outputFile = path.join(__dirname, '../src/library/all-tickers-data.ts');

const krFiles = fs.existsSync(krTickersDir) ? fs.readdirSync(krTickersDir).filter(f => f.endsWith('.json')) : [];
const usFiles = fs.existsSync(usTickersDir) ? fs.readdirSync(usTickersDir).filter(f => f.endsWith('.json')) : [];

let content = '/**\n * Auto-generated file containing all ticker data.\n * Do not edit manually.\n */\n\n';
content += "import { TickerData } from './tickers';\n\n";

// KR Tickers
krFiles.forEach((file) => {
  const tickerFromFileName = file.replace('.json', '');
  const varName = `data_kr_${tickerFromFileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  content += `import ${varName} from '../db/kr/tickers/${file}';\n`;
});

// US Tickers
usFiles.forEach((file) => {
  const tickerFromFileName = file.replace('.json', '');
  const varName = `data_us_${tickerFromFileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  content += `import ${varName} from '../db/us/tickers/${file}';\n`;
});

content += '\nexport const allTickersData: Record<string, TickerData> = {\n';

krFiles.forEach((file) => {
  const filePath = path.join(krTickersDir, file);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const ticker = json.ticker;
  const tickerFromFileName = file.replace('.json', '');
  const varName = `data_kr_${tickerFromFileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  content += `  '${ticker}': ${varName} as unknown as TickerData,\n`;
});

usFiles.forEach((file) => {
  const filePath = path.join(usTickersDir, file);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const ticker = json.ticker;
  const tickerFromFileName = file.replace('.json', '');
  const varName = `data_us_${tickerFromFileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  content += `  '${ticker}': ${varName} as unknown as TickerData,\n`;
});

content += '};\n';

fs.writeFileSync(outputFile, content);
console.log(`Successfully generated ${outputFile} with ${krFiles.length + usFiles.length} tickers.`);
