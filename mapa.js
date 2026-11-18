let mapa;
let capaCalor;

// Escala de color fija (°C) para que los períodos sean comparables entre sí
const ESCALA = [
  { v: -1.0, c: [44, 123, 182] },
  { v:  0.0, c: [171, 217, 233] },
  { v:  0.5, c: [255, 255, 191] },
  { v:  1.0, c: [253, 174, 97] },
  { v:  2.0, c: [215, 25, 28] },
  { v:  3.5, c: [127, 0, 0] }
];

const LIMITES_MAPA = [[-85.0511, -540], [85.0511, 540]];
const ALTO_CANVAS = 512;

// Interpola el color de la escala para un valor dado
function colorEscala(valor) {
  if (valor <= ESCALA[0].v) return ESCALA[0].c;
  if (valor >= ESCALA[ESCALA.length - 1].v) return ESCALA[ESCALA.length - 1].c;

  for (let i = 0; i < ESCALA.length - 1; i++) {
    const a = ESCALA[i];
    const b = ESCALA[i + 1];
    if (valor >= a.v && valor <= b.v) {
      const t = (valor - a.v) / (b.v - a.v);
      return a.c.map((canal, k) => Math.round(canal + (b.c[k] - canal) * t));
    }
  }
}

// Factor de amplificación según la latitud (aprox.):
// Ártico ≈ 2.5x, trópicos ≈ 0.8x, Antártida ≈ 0.6x
function factorLatitud(lat) {
  if (lat >= 0) {
    const t = Math.max(0, lat - 30) / 60;
    return 0.8 + 1.7 * Math.pow(t, 1.5);
  }
  const t = Math.max(0, -lat - 30) / 60;
  return 0.8 - 0.2 * t;
}

// Dibuja una imagen de 1 x ALTO píxeles; cada fila es una latitud.
// Se calcula en proyección Mercator para que coincida con el mapa.
function crearImagenCalor(anomaliaGlobal) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = ALTO_CANVAS;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < ALTO_CANVAS; y++) {
    const mercY = (1 - (2 * (y + 0.5)) / ALTO_CANVAS) * Math.PI;
    const lat = (Math.atan(Math.sinh(mercY)) * 180) / Math.PI;

    const valor = anomaliaGlobal * factorLatitud(lat);
    const [r, g, b] = colorEscala(valor);

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, 1, 1);
  }

  return canvas.toDataURL();
}

function iniciarMapa() {
  mapa = L.map('mapa', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 10,
    worldCopyJump: true
  });

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      maxZoom: 10
    }
  ).addTo(mapa);

  capaCalor = L.imageOverlay(crearImagenCalor(0), LIMITES_MAPA, {
    opacity: 0.55,
    interactive: false
  }).addTo(mapa);

  agregarLeyenda();
}

function actualizarMapa(anomalia) {
  if (!capaCalor) return;
  capaCalor.setUrl(crearImagenCalor(anomalia));
}

function agregarLeyenda() {
  const leyenda = L.control({ position: 'bottomright' });

  leyenda.onAdd = () => {
    const div = L.DomUtil.create('div', 'leyenda-calor');
    const gradiente = ESCALA
      .map(p => {
        const pos = ((p.v - ESCALA[0].v) /
          (ESCALA[ESCALA.length - 1].v - ESCALA[0].v)) * 100;
        return `rgb(${p.c.join(',')}) ${pos}%`;
      })
      .join(', ');

    div.innerHTML = `
      <div style="background:rgba(20,24,32,.85);padding:8px 10px;border-radius:6px;
                  color:#E8E8E8;font:11px sans-serif;">
        <div style="margin-bottom:4px;">Anomalía estimada (°C)</div>
        <div style="width:160px;height:10px;border-radius:3px;
                    background:linear-gradient(to right, ${gradiente});"></div>
        <div style="display:flex;justify-content:space-between;margin-top:2px;">
          <span>−1</span><span>0</span><span>1</span><span>2</span><span>3,5</span>
        </div>
      </div>`;
    return div;
  };

  leyenda.addTo(mapa);
}

window.addEventListener('load', iniciarMapa);
