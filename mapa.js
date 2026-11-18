
const ARCHIVO_MAPA = 'Datos/mapa_calor.json';
const LIMITE_MAPA = 85;     // Leaflet no dibuja bien más allá de ±85°
const RESOLUCION = 720;     // Tamaño de la imagen del mapa de calor (px)
const OPACIDAD = 0.75;

// Escala fija de color (°C sobre la referencia 1880–1900)
// Es la misma para todas las épocas, para poder compararlas.
const ESCALA_COLOR = [
  { valor: -1.0, color: [57, 127, 169] },   // azul
  { valor: 0.0,  color: [140, 200, 180] },  // verde agua
  { valor: 0.8,  color: [228, 189, 101] },  // amarillo
  { valor: 1.6,  color: [232, 121, 66] },   // naranja
  { valor: 3.0,  color: [201, 54, 50] }     // rojo
];

let mapa;
let capas = [];              // Una copia de la imagen por cada "vuelta" del mundo
let cuadricula = null;       // Contenido de mapa_calor.json
let valoresActuales = null;  // Promedio por celda del período elegido
let ultimaSolicitud = null;

async function iniciarMapa() {
  mapa = L.map('mapa', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 10,
    worldCopyJump: true
  });

  // Teselas de Esri (gris oscuro), sin API key
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      maxZoom: 10
    }
  ).addTo(mapa);

  // Clic en el mapa: muestra la anomalía de ese punto
  mapa.on('click', mostrarValorEnPunto);

  await cargarCuadricula();

  // Si ya se había elegido un período, dibujarlo
  if (ultimaSolicitud) {
    actualizarMapa(...ultimaSolicitud);
  }
}

async function cargarCuadricula() {
  try {
    const respuesta = await fetch(ARCHIVO_MAPA);

    if (!respuesta.ok) {
      throw new Error('No se pudo cargar ' + ARCHIVO_MAPA);
    }

    cuadricula = await respuesta.json();
    console.log('Cuadrícula cargada:', cuadricula.lat.length, 'x', cuadricula.lon.length);

  } catch (error) {
    console.error('Error al cargar el mapa de calor:', error);
  }
}

function promediarPeriodo(anioDesde, anioHasta) {
  const { lat, lon, escala, datos } = cuadricula;
  const total = lat.length * lon.length;

  const suma = new Float64Array(total);
  const cuenta = new Uint16Array(total);

  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    const fila = datos[anio];
    if (!fila) continue;

    for (let i = 0; i < total; i++) {
      if (fila[i] !== null) {
        suma[i] += fila[i];
        cuenta[i]++;
      }
    }
  }

  const promedio = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    promedio[i] = cuenta[i] > 0 ? suma[i] / cuenta[i] / escala : NaN;
  }

  return promedio;
}

function muestrear(valores, latitud, longitud) {
  const { lat, lon } = cuadricula;
  const nLat = lat.length;
  const nLon = lon.length;

  // Posición fraccionaria en la cuadrícula
  let fi = (latitud - lat[0]) / (lat[1] - lat[0]);
  fi = Math.max(0, Math.min(nLat - 1, fi));

  const i0 = Math.floor(fi);
  const i1 = Math.min(nLat - 1, i0 + 1);
  const ty = fi - i0;

  // La longitud es circular (da la vuelta al mundo)
  const paso = lon[1] - lon[0];
  const fj = (((longitud - lon[0]) / paso) % nLon + nLon) % nLon;

  const j0 = Math.floor(fj) % nLon;
  const j1 = (j0 + 1) % nLon;
  const tx = fj - Math.floor(fj);

  const esquinas = [
    [i0, j0, (1 - ty) * (1 - tx)],
    [i0, j1, (1 - ty) * tx],
    [i1, j0, ty * (1 - tx)],
    [i1, j1, ty * tx]
  ];

  let suma = 0;
  let pesos = 0;

  for (const [i, j, peso] of esquinas) {
    const valor = valores[i * nLon + j];

    if (peso > 0 && !Number.isNaN(valor)) {
      suma += valor * peso;
      pesos += peso;
    }
  }

  return pesos > 0 ? suma / pesos : NaN;
}

