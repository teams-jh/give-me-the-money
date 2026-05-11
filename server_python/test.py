import yfinance as yf
import json
import os
from datetime import datetime

def get_stock_data(ticker_symbol):
    """
    Fetch basic stock information and recent history using yfinance.
    """
    try:
        # Create a Ticker object
        ticker = yf.Ticker(ticker_symbol)

        # Get basic info
        info = ticker.info
        
        # Get history (last 5 days)
        history = ticker.history(period="5d")
        
        print(f"--- Data for {ticker_symbol} ---")
        print(f"Company Name: {info.get('longName', 'N/A')}")
        print(f"Current Price: {info.get('currentPrice', 'N/A')} {info.get('currency', 'USD')}")
        print(f"Market Cap: {info.get('marketCap', 'N/A')}")
        
        print("\nRecent History (Last 5 days):")
        print(history[['Open', 'High', 'Low', 'Close', 'Volume']])
        
        return {
            "symbol": ticker_symbol,
            "name": info.get('longName'),
            "price": info.get('currentPrice'),
            "currency": info.get('currency'),
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        print(f"Error fetching data for {ticker_symbol}: {e}")
        return None

if __name__ == "__main__":
    # Example: Fetch Apple (AAPL) data
    ticker = "AAPL"
    data = get_stock_data(ticker)
    
    if data:
        # Determine the directory of the current script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, f"{ticker}_data.json")
        
        # Save to a JSON file for Next.js to consume
        with open(output_path, "w") as f:
            json.dump(data, f, indent=4)
        print(f"\nData saved to {output_path}")
