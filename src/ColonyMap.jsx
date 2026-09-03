import React, { useEffect, useRef, useState } from 'react';
import { Plus, Minus, LocateFixed, Layers3, MousePointer2, Move, X, Sprout, Droplets, Zap, House, Radio } from 'lucide-react';

const hash = (x, y, seed = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); };
const buildings = [
  { x: 13, y: 12, type: 'command', name: 'Colonial administration', sector: 'Central district' },
  ...[[10, 10], [12, 9], [15, 9], [17, 10], [10, 13], [17, 13], [11, 16], [14, 16], [17, 16], [19, 13], [19, 16], [16, 19], [13, 19], [10, 19]].map(([x, y], i) => ({ x, y, type: 'habitat', name: `Habitat ${String(i + 1).padStart(2, '0')}`, sector: 'New Alexandria' })),
  ...[[6, 13], [6, 16], [6, 19], [8, 22], [11, 22], [14, 22]].map(([x, y], i) => ({ x, y, type: 'farm', name: `Agricultural cluster ${i + 1}`, sector: 'Southern agricultural belt' })),
  ...[[20, 9], [23, 10], [23, 13]].map(([x, y], i) => ({ x, y, type: 'reactor', name: `Fusion plant ${i + 1}`, sector: 'Eastern power district' })),
  { x: 20, y: 20, type: 'reservoir', name: 'Alexandria reservoir', sector: 'Water & life support' },
  { x: 23, y: 17, type: 'industry', name: 'Iridium refinery', sector: 'Industrial district' },
  { x: 17, y: 6, type: 'solar', name: 'Solar array 01', sector: 'Northern microgrid' },
  { x: 20, y: 6, type: 'solar', name: 'Solar array 02', sector: 'Northern microgrid' },
  { x: 12, y: 5, type: 'comms', name: 'Deep-space relay', sector: 'Earth uplink station' },
];

