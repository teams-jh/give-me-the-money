'use client';

import { useState, useMemo, useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { DashboardContent } from 'src/layouts/dashboard';

// Chart Libraries
import { createChart, ColorType, CandlestickSeries as LW_CandlestickSeries, LineSeries as LW_LineSeries } from 'lightweight-charts';
import { ChartCanvas, Chart, CandlestickSeries, XAxis, YAxis, discontinuousTimeScaleProviderBuilder, LineSeries, MovingAverageTooltip } from 'react-financial-charts';
import ReactECharts from 'echarts-for-react';
import ChartApex from 'react-apexcharts';

// Data
import stockData from 'src/db/test/stock_data.json';

// ----------------------------------------------------------------------

const TABS = [
  { value: 'lightweight', label: 'Lightweight Charts' },
  { value: 'financial', label: 'Financial Charts' },
  { value: 'echarts', label: 'ECharts' },
  { value: 'apex', label: 'ApexCharts' },
];

export function ChartAnalysisView() {
  const theme = useTheme();
  const [currentTab, setCurrentTab] = useState('lightweight');

  const nvdaData = useMemo(() => {
    const stock = stockData.stocks.find((s) => s.ticker === 'NVDA');
    if (!stock) return [];

    const period = stock.periods['1y'];
    return period.chart_labels.map((label, index) => ({
      date: label,
      value: period.chart_data[index],
      regression: period.regression?.[index],
      // Simulate OHLC for candlestick charts
      open: period.chart_data[index] * (0.98 + Math.random() * 0.04),
      high: period.chart_data[index] * (1.02 + Math.random() * 0.02),
      low: period.chart_data[index] * (0.96 + Math.random() * 0.02),
      close: period.chart_data[index],
    }));
  }, []);

  const handleChangeTab = (event: React.SyntheticEvent, newValue: string) => {
    setCurrentTab(newValue);
  };

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={4}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            차트 라이브러리 분석 도구 📊
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            회귀선(Regression)과 기술적 지표를 통해 종목의 추세를 분석합니다.
          </Typography>
        </Box>

        <Card>
          <Tabs
            value={currentTab}
            onChange={handleChangeTab}
            sx={{
              px: 2.5,
              boxShadow: (theme) => `inset 0 -2px 0 0 ${alpha(theme.palette.grey[500], 0.08)}`,
            }}
          >
            {TABS.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={tab.label} />
            ))}
          </Tabs>

          <Box sx={{ p: 3, minHeight: 500 }}>
            {currentTab === 'lightweight' && <LightweightChartTest data={nvdaData} />}
            {currentTab === 'financial' && <FinancialChartTest data={nvdaData} />}
            {currentTab === 'echarts' && <EChartsTest data={nvdaData} />}
            {currentTab === 'apex' && <ApexChartTest data={nvdaData} />}
          </Box>
        </Card>
      </Stack>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function LightweightChartTest({ data }: { data: any[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 450,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#637381',
      },
      grid: {
        vertLines: { color: 'rgba(145, 158, 171, 0.05)' },
        horzLines: { color: 'rgba(145, 158, 171, 0.05)' },
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries = chart.addSeries(LW_CandlestickSeries, {
      upColor: '#00B8D9',
      downColor: '#FF5630',
      borderVisible: false,
      wickUpColor: '#00B8D9',
      wickDownColor: '#FF5630',
    });

    candleSeries.setData(
      data.map((item) => ({
        time: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }))
    );

    const regressionSeries = chart.addSeries(LW_LineSeries, {
      color: '#FFAB00',
      lineWidth: 2,
      lineStyle: 2,
      title: 'Regression',
    });

    regressionSeries.setData(
      data.filter(d => d.regression !== undefined).map((item) => ({
        time: item.date,
        value: item.regression,
      }))
    );

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

  return <Box ref={chartContainerRef} sx={{ width: '100%', height: 450 }} />;
}

// ----------------------------------------------------------------------

function FinancialChartTest({ data: initialData }: { data: any[] }) {
  const { data, xScale, xAccessor, displayXAccessor } = useMemo(() => {
    const chartData = initialData.map((d) => ({
      ...d,
      date: new Date(d.date),
    }));

    const xScaleProvider = discontinuousTimeScaleProviderBuilder().inputDateAccessor(
      (d: any) => d.date
    );

    return xScaleProvider(chartData);
  }, [initialData]);

  if (typeof window === 'undefined') return null;

  return (
    <Box sx={{ width: '100%', height: 450, overflow: 'hidden' }}>
      <Typography variant="caption" sx={{ color: 'text.disabled', mb: 1, display: 'block' }}>
        React Financial Charts: Regression Line & Tooltip
      </Typography>
      <ChartCanvas
        height={450}
        width={800}
        ratio={1}
        margin={{ left: 50, right: 50, top: 10, bottom: 30 }}
        seriesName="NVDA"
        data={data}
        xAccessor={xAccessor}
        xScale={xScale}
        displayXAccessor={displayXAccessor}
      >
        <Chart id={1} yExtents={(d) => [d.high, d.low, d.regression]}>
          <XAxis showGridLines gridLinesStrokeStyle="rgba(145, 158, 171, 0.1)" />
          <YAxis showGridLines gridLinesStrokeStyle="rgba(145, 158, 171, 0.1)" />
          
          <CandlestickSeries 
            fill={(d) => d.close > d.open ? '#00B8D9' : '#FF5630'}
            wickStroke={(d) => d.close > d.open ? '#00B8D9' : '#FF5630'}
          />

          <LineSeries yAccessor={(d) => d.regression} strokeStyle="#FFAB00" strokeDasharray="Dash" />
          
          <MovingAverageTooltip
            origin={[-40, 0]}
            options={[
              {
                yAccessor: (d) => d.regression,
                type: "Regression",
                stroke: "#FFAB00",
                windowSize: 0,
              },
            ]}
          />
        </Chart>
      </ChartCanvas>
    </Box>
  );
}

// ----------------------------------------------------------------------

function EChartsTest({ data }: { data: any[] }) {
  const theme = useTheme();

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      data: ['Price', 'Regression'],
      bottom: 0,
      textStyle: { color: theme.palette.text.secondary },
    },
    grid: {
      left: '5%',
      right: '5%',
      bottom: '15%',
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      scale: true,
      boundaryGap: false,
      axisLine: { onZero: false },
      splitLine: { show: false },
      axisLabel: { color: theme.palette.text.secondary },
    },
    yAxis: {
      scale: true,
      splitArea: { show: true },
      axisLabel: { color: theme.palette.text.secondary },
    },
    dataZoom: [
      { type: 'inside', start: 50, end: 100 },
      { type: 'slider', show: true, bottom: '5%', start: 50, end: 100 },
    ],
    series: [
      {
        name: 'Price',
        type: 'candlestick',
        data: data.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: {
          color: theme.palette.success.main,
          color0: theme.palette.error.main,
          borderColor: theme.palette.success.main,
          borderColor0: theme.palette.error.main,
        },
      },
      {
        name: 'Regression',
        type: 'line',
        data: data.map((d) => d.regression),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#FFAB00', width: 2, type: 'dashed' },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 450, width: '100%' }} />;
}

// ----------------------------------------------------------------------

function ApexChartTest({ data }: { data: any[] }) {
  const theme = useTheme();

  const options: any = {
    chart: {
      type: 'candlestick',
      height: 450,
      toolbar: { show: true },
      background: 'transparent',
    },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: theme.palette.text.secondary } },
    },
    yaxis: {
      tooltip: { enabled: true },
      labels: { style: { colors: theme.palette.text.secondary } },
    },
    theme: {
      mode: theme.palette.mode,
    },
    stroke: {
      width: [1, 2],
      dashArray: [0, 5],
    },
    legend: {
      show: true,
      position: 'top',
      labels: { colors: theme.palette.text.secondary },
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: theme.palette.success.main,
          downward: theme.palette.error.main,
        },
      },
    },
  };

  const series = [
    {
      name: 'Price',
      type: 'candlestick',
      data: data.map((d) => ({
        x: new Date(d.date),
        y: [d.open, d.high, d.low, d.close],
      })),
    },
    {
      name: 'Regression',
      type: 'line',
      data: data.map((d) => ({
        x: new Date(d.date),
        y: d.regression,
      })),
    },
  ];

  return <ChartApex options={options} series={series} type="candlestick" height={450} />;
}
