console.log('mapa.js v4 (países + nombres) cargado');

let mapa;
let capaPaises = null;
let capaNombres = null;
let etiquetas = [];
let ultimaAnomalia = 0;

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
    fillOpacity: 0.85,
    color: 'rgba(255,255,255,0.35)',
    weight: 0.6
  };
}

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

/* ---------- Nombres de países ---------- */

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

  cargarPaises();
}

function actualizarMapa(anomalia) {
  ultimaAnomalia = anomalia;
  pintarPaises();
}

window.addEventListener('load', iniciarMapa);
