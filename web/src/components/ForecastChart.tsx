import React from 'react';

interface ForecastChartProps {
  candles: Array<{ t: number; c: number }>;
  forecast: {
    point: number;
    lower: number;
    upper: number;
    targetTime?: string;
    madeAt?: string;
  };
  height?: number;
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  candles,
  forecast,
  height = 300,
}) => {
  if (!candles || candles.length === 0) {
    return (
      <div className="empty-state" style={{ height: `${height}px` }}>
        <div className="empty-state-reason">No historical context available for forecast visualization</div>
      </div>
    );
  }

  const svgWidth = 800;
  const chartHeight = height - 40;
  const paddingRight = 80;
  const effectiveWidth = svgWidth - paddingRight;

  const prices = candles.map((c) => c.c);
  let minPrice = Math.min(...prices, forecast.lower);
  let maxPrice = Math.max(...prices, forecast.upper);
  
  const margin = (maxPrice - minPrice) * 0.08 || 1;
  minPrice -= margin;
  maxPrice += margin;
  const priceRange = maxPrice - minPrice;

  const getY = (val: number) => {
    return chartHeight - ((val - minPrice) / priceRange) * chartHeight + 20;
  };

  const getX = (idx: number) => {
    return (idx / candles.length) * (effectiveWidth - 40) + 20;
  };

  const historyPoints = candles
    .map((c, i) => `${getX(i).toFixed(1)},${getY(c.c).toFixed(1)}`)
    .join(' ');

  const lastX = getX(candles.length - 1);
  const lastY = getY(candles[candles.length - 1].c);

  const forecastX = effectiveWidth + 20;
  const yPoint = getY(forecast.point);
  const yUpper = getY(forecast.upper);
  const yLower = getY(forecast.lower);

  const gridSteps = 4;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const price = minPrice + (priceRange * i) / gridSteps;
    const y = getY(price);
    return { price, y };
  });

  return (
    <div style={{ width: '100%', overflowX: 'auto', backgroundColor: '#0a0e14', borderRadius: '4px', border: '1px solid #1e2633', padding: '12px' }}>
      <svg viewBox={`0 0 ${svgWidth} ${height}`} style={{ width: '100%', height: `${height}px`, display: 'block' }}>
        {/* Grid lines */}
        {gridLines.map(({ price, y }, idx) => (
          <g key={idx}>
            <line x1="0" y1={y} x2={svgWidth - 60} y2={y} stroke="#1e2633" strokeDasharray="2,2" />
            <text x={svgWidth - 55} y={y + 4} fill="#8b95a5" fontSize="10" fontFamily="monospace">
              {price.toFixed(2)}
            </text>
          </g>
        ))}

        {/* History Polyline */}
        <polyline
          fill="none"
          stroke="#d7dde6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={historyPoints}
        />

        {/* Uncertainty Band Polygon */}
        <polygon
          points={`
            ${lastX},${lastY} 
            ${forecastX},${yUpper} 
            ${forecastX},${yLower}
          `}
          fill="rgba(79, 209, 197, 0.18)"
          stroke="rgba(79, 209, 197, 0.5)"
          strokeDasharray="3,3"
        />

        {/* Forecast Trajectory Line */}
        <line
          x1={lastX}
          y1={lastY}
          x2={forecastX}
          y2={yPoint}
          stroke="#4fd1c5"
          strokeWidth="2"
          strokeDasharray="4,4"
        />

        {/* Interval Whisker */}
        <line x1={forecastX} y1={yUpper} x2={forecastX} y2={yLower} stroke="#4fd1c5" strokeWidth="2" />
        <line x1={forecastX - 4} y1={yUpper} x2={forecastX + 4} y2={yUpper} stroke="#4fd1c5" strokeWidth="2" />
        <line x1={forecastX - 4} y1={yLower} x2={forecastX + 4} y2={yLower} stroke="#4fd1c5" strokeWidth="2" />

        {/* Forecast Point Target */}
        <circle cx={forecastX} cy={yPoint} r="5" fill="#4fd1c5" stroke="#0a0e14" strokeWidth="2" />

        {/* Forecast Value Label */}
        <text x={forecastX + 8} y={yPoint + 4} fill="#4fd1c5" fontSize="11" fontWeight="bold" fontFamily="monospace">
          {forecast.point.toFixed(2)}
        </text>
      </svg>
    </div>
  );
};
