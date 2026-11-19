const ARCHIVO_MAPA = 'Datos/mapa_calor.json';
const LIMITE = 85;
const TAM = 720;
const ESCALA_COLOR = [
  { valor: -0.5, color: [57, 127, 169] },
  { valor: 0.0, color: [190, 235, 200] },
  { valor: 0.5, color: [247, 238, 69] },
  { valor: 1.0, color: [245, 166, 35] },
  { valor: 1.5, color: [224, 58, 47] },
  { valor: 2.5, color: [122, 28, 140] }
];

const YMAX = Math.log(Math.tan(Math.PI / 4 + (LIMITE * Math.PI / 180) / 2));

let mapa, cuadricula, valores, ultima;
const capas = [];

async function iniciarMapa() {
  mapa = L.map('mapa', {
    center: [20, 0],
    zoom: 2,
    zoomSnap: 0.25,
    minZoom: 2,
    maxZoom: 10,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0
  });

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri', maxZoom: 10, noWrap: true }
  ).addTo(mapa);

  mapa.createPane('etiquetas');
  Object.assign(mapa.getPane('etiquetas').style, { zIndex: 450, pointerEvents: 'none' });
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    { pane: 'etiquetas', maxZoom: 10, noWrap: true }
  ).addTo(mapa);

  mapa.on('click', mostrarValor);

  try {
    cuadricula = await (await fetch(ARCHIVO_MAPA)).json();
    console.log('Cuadrícula cargada');
    if (ultima) actualizarMapa(...ultima);
  } catch (error) {
    console.error('Error al cargar el mapa de calor:', error);
  }
}

function promediar(desde, hasta) {
  const { lat, lon, escala, datos } = cuadricula;
  const total = lat.length * lon.length;
  const suma = new Float64Array(total);
  const cuenta = new Uint16Array(total);

  for (let anio = desde; anio <= hasta; anio++) {
    const fila = datos[anio];
    if (!fila) continue;
    for (let i = 0; i < total; i++) {
      if (fila[i] !== null) { suma[i] += fila[i]; cuenta[i]++; }
    }
  }

  return Float32Array.from(suma, (s, i) => (cuenta[i] ? s / cuenta[i] / escala : NaN));
}

function muestrear(v, latitud, longitud) {
  const { lat, lon } = cuadricula;
  const nLat = lat.length, nLon = lon.length;

  const fi = Math.min(nLat - 1, Math.max(0, (latitud - lat[0]) / (lat[1] - lat[0])));
  const i0 = Math.floor(fi), i1 = Math.min(nLat - 1, i0 + 1), ty = fi - i0;

  const fj = ((((longitud - lon[0]) / (lon[1] - lon[0])) % nLon) + nLon) % nLon;
  const j0 = Math.floor(fj) % nLon, j1 = (j0 + 1) % nLon, tx = fj - Math.floor(fj);

  let s = 0, w = 0;
  [[i0, j0, (1 - ty) * (1 - tx)], [i0, j1, (1 - ty) * tx], [i1, j0, ty * (1 - tx)], [i1, j1, ty * tx]]
    .forEach(([i, j, p]) => {
      const x = v[i * nLon + j];
      if (p > 0 && !Number.isNaN(x)) { s += x * p; w += p; }
    });

  return w > 0 ? s / w : NaN;
}

function colorDe(valor) {
  const E = ESCALA_COLOR;
  if (valor <= E[0].valor) return E[0].color;
  if (valor >= E[E.length - 1].valor) return E[E.length - 1].color;

  for (let i = 0; i < E.length - 1; i++) {
    if (valor <= E[i + 1].valor) {
      const t = (valor - E[i].valor) / (E[i + 1].valor - E[i].valor);
      return E[i].color.map((c, k) => Math.round(c + (E[i + 1].color[k] - c) * t));
    }
  }
}

function crearImagen(v) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TAM;
  const ctx = canvas.getContext('2d');
  const imagen = ctx.createImageData(TAM, TAM);

  for (let y = 0; y < TAM; y++) {
    const lat = (2 * Math.atan(Math.exp(YMAX - ((y + 0.5) / TAM) * 2 * YMAX)) - Math.PI / 2) * 180 / Math.PI;

    for (let x = 0; x < TAM; x++) {
      const valor = muestrear(v, lat, -180 + ((x + 0.5) / TAM) * 360);
      if (Number.isNaN(valor)) continue;

      const [r, g, b] = colorDe(valor);
      const k = (y * TAM + x) * 4;
      imagen.data[k] = r; imagen.data[k + 1] = g; imagen.data[k + 2] = b; imagen.data[k + 3] = 255;
    }
  }

  ctx.putImageData(imagen, 0, 0);
  return canvas.toDataURL('image/png');
}

function actualizarMapa(promedioGlobal, desde, hasta) {
  ultima = [promedioGlobal, desde, hasta];
  if (!cuadricula || !mapa) return;

  valores = promediar(desde, hasta);
  const url = crearImagen(valores);

  if (!capas.length) {
    [-360, 0, 360].forEach(d => {
      capas.push(L.imageOverlay(url, [[-LIMITE, -180 + d], [LIMITE, 180 + d]], { opacity: 0.35, interactive: false }).addTo(mapa));
    });
  } else {
    capas.forEach(capa => capa.setUrl(url));
  }
}

function mostrarValor(evento) {
  if (!valores || !ultima) return;

  const valor = muestrear(valores, evento.latlng.lat, evento.latlng.lng);
  if (Number.isNaN(valor)) return;

  const signo = valor >= 0 ? '+' : '';
  const nivel =
    valor < 0 ? 'Más frío que a finales del siglo XIX' :
    valor < 0.5 ? 'Calentamiento leve' :
    valor < 1 ? 'Calentamiento moderado' :
    valor < 1.5 ? 'Calentamiento alto' :
    'Calentamiento muy alto';

  const comparacion = valor >= 0 ? 'más alta' : 'más baja';

  L.popup({ maxWidth: 240 })
    .setLatLng(evento.latlng)
    .setContent(
      `<div style="font-size:13px;line-height:1.45">` +
      `<div style="font-size:22px;font-weight:bold">${signo}${valor.toFixed(2)} °C</div>` +
      `<div style="font-weight:bold;margin-bottom:6px">${nivel}</div>` +
      `En esta zona, la temperatura promedio entre ${ultima[1]} y ${ultima[2]} fue ` +
      `<strong>${Math.abs(valor).toFixed(2)} °C ${comparacion}</strong> ` +
      `que el promedio de 1880 a 1900, antes de que el calentamiento global se acelerara.` +
      `</div>`
    )
    .openOn(mapa);
}

window.addEventListener('load', iniciarMapa);