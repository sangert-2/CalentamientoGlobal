let mapa;
let capaTemperatura;

function iniciarMapa() {

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

  capaTemperatura = L.rectangle(
    [[-85, -180], [85, 180]],
    {
      stroke: false,
      fillColor: '#E4A33D',
      fillOpacity: 0.08,
      interactive: false
    }
  ).addTo(mapa);
}

function actualizarMapa(anomalia) {

  if (!capaTemperatura) return;

  let color;

  if (anomalia < 0) {
    color = '#397FA9';
  } else if (anomalia < 0.4) {
    color = '#E4BD65';
  } else if (anomalia < 0.8) {
    color = '#E87942';
  } else {
    color = '#C93632';
  }

  capaTemperatura.setStyle({
    fillColor: color,
    fillOpacity: 0.18
  });
}

window.addEventListener('load', iniciarMapa);