export default function ColonyMap({ observed, layer, onLayer, onBuild }) {
  const canvas = useRef(null);
  const view = useRef({ zoom: 1, dx: 0, dy: 0, width: 0, height: 0 });
  const drag = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const [buildMenu, setBuildMenu] = useState(false);
  const [labels, setLabels] = useState(true);
  const extraFarms = Math.min(6, Math.max(0, observed.farms - 6));

  useEffect(() => {
    const el = canvas.current;
    const ctx = el.getContext('2d');
    let frame;
    const render = time => {
      const bounds = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (el.width !== Math.round(bounds.width * dpr) || el.height !== Math.round(bounds.height * dpr)) { el.width = bounds.width * dpr; el.height = bounds.height * dpr; }
      const w = bounds.width, h = bounds.height;
      view.current = { zoom, dx: offset.x, dy: offset.y, width: w, height: h };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createRadialGradient(w * .51, h * .48, 10, w * .5, h * .5, w * .7);
      bg.addColorStop(0, '#27332c'); bg.addColorStop(.6, '#1d2822'); bg.addColorStop(1, '#18221e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#56634f25';
      for (let x = 12; x < w; x += 24) for (let y = 12; y < h; y += 24) ctx.fillRect(x, y, 1, 1);
      const scale = Math.min(w / 970, h / 570) * zoom;
      const ox = w * .5 + offset.x, oy = h * .04 + offset.y;
      const project = (x, y, z = 0) => [ox + (x - y) * 17 * scale, oy + (x + y) * 8.2 * scale - z * scale];
      const poly = (points, fill, stroke) => { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .55 * scale; ctx.stroke(); } };
      const line = (a, b, color, width = 1) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.strokeStyle = color; ctx.lineWidth = width * scale; ctx.stroke(); };
      const box = (x, y, sx, sy, height, top, left, right, base = 0) => {
        const a = project(x, y, base), b = project(x + sx, y, base), c = project(x + sx, y + sy, base), d = project(x, y + sy, base);
        const at = project(x, y, height + base), bt = project(x + sx, y, height + base), ct = project(x + sx, y + sy, height + base), dt = project(x, y + sy, height + base);
        poly([d, c, ct, dt], left); poly([b, c, ct, bt], right); poly([at, bt, ct, dt], top);
      };
      const terrain = (x, y) => {
        const edge = Math.pow((x - 15) / 17, 2) + Math.pow((y - 15) / 16, 2);
        return edge < .98 + .09 * Math.sin(x * 1.1) && x > 0 && y > 0 && x < 31 && y < 30;
      };
      // Contour lines around the surveyed landmass.
      for (let r = 0; r < 4; r++) {
        ctx.beginPath();
        for (let t = 0; t <= 160; t++) {
          const angle = t / 160 * Math.PI * 2;
          const radius = 16.5 + r * 1.45 + Math.sin(angle * 7) * .4;
          const p = project(15 + Math.cos(angle) * radius, 15 + Math.sin(angle) * radius);
          t ? ctx.lineTo(...p) : ctx.moveTo(...p);
        }
        ctx.strokeStyle = `rgba(114, 130, 98, ${.14 - r * .024})`; ctx.lineWidth = .6; ctx.stroke();
      }
      const allBuildings = [...buildings, ...Array.from({ length: extraFarms }, (_, i) => ({ x: 4 + (i % 3) * 3, y: 24 + Math.floor(i / 3) * 2, type: 'farm', name: 'Daneel-built hydroponics' }))];
      const occupied = (x, y) => allBuildings.some(b => Math.abs(b.x - x) < 2 && Math.abs(b.y - y) < 2);
      for (let sum = 0; sum < 63; sum++) for (let x = 0; x < 32; x++) {
        const y = sum - x;
        if (!terrain(x, y)) continue;
        const noise = hash(x, y);
        const water = x > 23 && y > 19 || x > 25 && y > 15 || x > 21 && y > 24;
        const high = y < 8 && x < 10 || y < 5 && x < 18;
        const z = water ? -2 : high ? 8 + Math.floor(noise * 3) * 4 : 3;
        const palette = water ? ['#33504a', '#395851', '#304c46', '#3b5850'] : high ? ['#777861', '#777761', '#82816a', '#6d725b'] : ['#566044', '#5b6448', '#61684a', '#606649', '#646c4d', '#525f43'];
        box(x, y, 1, 1, z + 13, palette[Math.floor(noise * palette.length)], '#3d4734', '#303d2f', -13);
        if (water && noise > .65) line(project(x + .1, y + .5, 0), project(x + .7, y + .5, 0), '#6f96805a', .6);
        if (!water && !high && !occupied(x, y) && (noise > .65 || x < 5 || y > 25)) {
          const [tx, ty] = project(x + .5, y + .5, z);
          const size = (4 + hash(y, x) * 8) * scale;
          ctx.fillStyle = '#273e2d55'; ctx.beginPath(); ctx.ellipse(tx + size * .3, ty + 2, size * .9, size * .36, 0, 0, Math.PI * 2); ctx.fill();
          line([tx, ty], [tx, ty - size], '#5e6246', 1.3);
          poly([[tx, ty - size * 2.2], [tx - size * .65, ty - size * .4], [tx + size * .65, ty - size * .4]], ['#354b35', '#40573a', '#4b603d'][Math.floor(noise * 3)]);
          poly([[tx, ty - size * 2.2], [tx, ty - size * .4], [tx + size * .65, ty - size * .4]], '#293f30');
        }
        if (high && noise > .7) box(x + .1, y + .1, .75, .65, 7 + noise * 12, '#92907b', '#666d59', '#4d5846', z);
      }
      // Raised road network and narrow, illuminated service conduits.
      for (const y of [8, 12, 15, 18, 21]) {
        poly([project(7, y, 4), project(25, y, 4), project(25, y + .34, 4), project(7, y + .34, 4)], '#93917a');
        line(project(7, y + .16, 4.2), project(25, y + .16, 4.2), '#c1bda25a', .6);
      }
      for (const x of [9, 12, 16, 19, 22]) {
        poly([project(x, 7, 4), project(x + .3, 7, 4), project(x + .3, 24, 4), project(x, 24, 4)], '#96957f');
        line(project(x + .15, 7, 4.2), project(x + .15, 24, 4.2), '#c1bda270', .6);
      }
      allBuildings.sort((a, b) => a.x + a.y - b.x - b.y).forEach(b => {
        const { x, y, type } = b;
        const tint = layer === 'Power' ? '#bed4a2' : layer === 'Water' ? '#90bbc3' : '#c6c4a5';
        // Cast shadows and modular foundations.
        poly([project(x, y + 1.8, 4), project(x + 3, y + 1.8, 4), project(x + 3.8, y + 3, 4), project(x + .5, y + 3, 4)], '#1b2c2650');
        box(x - .2, y - .2, 2.2, 2.1, 2, '#899077', '#5e6855', '#4c5c4e', 4);
        if (type === 'habitat' || type === 'command') {
          const tall = type === 'command' ? 24 : 11 + hash(x, y) * 10;
          box(x, y, 1.8, 1.5, tall, tint, '#a1a38e', '#727f70', 6);
          box(x + .15, y + .15, 1.5, 1.2, 2, '#dfd9bc', '#b6b39c', '#8e9883', tall + 6);
          box(x + .35, y + .25, .45, .5, 3, '#7b8778', '#67776b', '#475f53', tall + 8);
          for (let i = 0; i < 4; i++) {
            line(project(x + .2 + i * .4, y + 1.51, tall - 2), project(x + .2 + i * .4, y + 1.51, tall - 6), '#d1d8b6', 2);
            line(project(x + 1.81, y + .15 + i * .3, tall - 2), project(x + 1.81, y + .15 + i * .3, tall - 6), '#41605a', 2);
          }
          if (type === 'command') { box(x + .8, y + .3, .6, .6, 17, '#d9d3b4', '#b0b19a', '#81907a', tall + 8); line(project(x + 1.1, y + .6, tall + 24), project(x + 1.1, y + .6, tall + 37), '#d9d3b4', 1); }
        } else if (type === 'farm') {
          for (let i = 0; i < 3; i++) {
            box(x + i * .65, y, .5, 1.75, 7, '#a5bba1', '#819779', '#547c6b', 6);
            for (let j = 0; j < 4; j++) line(project(x + i * .65, y + j * .42, 13), project(x + i * .65 + .5, y + j * .42, 13), '#e0dabe90', .8);
          }
        } else if (type === 'reactor' || type === 'industry') {
          box(x, y, 1.8, 1.6, 13, '#ab9a77', '#8e846d', '#706e5b', 6);
          for (let i = 0; i < 2; i++) { box(x + i * .8 + .15, y + .2, .5, .6, 17, '#b9b69c', '#8a8d77', '#6c7c6a', 19); box(x + i * .8 + .15, y + .2, .5, .6, 3, '#bf9671', '#a67551', '#8f6e50', 34); }
          for (let i = 0; i < 3; i++) line(project(x + .2 + i * .6, y + 1.61, 13), project(x + .2 + i * .6, y + 1.61, 10), '#dec68b', 2);
        } else if (type === 'reservoir') {
          box(x, y, 2, 2, 9, '#c0bda0', '#9eaa93', '#748a76', 6);
          poly([project(x + .2, y + .2, 15.1), project(x + 1.8, y + .2, 15.1), project(x + 1.8, y + 1.8, 15.1), project(x + .2, y + 1.8, 15.1)], '#577f78');
          line(project(x + .5, y + .5, 16), project(x + 1.5, y + .5, 16), '#9ebaae', .7);
        } else if (type === 'solar') {
          for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
            box(x + i * .7, y + j * .8, .6, .7, 5, '#48767a', '#375b60', '#2c5056', 6);
            line(project(x + i * .7 + .3, y + j * .8, 11.1), project(x + i * .7 + .3, y + j * .8 + .7, 11.1), '#83a9a080', .6);
          }
        } else {
          box(x + .4, y + .4, .8, .8, 15, '#c7c4ab', '#a2a68f', '#7b8a77', 6);
          const [cx, cy] = project(x + .8, y + .8, 32);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.55); ctx.fillStyle = '#d4ceb1'; ctx.beginPath(); ctx.ellipse(0, 0, 12 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          line([cx, cy], [cx - 10 * scale, cy - 14 * scale], '#ece0ba', 1);
        }
        if (layer !== 'Colony') {
          const [lx, ly] = project(x + .8, y + .8, 42);
          ctx.fillStyle = layer === 'Power' ? '#d2dba6' : '#92c4c4'; ctx.beginPath(); ctx.arc(lx, ly, 3 * scale, 0, Math.PI * 2); ctx.fill();
          line([lx, ly + 5], project(x + .8, y + .8, 12), ctx.fillStyle + '55', 1);
        }
        if (selected?.name === b.name) {
          const corners = [project(x - .3, y - .3, 6), project(x + 2.2, y - .3, 6), project(x + 2.2, y + 2.2, 6), project(x - .3, y + 2.2, 6)];
          ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.strokeStyle = '#d6e4ab'; ctx.lineWidth = 2; ctx.stroke();
        }
      });
      // Tiny local transport vehicles make the archived reconstruction feel alive.
      for (let i = 0; i < 8; i++) {
        const t = ((time / 12000 + i / 8) % 1) * 16;
        const [dx, dy] = project(8 + t, [8.15, 12.15, 18.15, 21.15][i % 4], 6);
        ctx.fillStyle = i % 2 ? '#ded7aa' : '#b29269'; ctx.fillRect(dx, dy, 3 * scale, 2 * scale);
      }
      if (labels) {
        const label = (x, y, z, text, color = '#d6dcc4') => {
          const p = project(x, y, z); ctx.font = `${9 * Math.max(.85, scale)}px "Courier New", monospace`; const tw = ctx.measureText(text).width;
          ctx.fillStyle = '#14201de8'; ctx.fillRect(p[0] - tw / 2 - 9, p[1] - 10, tw + 18, 21);
          ctx.strokeStyle = '#87937340'; ctx.strokeRect(p[0] - tw / 2 - 9, p[1] - 10, tw + 18, 21);
          ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, p[0], p[1] + 3);
          line([p[0], p[1] + 11], [p[0], p[1] + 27], '#b5c49a60', .7);
        };
        label(12, 13, 75, 'NEW ALEXANDRIA'); label(6, 19, 27, 'AGRICULTURE'); label(24, 12, 45, 'FUSION PLANT 3', '#d8ba84'); label(24, 25, 10, 'PROTECTED WETLANDS', '#a7bba2');
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [zoom, offset, selected, layer, labels, extraFarms]);

  function pointerUp(event) {
    if (!drag.current) return;
    const distance = Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY);
    if (distance < 5) {
      const rect = canvas.current.getBoundingClientRect();
      const v = view.current;
      const scale = Math.min(v.width / 970, v.height / 570) * zoom;
      let closest = null, best = 45;
      for (const b of buildings) {
        const px = v.width * .5 + offset.x + (b.x - b.y) * 17 * scale;
        const py = v.height * .04 + offset.y + (b.x + b.y) * 8.2 * scale - 10 * scale;
        const distance = Math.hypot(event.clientX - rect.left - px, event.clientY - rect.top - py);
        if (distance < best) { closest = b; best = distance; }
      }
      setSelected(closest);
    }
    drag.current = null;
  }

  return <div className="map-container">
    <canvas ref={canvas} aria-label="Interactive isometric map of New Alexandria. Drag to pan; select a building to inspect it." onPointerDown={e => { drag.current = { startX: e.clientX, startY: e.clientY, x: offset.x, y: offset.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (drag.current) setOffset({ x: drag.current.x + e.clientX - drag.current.startX, y: drag.current.y + e.clientY - drag.current.startY }); }} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; }} />
    <div className="map-topline"><span><i className="status-dot" /> RECONSTRUCTED TELEMETRY</span><span>12° 48′ N &nbsp; 38° 12′ E</span></div>
    <div className="layer-switch" aria-label="Map layers">{['Colony', 'Power', 'Water'].map(item => <button key={item} className={layer === item ? 'active' : ''} onClick={() => onLayer(item)}>{item === 'Colony' ? <Layers3 size={13} /> : item === 'Power' ? <Zap size={13} /> : <Droplets size={13} />}{item}</button>)}</div>
    <div className="map-compass"><span>N</span><svg width="44" height="54" viewBox="0 0 44 54"><path d="M22 6L32 36 22 30 12 36z" fill="none" stroke="#adb599" strokeWidth="1"/><path d="M22 6v24l-10 6z" fill="#adb599"/></svg></div>
    {selected && <div className="building-inspector"><button className="icon-button close-inspector" aria-label="Close building details" onClick={() => setSelected(null)}><X size={14}/></button><span className="eyebrow">{selected.sector}</span><h4>{selected.name}</h4><p><i className="status-dot" /> Operational at last observation</p><span className="muted">Telemetry is 4.37 years old.</span></div>}
    <div className="map-bottomline"><div className="map-legend"><span><i style={{ background: '#c9c4a7' }}/> Infrastructure</span><span><i style={{ background: '#74906a' }}/> Native biosphere</span><span><i style={{ background: '#bfa171' }}/> Needs attention</span></div><div className="map-scale"><span>500 m</span><i /></div></div>
    <div className="map-tools"><button title="Reset view" aria-label="Reset map view" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><LocateFixed size={17}/></button><span/><button title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2, z + .2))}><Plus size={17}/></button><small>{Math.round(zoom * 100)}%</small><button title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.6, z - .2))}><Minus size={17}/></button><span/><button className={labels ? 'enabled' : ''} title="Toggle map labels" aria-label="Toggle map labels" onClick={() => setLabels(!labels)}><Layers3 size={17}/></button></div>
    <div className="primitive-control"><button className={buildMenu ? 'active' : ''} onClick={() => setBuildMenu(!buildMenu)}><MousePointer2 size={14}/> Telecommand <span className="keycap">⌘</span></button>{buildMenu && <div className="build-menu"><span className="eyebrow">ONE ACTION. 4.37 YEARS AWAY.</span>{[['farm', Sprout, 'Hydroponic farm'], ['reactor', Zap, 'Fusion reactor'], ['reservoir', Droplets, 'Water reservoir'], ['habitat', House, 'Habitat module']].map(([type, Icon, name]) => <button key={type} onClick={() => { onBuild(type); setBuildMenu(false); }}><Icon size={15}/>{name}<Radio size={12}/></button>)}</div>}</div>
    <div className="pan-hint"><Move size={11}/> DRAG TO EXPLORE</div>
  </div>;
}
