'use client';

import { useState } from 'react';

interface ChartProps {
  type: 'line' | 'bar';
  data: Array<{ x: string; y: number }>;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  color?: string;
}

/**
 * Vanilla SVG chart — dependency'siz, server-side render uyumlu.
 */
export function AnalyticsCharts({
  type,
  data,
  xLabel,
  yLabel,
  height = 200,
  color = '#1f6feb',
}: ChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
        }}
      >
        Veri yok
      </div>
    );
  }

  const width = 800;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxY = Math.max(...data.map((d) => d.y), 1);
  const minY = 0;
  const xStep = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;

  // Y axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    return Math.round((maxY / yTicks) * i);
  });

  // X axis labels (her 5. noktada bir)
  const xLabelStep = Math.max(1, Math.floor(data.length / 8));

  // Path for line chart
  const linePath = data
    .map((d, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + chartHeight - (d.y / maxY) * chartHeight;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Area path (line altı dolgu)
  const areaPath = `${linePath} L ${padding.left + (data.length - 1) * xStep} ${
    padding.top + chartHeight
  } L ${padding.left} ${padding.top + chartHeight} Z`;

  return (
    <div style={{ width: '100%', overflow: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', maxWidth: 800 }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Y grid + labels */}
        {yTickValues.map((v, i) => {
          const y = padding.top + chartHeight - (v / maxY) * chartHeight;
          return (
            <g key={`y-${i}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f3f4f6"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                fontSize="11"
                fill="#6b7280"
                textAnchor="end"
              >
                {v.toLocaleString('tr-TR')}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {data.map((d, i) => {
          if (i % xLabelStep !== 0 && i !== data.length - 1) return null;
          const x = padding.left + i * xStep;
          return (
            <text
              key={`x-${i}`}
              x={x}
              y={height - 10}
              fontSize="10"
              fill="#6b7280"
              textAnchor="middle"
            >
              {d.x.slice(5)}
            </text>
          );
        })}

        {/* Bars or Line */}
        {type === 'line' ? (
          <>
            <path d={areaPath} fill={color} fillOpacity="0.1" />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Data points */}
            {data.map((d, i) => {
              const x = padding.left + i * xStep;
              const y = padding.top + chartHeight - (d.y / maxY) * chartHeight;
              return (
                <g key={`pt-${i}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={hoverIdx === i ? 6 : 3}
                    fill={color}
                    onMouseEnter={() => setHoverIdx(i)}
                    style={{ cursor: 'pointer' }}
                  />
                  {hoverIdx === i && (
                    <g>
                      <rect
                        x={x - 60}
                        y={y - 36}
                        width="120"
                        height="28"
                        fill="#111827"
                        rx="4"
                      />
                      <text
                        x={x}
                        y={y - 18}
                        fontSize="11"
                        fill="#fff"
                        textAnchor="middle"
                      >
                        {d.y.toLocaleString('tr-TR')}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </>
        ) : (
          data.map((d, i) => {
            const x = padding.left + i * xStep - xStep / 3;
            const y = padding.top + chartHeight - (d.y / maxY) * chartHeight;
            const h = (d.y / maxY) * chartHeight;
            return (
              <rect
                key={`bar-${i}`}
                x={x}
                y={y}
                width={xStep * 0.6}
                height={h}
                fill={color}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: 'pointer' }}
              />
            );
          })
        )}

        {/* Axis labels */}
        {xLabel && (
          <text
            x={width / 2}
            y={height - 1}
            fontSize="11"
            fill="#6b7280"
            textAnchor="middle"
          >
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            x={14}
            y={height / 2}
            fontSize="11"
            fill="#6b7280"
            textAnchor="middle"
            transform={`rotate(-90, 14, ${height / 2})`}
          >
            {yLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
