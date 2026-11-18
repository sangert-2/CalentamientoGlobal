console.log('mapa.js v5 (bandas NASA) cargado');

let mapa;
let capaPaises = null;
let capaNombres = null;
let etiquetas = [];
let ultimaAnomalia = 0;

/* ---------- Escala de color (°C) ---------- */

const ESCALA = [
  { v: -1.0, c: [44, 123, 182] },
  { v:  0.0, c: [171, 217, 233] },
  { v:  0.5, c: [255, 255, 191] },
  { v:  1.0, c: [253, 174, 97] },
  { v:  2.0, c: [215, 25, 28] },
  { v:  3.5, c: [127, 0, 0] }
];

const URLS_PAISES = [
  'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json',
  'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json'
];

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

/* ---------- Datos NASA por bandas de latitud ---------- */

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

/* ---------- Nombres en español ---------- */

// Código ISO de 3 letras (el del GeoJSON) -> 2 letras (lo que necesita Intl.DisplayNames)
const ISO3A2 = Object.fromEntries((
  'AFG:AF,AGO:AO,ALB:AL,ARE:AE,ARG:AR,ARM:AM,ATA:AQ,ATF:TF,AUS:AU,AUT:AT,AZE:AZ,BDI:BI,BEL:BE,' +
  'BEN:BJ,BFA:BF,BGD:BD,BGR:BG,BHS:BS,BIH:BA,BLR:BY,BLZ:BZ,BOL:BO,BRA:BR,BRN:BN,BTN:BT,BWA:BW,' +
  'CAF:CF,CAN:CA,CHE:CH,CHL:CL,CHN:CN,CIV:CI,CMR:CM,COD:CD,COG:CG,COL:CO,CRI:CR,CUB:CU,CYP:CY,' +
  'CZE:CZ,DEU:DE,DJI:DJ,DNK:DK,DOM:DO,DZA:DZ,ECU:EC,EGY:EG,ERI:ER,ESH:EH,ESP:ES,EST:EE,ETH:ET,' +
  'FIN:FI,FJI:FJ,FLK:FK,FRA:FR,GAB:GA,GBR:GB,GEO:GE,GHA:GH,GIN:GN,GMB:GM,GNB:GW,GNQ:GQ,GRC:GR,' +
  'GRL:GL,GTM:GT,GUF:GF,GUY:GY,HND:HN,HRV:HR,HTI:HT,HUN:HU,IDN:ID,IND:IN,IRL:IE,IRN:IR,IRQ:IQ,' +
  'ISL:IS,ISR:IL,ITA:IT,JAM:JM,JOR:JO,JPN:JP,KAZ:KZ,KEN:KE,KGZ:KG,KHM:KH,KOR:KR,KWT:KW,LAO:LA,' +
  'LBN:LB,LBR:LR,LBY:LY,LKA:LK,LSO:LS,LTU:LT,LUX:LU,LVA:LV,MAR:MA,MDA:MD,MDG:MG,MEX:MX,MKD:MK,' +
  'MLI:ML,MMR:MM,MNE:ME,MNG:MN,MOZ:MZ,MRT:MR,MWI:MW,MYS:MY,NAM:NA,NCL:NC,NER:NE,NGA:NG,NIC:NI,' +
  'NLD:NL,NOR:NO,NPL:NP,NZL:NZ,OMN:OM,PAK:PK,PAN:PA,PER:PE,PHL:PH,PNG:PG,POL:PL,PRI:PR,PRK:KP,' +
  'PRT:PT,PRY:PY,PSE:PS,QAT:QA,ROU:RO,RUS:RU,RWA:RW,SAU:SA,SDN:SD,SEN:SN,SLB:SB,SLE:SL,SLV:SV,' +
  'SOM:SO,SRB:RS,SSD:SS,SUR:SR,SVK:SK,SVN:SI,SWE:SE,SWZ:SZ,SYR:SY,TCD:TD,TGO:TG,THA:TH,TJK:TJ,' +
  'TKM:TM,TLS:TL,TTO:TT,TUN:TN,TUR:TR,TWN:TW,TZA:TZ,UGA:UG,UKR:UA,URY:UY,USA:US,UZB:UZ,VEN:VE,' +
  'VNM:VN,VUT:VU,YEM:YE,ZAF:ZA,ZMB:ZM,ZWE:ZW'
).split(',').map(par => par.split(':')));

const nombresES = new Intl.DisplayNames(['es'], { type: 'region' });

