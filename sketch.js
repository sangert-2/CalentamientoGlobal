const ARCHIVO = 'Datos/GLB.Ts+dSST.csv';
const FECHA_MIN = '1926-01';
const SONIDOS = {
  frio: 'Sonidos/Frío.mp3',
  transicion: 'Sonidos/Transicion.mp3',
  calentamiento: 'Sonidos/Calentamiento.mp3'
};

const $ = id => document.getElementById(id);
const formatoMes = (a, m) => `${a}-${String(m).padStart(2, '0')}`;
const totalMeses = t => { const [a, m] = t.split('-').map(Number); return a * 12 + m; };
const media = n => n.reduce((a, b) => a + b, 0) / n.length;

const audios = Object.fromEntries(
  Object.entries(SONIDOS).map(([k, ruta]) => [k, Object.assign(new Audio(ruta), { loop: true })])
);

let registros = [], visibles = [], grafica, fechaMax, sonidoActivo = true;

const promedio = () => media(visibles.map(r => r.valor));

document.addEventListener('DOMContentLoaded', async () => {
  $('aplicarFechas')?.addEventListener('click', aplicarFechas);
  $('restablecer')?.addEventListener('click', restablecer);
  $('sonido')?.addEventListener('click', alternarSonido);
  $('mostrarParis')?.addEventListener('change', dibujarGrafica);
  if ($('sonido')) $('sonido').textContent = 'Silenciar sonido';

  document.addEventListener('click', () => {
    if (Object.values(audios).every(a => a.paused)) sonar();
  }, { once: true });

  try {
    const respuesta = await fetch(ARCHIVO);
    if (!respuesta.ok) throw new Error('No se pudo cargar el CSV');
    registros = leerCSV(await respuesta.text());

    const base = media(registros.filter(r => r.anio >= 1880 && r.anio <= 1900).map(r => r.anomalia));
    registros.forEach(r => { r.valor = r.anomalia - base; });

    const ultimo = registros[registros.length - 1];
    fechaMax = formatoMes(ultimo.anio, ultimo.mes);

    ['fechaInicio', 'fechaFinal'].forEach(id => {
      Object.assign($(id), { type: 'month', min: FECHA_MIN, max: fechaMax });
    });
    fijarFechas();
    aplicarFechas();
  } catch (error) {
    console.error(error);
    $('valorAnomalia').textContent = 'Error al cargar los datos';
  }
});

function leerCSV(texto) {
  const lineas = texto.split(/\r?\n/);
  const inicio = lineas.findIndex(l => l.trim().startsWith('Year,'));
  if (inicio < 0) throw new Error('CSV sin encabezados');

  return lineas.slice(inicio + 1).flatMap(linea => {
    const c = linea.trim().split(',');
    const anio = Number(c[0]);
    if (c.length < 13 || !Number.isFinite(anio)) return [];

    return c.slice(1, 13)
      .map((v, i) => ({ anio, mes: i + 1, anomalia: v.trim() === '' ? NaN : Number(v) }))
      .filter(r => Number.isFinite(r.anomalia));
  }).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

function fijarFechas() {
  $('fechaInicio').value = FECHA_MIN;
  $('fechaFinal').value = fechaMax;
}

function aplicarFechas() {
  const inicio = $('fechaInicio').value;
  const final = $('fechaFinal').value;
  if (!inicio || !final) return;

  const desde = totalMeses(inicio);
  const hasta = totalMeses(final);

  if (desde > hasta) {
    alert('La fecha inicial no puede ser posterior a la fecha final.');
    return;
  }

  visibles = registros.filter(r => {
    const f = r.anio * 12 + r.mes;
    return f >= desde && f <= hasta;
  });
  if (!visibles.length) return;

  const primero = visibles[0];
  const ultimo = visibles[visibles.length - 1];
  const prom = promedio();

  $('valorAnomalia').textContent = `${prom >= 0 ? '+' : ''}${prom.toFixed(2)} °C`;
  $('textoPeriodo').textContent = `${primero.mes}/${primero.anio} – ${ultimo.mes}/${ultimo.anio}`;
  $('periodoMapa').textContent = `Período: ${primero.anio} – ${ultimo.anio}`;

  dibujarGrafica();
  if (typeof actualizarMapa === 'function') actualizarMapa(prom, primero.anio, ultimo.anio);
  sonar();
}

function restablecer() {
  fijarFechas();
  $('mostrarParis').checked = true;
  aplicarFechas();
}

function dibujarGrafica() {
  if (!visibles.length) return;

  const linea = (label, valor, color) => ({
    label, color, data: visibles.map(() => valor),
    borderColor: color, borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0, fill: false
  });

  const datasets = [{
    label: 'Anomalía mensual global',
    data: visibles.map(r => r.valor),
    borderColor: '#F2A65A',
    backgroundColor: 'rgba(242, 166, 90, 0.12)',
    borderWidth: 2,
    pointRadius: 0,
    pointHitRadius: 8,
    fill: true,
    tension: 0.25
  }];

  if ($('mostrarParis').checked) {
    datasets.push(linea('Objetivo 1,5 °C', 1.5, '#E7C45B'), linea('Objetivo 2,0 °C', 2.0, '#D9534F'));
  }

  const texto = '#AEB7C4';
  grafica?.destroy();

  grafica = new Chart($('graficaTemperatura'), {
    type: 'line',
    data: { labels: visibles.map(r => formatoMes(r.anio, r.mes)), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { labels: { color: '#E8E8E8', usePointStyle: true, boxWidth: 8, font: { size: 10 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)} °C` } }
      },
      scales: {
        x: { ticks: { color: texto, maxTicksLimit: 7 }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: {
          title: { display: true, text: 'Anomalía respecto a 1880–1900 (°C)', color: texto },
          ticks: { color: texto, callback: v => `${v.toFixed(1)} °C` },
          grid: { color: 'rgba(255,255,255,0.08)' }
        }
      }
    }
  });
}

function alternarSonido() {
  sonidoActivo = !sonidoActivo;
  $('sonido').textContent = sonidoActivo ? 'Silenciar sonido' : 'Activar sonido';
  sonar();
}

function sonar() {
  Object.values(audios).forEach(a => { a.pause(); a.currentTime = 0; });
  if (!sonidoActivo || !visibles.length) return;

  const p = promedio();
  const audio = p < 0.5 ? audios.frio : p < 1 ? audios.transicion : audios.calentamiento;
  audio.play().catch(e => console.warn('El navegador no pudo reproducir el sonido:', e));
}