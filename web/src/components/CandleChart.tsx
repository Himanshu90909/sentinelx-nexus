import React from 'react';
import { Candle } from '../api';

interface CandleChartProps {
  candles: Candle[];
  height?: number;
  forecastOverlay?: {
    point: number;
    lower: number;
    upper: number;
    targetTime?: string;
  };
}

export const CandleChart: React.FC<CandleChartProps> = ({
  candles,
  height = 360,
  forecastOverlay,
}) => {
  if (!candles || candles.length === 0) {
    return (
      <div className="empty-state" style={{ height: `${height}px` }}>
        <div className="empty-state-reason">No candle data available for chart rendering</div>
      </div>
    );
  }

  const svgWidth = 800;
  const priceChartHeight = height * 0.75;
  const volumeChartHeight = height * 0.2;
  const gap = height * 0.05;

  let minPrice = Math.min(...candles.map((c) => c.l));
  let maxPrice = Math.max(...candles.map((c) => c.h));
  let maxVol = Math.max(...candles.map((c) => c.v || 1));

  if (forecastOverlay) {
    minPrice = Math.min(minPrice, forecastOverlay.lower);
    maxPrice = Math.max(maxPrice, forecastOverlay.upper);
  }

  const priceMargin = (maxPrice - minPrice) * 0.05 || 1;
  minPrice -= priceMargin;
  maxPrice += priceMargin;

  const priceRange = maxPrice - minPrice;

  const candleWidth = Math.max(2, Math.floor((svgWidth - 60) / candles.length) - 2);

  const getY = (val: number) => {
    return priceChartHeight - ((val - minPrice) / priceRange) * priceChartHeight;
  };

  const getVolY = (vol: number) => {
    const vH = (vol / maxVol) * volumeChartHeight;
    return height - vH;
  };

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

        {/* Candlesticks & Volume */}
        {candles.map((c, i) => {
          const x = (i / candles.length) * (svgWidth - 60) + candleWidth / 2;
          const isUp = c.c >= c.o;
          const color = isUp ? '#48bb78' : '#e05252';
          
          const yOpen = getY(c.o);
          const yClose = getY(c.c);
          const yHigh = getY(c.h);
          const yLow = getY(c.l);

          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));

          const volY = getVolY(c.v);

          return (
            <g key={c.t || i}>
              {/* Wick */}
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1" />
              {/* Candle Body */}
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                opacity={0.9}
              />
              {/* Volume Bar */}
              <rect
                x={x - candleWidth / 2}
                y={volY}
                width={candleWidth}
                height={height - volY}
                fill={color}
                opacity={0.3}
              />
            </g>
          );
        })}

        {/* Forecast Overlay */}
        {forecastOverlay && (
          <g>
            {/* Target Forecast Bar / Band on right */}
            {(() => {
              const fxX = svgWidth - 40;
              const yPoint = getY(forecastOverlay.point);
              const yUpper = getY(forecastOverlay.upper);
              const yLower = getY(forecastOverlay.lower);

              return (
                <g>
                  {/* Band polygon connecting last candle to forecast range */}
                  <polygon
                    points={`
                      ${svgWidth - 60},${getY(candles[candles.length - 1].c)} 
                      ${fxX},${yUpper} 
                      ${fxX},${yLower}
                    `}
                    fill="rgba(79, 209, 197, 0.15)"
                    stroke="rgba(79, 209, 197, 0.4)"
                    strokeDasharray="3,3"
                  />
                  {/* Upper to lower interval whisker */}
                  <line x1={fxX} y1={yUpper} x2={fxX} y2={yLower} stroke="#4fd1c5" strokeWidth="2" />
                  {/* Point target dot */}
                  <circle cx={fxX} cy={yPoint} r="4" fill="#4fd1c5" />
                  <line x1={svgWidth - 60} y1={yPoint} x2={fxX} y2={yPoint} stroke="#4fd1c5" strokeDasharray="2,2" />
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
};