function nombreEnEspanol(feature) {
  const iso2 = ISO3A2[feature.id];
  if (iso2) {
    try { return nombresES.of(iso2); } catch (e) { /* usa el nombre original */ }
  }
  return feature.properties?.name || '';
}

/* ---------- Etiquetas de países ---------- */

// Estilos de las etiquetas (se inyectan desde aquí, no hay que tocar el CSS)
function inyectarEstilos() {
  const estilo = document.createElement('style');
  estilo.textContent = `
    .etiqueta-pais { background: none; border: none; pointer-events: none; }
    .etiqueta-pais span {
      position: absolute;
      transform: translate(-50%, -50%);
      white-space: nowrap;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.02em;
      text-shadow:
        -1px -1px 0 #101418, 1px -1px 0 #101418,
        -1px  1px 0 #101418, 1px  1px 0 #101418,
         0 0 4px rgba(0,0,0,0.9);
    }`;
  document.head.appendChild(estilo);
}

// Centro del polígono más grande (evita que Alaska, Guayana Francesa, etc. muevan el nombre)
function puntoPrincipal(geometry) {
  const poligonos = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.coordinates;

  let mejor = null;

  poligonos.forEach(poligono => {
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;

    poligono[0].forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    const ancho = maxLng - minLng;
    const area = ancho * (maxLat - minLat);

    if (!mejor || area > mejor.area) {
      mejor = {
        area,
        ancho,
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2
      };
    }
  });

  return mejor;
}

function crearEtiquetas(geojson) {
  capaNombres = L.layerGroup();

  mapa.createPane('nombres');
  mapa.getPane('nombres').style.zIndex = 650;
  mapa.getPane('nombres').style.pointerEvents = 'none';

  etiquetas = geojson.features
    .filter(f => f.geometry)
    .map(f => {
      const punto = puntoPrincipal(f.geometry);
      return {
        nombre: nombreEnEspanol(f),
        anchoGrados: punto.ancho,
        marcador: L.marker([punto.lat, punto.lng], {
          pane: 'nombres',
          interactive: false,
          keyboard: false
        })
      };
    })
    .filter(e => e.nombre && e.anchoGrados > 0);

  capaNombres.addTo(mapa);
  mapa.on('zoomend', actualizarEtiquetas);
  actualizarEtiquetas();
}

// Muestra solo los nombres que caben y los hace más grandes si el país es grande
function actualizarEtiquetas() {
  if (!capaNombres) return;

  const pixelesPorGrado = (256 * Math.pow(2, mapa.getZoom())) / 360;

  etiquetas.forEach(e => {
    const anchoPx = e.anchoGrados * pixelesPorGrado;
    const tamano = Math.min(22, anchoPx / (e.nombre.length * 0.5));

    if (tamano < 10) {
      capaNombres.removeLayer(e.marcador);
      return;
    }

    const letra = Math.max(12, Math.round(tamano));

    e.marcador.setIcon(L.divIcon({
      className: 'etiqueta-pais',
      html: `<span style="font-size:${letra}px">${e.nombre}</span>`,
      iconSize: [0, 0]
    }));

    capaNombres.addLayer(e.marcador);
  });
}

/* ---------- Países y mapa ---------- */

async function descargarGeoJSON() {
  for (const url of URLS_PAISES) {
    try {
      const respuesta = await fetch(url);
      if (respuesta.ok) return await respuesta.json();
    } catch (error) {
      console.warn('Falló la descarga desde', url);
    }
  }
  throw new Error('No se pudo descargar el mapa de países');
}

async function cargarPaises() {
  try {
    const geojson = await descargarGeoJSON();

    capaPaises = L.geoJSON(geojson, {
      style: () => estiloPais(0),
      interactive: false
    }).addTo(mapa);

    capaPaises.eachLayer(capa => {
      capa._latitud = capa.getBounds().getCenter().lat;
    });

    pintarPaises();
    crearEtiquetas(geojson);
    console.log('Países cargados:', capaPaises.getLayers().length);
  } catch (error) {
    console.error('Error al cargar los países:', error);
  }
}

function pintarPaises() {
  if (!capaPaises) return;
  capaPaises.eachLayer(capa => capa.setStyle(estiloPais(capa._latitud)));
}

function iniciarMapa() {
  inyectarEstilos();

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

  cargarZonas();
  cargarPaises();
}

// sketch.js llama a esta función cada vez que cambia el período
function actualizarMapa(anomalia) {
  ultimaAnomalia = anomalia;
  calcularAnomaliasBandas();
  pintarPaises();
}

window.addEventListener('load', iniciarMapa);
