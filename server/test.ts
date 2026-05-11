import YahooFinance from 'yahoo-finance2';

// Suppress notices for a cleaner output
const yahooFinance = new YahooFinance({ 
  suppressNotices: ['yahooSurvey', 'ripHistorical'] 
});

async function test() {
  try {
    const symbol = 'AAPL';
    const yf = yahooFinance as any;
    
    console.log(`--- Fetching Quote for ${symbol} ---`);
    const quote = await yf.quote(symbol);
    console.log(`Current price:`, quote.regularMarketPrice);
    
    console.log(`\n--- Fetching Historical Data (via chart) ---`);
    // historical() is deprecated, use chart() instead
    const queryOptions = { period1: '2023-01-01', period2: '2023-01-10', interval: '1d' };
    const chartResult = await yf.chart(symbol, queryOptions);
    
    if (chartResult && chartResult.quotes) {
      console.log(`Count:`, chartResult.quotes.length);
      console.table(chartResult.quotes.slice(0, 5));
    } else {
      console.log('No historical data found.');
    }
    
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('An unknown error occurred:', error);
    }
  }
}

test();
