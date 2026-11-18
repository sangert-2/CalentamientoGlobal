console.log('mapa.js v5 (bandas NASA) cargado');

const URL_ZONAS = 'Datos/ZonAnn.Ts+dSST.csv';

// Bandas de latitud de NASA y la columna del CSV que le corresponde a cada una
const BANDAS = [
  { col: '64N-90N', min:  64, max:  90 },
  { col: '44N-64N', min:  44, max:  64 },
  { col: '24N-44N', min:  24, max:  44 },
  { col: 'EQU-24N', min:   0, max:  24 },
  { col: '24S-EQU', min: -24, max:   0 },
  { col: '44S-24S', min: -44, max: -24 },
  { col: '64S-44S', min: -64, max: -44 },
  { col: '90S-64S', min: -90, max: -64 }
];

let datosZonas = null;        // { año: { columna: valor } }
let referenciaZonas = {};     // media 1880-1900 de cada banda
let anomaliasBandas = {};     // anomalía del período elegido, por banda

async function cargarZonas() {
  try {
    const respuesta = await fetch(URL_ZONAS);
    if (!respuesta.ok) throw new Error('No se pudo cargar ' + URL_ZONAS);

    const lineas = (await respuesta.text()).split(/\r?\n/);
    const inicio = lineas.findIndex(l => l.trim().startsWith('Year,'));
    if (inicio === -1) throw new Error('No se encontraron los encabezados');

    const encabezados = lineas[inicio].trim().split(',');
    const datos = {};

    for (let i = inicio + 1; i < lineas.length; i++) {
      const c = lineas[i].trim().split(',');
      const anio = Number(c[0]);
      if (!Number.isFinite(anio) || c.length < encabezados.length) continue;

      datos[anio] = {};
      encabezados.forEach((nombre, j) => {
        const texto = c[j].trim();
        if (j === 0 || texto === '' || texto === '***') return;
        const valor = Number(texto);
        if (Number.isFinite(valor)) datos[anio][nombre] = valor;
      });
    }

    datosZonas = datos;
    calcularReferenciasZonas();
    calcularAnomaliasBandas();
    pintarPaises();
    console.log('Bandas de latitud cargadas:', Object.keys(datos).length, 'años');
  } catch (error) {
    console.error('Error al cargar las zonas de NASA:', error);
  }
}

// Media de una columna entre dos años (ignora los años sin dato)
function promedioZona(columna, desde, hasta) {
  let suma = 0, n = 0;
  for (let anio = desde; anio <= hasta; anio++) {
    const v = datosZonas[anio]?.[columna];
    if (v !== undefined) { suma += v; n++; }
  }
  return n > 0 ? { media: suma / n, n } : null;
}

// Misma referencia que usa tu gráfica: 1880-1900
function calcularReferenciasZonas() {
  referenciaZonas = {};

  const global = promedioZona('Glob', 1880, 1900);
  referenciaZonas.Glob = global ? global.media : 0;

  BANDAS.forEach(b => {
    const p = promedioZona(b.col, 1880, 1900);
    // Si la banda casi no tiene datos antiguos (Antártida), se usa la referencia global
    if (p && p.n >= 10) referenciaZonas[b.col] = p.media;
  });
}

function aniosDelPeriodo() {
  const inicio = document.getElementById('fechaInicio')?.value;
  const final = document.getElementById('fechaFinal')?.value;
  if (!inicio || !final) return null;
  return [Number(inicio.slice(0, 4)), Number(final.slice(0, 4))];
}

function calcularAnomaliasBandas() {
  anomaliasBandas = {};
  const anios = aniosDelPeriodo();
  if (!datosZonas || !anios) return;

  BANDAS.forEach(b => {
    const p = promedioZona(b.col, anios[0], anios[1]);
    if (!p) return;
    const referencia = referenciaZonas[b.col] ?? referenciaZonas.Glob;
    anomaliasBandas[b.col] = p.media - referencia;
  });
}

function anomaliaPorLatitud(lat) {
  const banda = BANDAS.find(b => lat >= b.min && lat <= b.max);
  const valor = banda ? anomaliasBandas[banda.col] : undefined;
  // Si falta el dato de la banda, se usa la anomalía global
  return valor !== undefined ? valor : ultimaAnomalia;
}

function estiloPais(latitud) {
  const [r, g, b] = colorEscala(anomaliaPorLatitud(latitud));
  return {
    fillColor: `rgb(${r},${g},${b})`,
    fillOpacity: 0.85,
    color: 'rgba(255,255,255,0.35)',
    weight: 0.6
  };
}

function actualizarMapa(anomalia) {
  ultimaAnomalia = anomalia;
  calcularAnomaliasBandas();
  pintarPaises();
}

window.addEventListener('load', iniciarMapa);
