let mapa;
let capaPaises = null;
let ultimaAnomalia = 0;

// Escala de color fija (°C) para que los períodos sean comparables entre sí
const ESCALA = [
  { v: -1.0, c: [44, 123, 182] },
  { v:  0.0, c: [171, 217, 233] },
  { v:  0.5, c: [255, 255, 191] },
  { v:  1.0, c: [253, 174, 97] },
  { v:  2.0, c: [215, 25, 28] },
  { v:  3.5, c: [127, 0, 0] }
];

// Fronteras de países (GeoJSON público)
const URL_PAISES =
  'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

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
  return ESCALA[0].c;
}

// Amplificación según latitud (aprox.): Ártico ≈ 2.5x, trópicos ≈ 0.8x, Antártida ≈ 0.6x
function factorLatitud(lat) {
  if (lat >= 0) {
    const t = Math.max(0, lat - 30) / 60;
    return 0.8 + 1.7 * Math.pow(t, 1.5);
  }
  const t = Math.max(0, -lat - 30) / 60;
  return 0.8 - 0.2 * t;
}

function estiloPais(latitud) {
  const [r, g, b] = colorEscala(ultimaAnomalia * factorLatitud(latitud));
  return {
    fillColor: `rgb(${r},${g},${b})`,
    fillOpacity: 0.8,
    color: 'rgba(255,255,255,0.35)',
    weight: 0.6
  };
}

async function cargarPaises() {
  try {
    const respuesta = await fetch(URL_PAISES);
    if (!respuesta.ok) throw new Error('No se pudo cargar el GeoJSON');
    const geojson = await respuesta.json();

    capaPaises = L.geoJSON(geojson, {
      style: () => estiloPais(0),
      interactive: false
    }).addTo(mapa);

    // Guardamos la latitud central de cada país
    capaPaises.eachLayer(capa => {
      capa._latitud = capa.getBounds().getCenter().lat;
    });

    pintarPaises();
  } catch (error) {
    console.error('Error al cargar los países:', error);
  }
}

function pintarPaises() {
  if (!capaPaises) return;
  capaPaises.eachLayer(capa => capa.setStyle(estiloPais(capa._latitud)));
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

  cargarPaises();
}

// sketch.js llama a esta función cada vez que cambia el período
function actualizarMapa(anomalia) {
  ultimaAnomalia = anomalia;
  pintarPaises();
}

window.addEventListener('load', iniciarMapa);
