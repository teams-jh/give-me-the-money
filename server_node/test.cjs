const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({ 
  suppressNotices: ['yahooSurvey', 'ripHistorical'] 
});

async function test() {
  try {
    const symbol = 'TSLA'; // 테슬라로 변경해봄
    
    console.log(`--- [Node.js] Fetching Quote for ${symbol} ---`);
    const quote = await yahooFinance.quote(symbol);
    console.log(`Current price:`, quote.regularMarketPrice);
    
    console.log(`\n--- [Node.js] Fetching Historical Data (via chart) ---`);
    const queryOptions = { period1: '2023-01-01', period2: '2023-01-10', interval: '1d' };
    const chartResult = await yahooFinance.chart(symbol, queryOptions);
    
    if (chartResult && chartResult.quotes) {
      console.log(`Count:`, chartResult.quotes.length);
      console.table(chartResult.quotes.slice(0, 5));
    } else {
      console.log('No historical data found.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
