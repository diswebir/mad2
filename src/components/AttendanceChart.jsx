import React, { useId, useState } from 'react';
import { dateFa, fa } from '../lib/api';
function curve(points) {
  return points.reduce((path, p, i) => {
    if (!i) return `M${p[0]},${p[1]}`;
    const previous = points[i - 1],
      x = (p[0] + previous[0]) / 2;
    return `${path} C${x},${previous[1]} ${x},${p[1]} ${p[0]},${p[1]}`;
  }, '');
}
export default function AttendanceChart({ data = [], compact = false }) {
  const [hover, setHover] = useState(null),
    id = useId().replace(/:/g, '');
  const w = 620,
    h = compact ? 175 : 196,
    top = 16,
    bottom = h - 32,
    left = 47,
    right = 605,
    plotWidth = right - left;
  if (!data.length)
    return <div className="chart-empty">برای این بازه حضور و غیابی ثبت نشده است.</div>;
  const point = (value, index) => [
    left + (index * plotWidth) / Math.max(1, data.length - 1),
    bottom - (value / 100) * (bottom - top),
  ];
  const present = data.map((d, i) => point(d.rate, i));
  const absent = data.map((d, i) => point(d.total ? (d.absent / d.total) * 100 : 0, i));
  const selected = hover === null ? data.length - 1 : hover;
  return (
    <div className="attendance-chart">
      <div className="chart-legend">
        <span>
          <i className="legend-purple" />
          حاضر و تأخیر
        </span>
        <span>
          <i className="legend-orange" />
          غایب
        </span>
        <small>درصد حضور دانش‌آموزان</small>
      </div>
      <div className="chart-canvas" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label="نمودار درصد حضور و غیبت روزانه"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * w;
            setHover(
              Math.max(
                0,
                Math.min(data.length - 1, Math.round(((x - left) / plotWidth) * (data.length - 1))),
              ),
            );
          }}
        >
          <defs>
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#a797ee" stopOpacity="0.27" />
              <stop offset="1" stopColor="#b9abf0" stopOpacity="0.025" />
            </linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = point(tick, 0)[1];
            return (
              <g key={tick}>
                <line x1={left} x2={right} y1={y} y2={y} stroke="#ebeaf2" strokeDasharray="4 5" />
                <text x={left - 15} y={y + 4} textAnchor="end" className="chart-label">
                  {fa(tick)}٪
                </text>
              </g>
            );
          })}
          <path
            d={`${curve(present)} L${right},${bottom} L${left},${bottom} Z`}
            fill={`url(#fill-${id})`}
          />
          <path
            d={curve(present)}
            stroke="#8971e7"
            fill="none"
            strokeWidth="2.7"
            strokeLinecap="round"
          />
          <path
            d={curve(absent)}
            stroke="#efb07c"
            fill="none"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {data.map((d, i) => (
            <text
              key={d.date}
              x={point(0, i)[0]}
              y={h - 9}
              textAnchor="middle"
              className="chart-label"
            >
              {dateFa(d.date, { weekday: 'long' })}
            </text>
          ))}
          {hover !== null && (
            <line
              x1={present[selected][0]}
              x2={present[selected][0]}
              y1={top}
              y2={bottom}
              stroke="#b9abed"
              strokeDasharray="3 5"
            />
          )}
          <circle
            cx={present[selected][0]}
            cy={present[selected][1]}
            r="5"
            fill="#8971e7"
            stroke="white"
            strokeWidth="3"
          />
          {hover !== null && (
            <g
              transform={`translate(${Math.min(right - 74, Math.max(left + 74, present[selected][0]))},${Math.max(32, present[selected][1] - 22)})`}
            >
              <rect x="-72" y="-22" width="144" height="31" rx="7" fill="#4b3d7b" />
              <text x="0" y="-3" textAnchor="middle" className="chart-tooltip">
                {dateFa(data[selected].date, { day: 'numeric', month: 'short' })} ·{' '}
                {fa(data[selected].rate)}٪ حاضر
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
