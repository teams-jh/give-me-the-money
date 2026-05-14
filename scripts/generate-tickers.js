const fs = require('fs');
const path = require('path');

const tickersDir = path.join(__dirname, '../src/db/tickers');
const outputFile = path.join(__dirname, '../src/library/all-tickers-data.ts');

const files = fs.readdirSync(tickersDir).filter(f => f.endsWith('.json'));

let content = '/**\n * Auto-generated file containing all ticker data.\n * Do not edit manually.\n */\n\n';
content += "import { TickerData } from './tickers';\n\n";

// 임포트 섹션 생성
files.forEach((file, index) => {
  const ticker = file.replace('.json', '');
  // 특수 문자가 포함된 티커(예: BRK.B)를 위해 유효한 변수명으로 변환
  const varName = `data_${ticker.replace(/[^a-zA-Z0-0]/g, '_')}`;
  content += `import ${varName} from '../db/tickers/${file}';\n`;
});

content += '\nexport const allTickersData: Record<string, TickerData> = {\n';
files.forEach((file) => {
  const ticker = file.replace('.json', '');
  const varName = `data_${ticker.replace(/[^a-zA-Z0-0]/g, '_')}`;
  content += `  '${ticker}': ${varName} as unknown as TickerData,\n`;
});
content += '};\n';

fs.writeFileSync(outputFile, content);
console.log(`Successfully generated ${outputFile} with ${files.length} tickers.`);
