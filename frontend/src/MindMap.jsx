import { useRef, useState } from "react";
const COLORS = ["#5b4bdb", "#0f9d8a", "#e07a1f", "#d6336c", "#2f80ed", "#7a9e1f"];
const W = 900, H = 600, cx = W / 2, cy = H / 2;

function Node({ x, y, t, color, bold, onClick }) {
  const w = Math.max(60, t.length * 7 + 18);
  return (
    <g onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <rect x={x - w / 2} y={y - 13} width={w} height={26} rx={13}
        fill={bold ? color : "var(--card)"} stroke={color} strokeWidth={1.5} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={bold ? 13 : 12}
        fontWeight={bold ? 700 : 400} fill={bold ? "#fff" : "var(--tx)"}>{t}</text>
    </g>
  );
}

export default function MindMap({ map }) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [closed, setClosed] = useState({});
  const drag = useRef(null);
  const n = map.branches.length || 1;

  const onWheel = (e) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.5, v.k - e.deltaY * 0.001)) }));
  const onDown = (e) => (drag.current = { x: e.clientX - view.x, y: e.clientY - view.y });
  const onMove = (e) => drag.current && setView((v) => ({ ...v, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }));

  return (
    <div>
      <p className="hint">Molette : zoom · Glisser : déplacer · Clic sur une branche : replier/déplier</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onWheel={onWheel} onMouseDown={onDown}
        onMouseMove={onMove} onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)}
        style={{ cursor: "grab", touchAction: "none" }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {map.branches.map((b, i) => {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2, col = COLORS[i % 6];
            const bx = cx + Math.cos(a) * 165, by = cy + Math.sin(a) * 140;
            const kids = closed[i] ? [] : b.children || [];
            return (
              <g key={i}>
                <line x1={cx} y1={cy} x2={bx} y2={by} stroke={col} strokeWidth={3} strokeLinecap="round" />
                {kids.map((c, j) => {
                  const aa = a + (kids.length > 1 ? (j / (kids.length - 1) - 0.5) * 1.24 : 0);
                  const kx = Math.min(W - 50, Math.max(50, cx + Math.cos(aa) * 330));
                  const ky = Math.min(H - 18, Math.max(18, cy + Math.sin(aa) * 255));
                  return (
                    <g key={j}>
                      <line x1={bx} y1={by} x2={kx} y2={ky} stroke={col} strokeWidth={1.5} opacity={0.6} />
                      <Node x={kx} y={ky} t={c} color={col} />
                    </g>
                  );
                })}
                <Node x={bx} y={by} t={b.name + (closed[i] ? " +" : "")} color={col} bold
                  onClick={() => setClosed((s) => ({ ...s, [i]: !s[i] }))} />
              </g>
            );
          })}
          <Node x={cx} y={cy} t={map.center} color="var(--tx)" bold />
        </g>
      </svg>
    </div>
  );
}