function colorRGB(valor) {
  const primero = ESCALA_COLOR[0];
  const ultimo = ESCALA_COLOR[ESCALA_COLOR.length - 1];

  if (valor <= primero.valor) return primero.color;
  if (valor >= ultimo.valor) return ultimo.color;

  for (let i = 0; i < ESCALA_COLOR.length - 1; i++) {
    const a = ESCALA_COLOR[i];
    const b = ESCALA_COLOR[i + 1];

    if (valor >= a.valor && valor <= b.valor) {
      const t = (valor - a.valor) / (b.valor - a.valor);
      return a.color.map((c, k) => Math.round(c + (b.color[k] - c) * t));
    }
  }

  return ultimo.color;
}

function crearImagenCalor(valores) {
  const canvas = document.createElement('canvas');
  canvas.width = RESOLUCION;
  canvas.height = RESOLUCION;

  const ctx = canvas.getContext('2d');
  const imagen = ctx.createImageData(RESOLUCION, RESOLUCION);

  // Cada fila de la imagen sigue la proyección Mercator de Leaflet
  const yMax = Math.log(Math.tan(Math.PI / 4 + (LIMITE_MAPA * Math.PI / 180) / 2));

  for (let y = 0; y < RESOLUCION; y++) {
    const mercator = yMax - ((y + 0.5) / RESOLUCION) * 2 * yMax;
    const latitud = (2 * Math.atan(Math.exp(mercator)) - Math.PI / 2) * 180 / Math.PI;

    for (let x = 0; x < RESOLUCION; x++) {
      const longitud = -180 + ((x + 0.5) / RESOLUCION) * 360;
      const valor = muestrear(valores, latitud, longitud);

      if (Number.isNaN(valor)) continue;

      const [r, g, b] = colorRGB(valor);
      const k = (y * RESOLUCION + x) * 4;

      imagen.data[k] = r;
      imagen.data[k + 1] = g;
      imagen.data[k + 2] = b;
      imagen.data[k + 3] = 255;
    }
  }

  ctx.putImageData(imagen, 0, 0);
  return canvas.toDataURL('image/png');
}

function mostrarImagen(url) {
  if (capas.length === 0) {
    // Tres copias para que el mapa de calor cubra el mundo repetido
    [-360, 0, 360].forEach(desplazamiento => {
      const capa = L.imageOverlay(
        url,
        [[-LIMITE_MAPA, -180 + desplazamiento], [LIMITE_MAPA, 180 + desplazamiento]],
        { opacity: OPACIDAD, interactive: false }
      ).addTo(mapa);

      capas.push(capa);
    });
  } else {
    capas.forEach(capa => capa.setUrl(url));
  }
}

function actualizarMapa(promedioGlobal, anioDesde, anioHasta) {
  ultimaSolicitud = [promedioGlobal, anioDesde, anioHasta];

  if (!cuadricula || !mapa) return;

  valoresActuales = promediarPeriodo(anioDesde, anioHasta);
  mostrarImagen(crearImagenCalor(valoresActuales));
}

function mostrarValorEnPunto(evento) {
  if (!valoresActuales || !ultimaSolicitud) return;

  const valor = muestrear(valoresActuales, evento.latlng.lat, evento.latlng.lng);
  if (Number.isNaN(valor)) return;

  const signo = valor >= 0 ? '+' : '';
  const [, desde, hasta] = ultimaSolicitud;

  L.popup()
    .setLatLng(evento.latlng)
    .setContent(
      `<strong>${signo}${valor.toFixed(2)} °C</strong><br>` +
      `Promedio ${desde} – ${hasta}<br>` +
      `<small>respecto a 1880–1900</small>`
    )
    .openOn(mapa);
}

window.addEventListener('load', iniciarMapa);