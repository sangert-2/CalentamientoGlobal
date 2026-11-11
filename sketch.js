
const CONFIG = {

  archivoCSV: 'Datos/GLB.Ts+dSST.csv',
  fechaMinima: '1926-01',


  referenciaDesde: 1880,
  referenciaHasta: 1900,


  umbralParis15: 1.5,
  umbralParis20: 2.0,


  limiteFrio: 0.5,
  limiteTransicion: 1.0,

  sonidos: {
    frio: 'Sonidos/Frío.mp3',
    transicion: 'Sonidos/Transicion.mp3',
    calentamiento: 'Sonidos/Calentamiento.mp3'
  }
};

const COLORES = {
  linea: '#F2A65A',
  relleno: 'rgba(242, 166, 90, 0.12)',
  paris15: '#E7C45B',
  paris20: '#D9534F',
  texto: '#AEB7C4',
  leyenda: '#E8E8E8',
  rejillaX: 'rgba(255,255,255,0.06)',
  rejillaY: 'rgba(255,255,255,0.08)'
};

let registros = [];           // Todos los datos mensuales del CSV
let registrosVisibles = [];   // Datos dentro del rango elegido

let grafica = null;
let referenciaPreindustrial = null;

let ultimoAnioDisponible = 0;
let ultimoMesDisponible = 0;

let sonidoActivo = false;
let audios = {};

const obtener = id => document.getElementById(id);

function formatoMes(anio, mes) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function aMesesTotales(fechaTexto) {
  const [anio, mes] = fechaTexto.split('-').map(Number);
  return anio * 12 + mes;
}

function obtenerAnomaliaPreindustrial(anomaliaNASA) {
  return anomaliaNASA - referenciaPreindustrial;
}

function calcularPromedioVisible() {
  const suma = registrosVisibles.reduce(
    (total, registro) =>
      total + obtenerAnomaliaPreindustrial(registro.anomalia),
    0
  );

  return suma / registrosVisibles.length;
}

document.addEventListener('DOMContentLoaded', iniciarExperiencia);

async function iniciarExperiencia() {
  prepararSonidos();
  conectarControles();
  await cargarDatosNASA();
}

function prepararSonidos() {
  audios = {
    frio: new Audio(CONFIG.sonidos.frio),
    transicion: new Audio(CONFIG.sonidos.transicion),
    calentamiento: new Audio(CONFIG.sonidos.calentamiento)
  };

  // Todos suenan en bucle
  Object.values(audios).forEach(audio => {
    audio.loop = true;
  });
}

function conectarControles() {
  obtener('aplicarFechas')?.addEventListener('click', aplicarFechas);
  obtener('restablecer')?.addEventListener('click', restablecer);
  obtener('sonido')?.addEventListener('click', alternarSonido);
  obtener('mostrarParis')?.addEventListener('change', actualizarGrafica);
}

async function cargarDatosNASA() {
  try {
    const respuesta = await fetch(CONFIG.archivoCSV);

    if (!respuesta.ok) {
      throw new Error('No se pudo cargar el archivo CSV');
    }

    const texto = await respuesta.text();
    registros = leerRegistrosCSV(texto);

    if (registros.length === 0) {
      throw new Error('El CSV no contiene registros mensuales válidos');
    }

    // Último mes con datos reales
    const ultimo = registros[registros.length - 1];
    ultimoAnioDisponible = ultimo.anio;
    ultimoMesDisponible = ultimo.mes;

    calcularReferenciaPreindustrial();
    configurarFechas();
    aplicarFechas();

    console.log('Datos NASA cargados:', registros.length);
    console.log('Último dato disponible:', ultimo);
    console.log('Referencia 1880-1900:', referenciaPreindustrial);

  } catch (error) {
    console.error('Error al cargar los datos:', error);

    const indicador = obtener('valorAnomalia');
    if (indicador) {
      indicador.textContent = 'Error al cargar los datos';
    }
  }
}

function leerRegistrosCSV(texto) {
  const lineas = texto.split(/\r?\n/);

  const indiceEncabezados = lineas.findIndex(linea =>
    linea.trim().startsWith('Year,')
  );

  if (indiceEncabezados === -1) {
    throw new Error('No se encontraron los encabezados del CSV');
  }

  const resultado = [];

  for (let i = indiceEncabezados + 1; i < lineas.length; i++) {
    const columnas = lineas[i].trim().split(',');

    if (columnas.length < 13) continue;

    const anio = Number(columnas[0]);
    if (!Number.isFinite(anio)) continue;

    // Columnas 1 a 12 = enero a diciembre
    for (let mes = 1; mes <= 12; mes++) {
      const valor = columnas[mes].trim();

      // Ignorar meses sin información
      if (valor === '' || valor === '***') continue;

      const anomalia = Number(valor);

      if (Number.isFinite(anomalia)) {
        resultado.push({ anio, mes, anomalia });
      }
    }
  }

  return resultado.sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

function calcularReferenciaPreindustrial() {
  const datosReferencia = registros.filter(registro =>
    registro.anio >= CONFIG.referenciaDesde &&
    registro.anio <= CONFIG.referenciaHasta
  );

  if (datosReferencia.length === 0) {
    throw new Error('No hay datos para calcular la referencia 1880-1900');
  }

  const suma = datosReferencia.reduce(
    (total, registro) => total + registro.anomalia,
    0
  );

  referenciaPreindustrial = suma / datosReferencia.length;
}

function fechaMaximaDisponible() {
  return formatoMes(ultimoAnioDisponible, ultimoMesDisponible);
}

function configurarFechas() {
  const selectorInicio = obtener('fechaInicio');
  const selectorFinal = obtener('fechaFinal');

  if (!selectorInicio || !selectorFinal) return;

  const fechaMaxima = fechaMaximaDisponible();

  [selectorInicio, selectorFinal].forEach(selector => {
    selector.type = 'month';
    selector.min = CONFIG.fechaMinima;
    selector.max = fechaMaxima;
  });

  selectorInicio.value = CONFIG.fechaMinima;
  selectorFinal.value = fechaMaxima;
}

function aplicarFechas() {
  const fechaInicial = obtener('fechaInicio')?.value;
  const fechaFinal = obtener('fechaFinal')?.value;

  if (!fechaInicial || !fechaFinal) return;

  const desde = aMesesTotales(fechaInicial);
  const hasta = aMesesTotales(fechaFinal);

  if (desde > hasta) {
    alert('La fecha inicial no puede ser posterior a la fecha final.');
    return;
  }

  registrosVisibles = registros.filter(registro => {
    const fecha = registro.anio * 12 + registro.mes;
    return fecha >= desde && fecha <= hasta;
  });

  actualizarGrafica();
  actualizarIndicadores();
  actualizarMapaVisual();

  if (sonidoActivo) {
    reproducirSonido();
  }
}

function crearLineaParis(etiqueta, valor, color, cantidad) {
  return {
    label: etiqueta,
    data: Array(cantidad).fill(valor),
    borderColor: color,
    borderDash: [6, 5],
    borderWidth: 1.5,
    pointRadius: 0,
    fill: false
  };
}

function actualizarGrafica() {
  const canvas = obtener('graficaTemperatura');

  if (!canvas || registrosVisibles.length === 0) return;

  const mostrarParis = obtener('mostrarParis')?.checked ?? true;

  const etiquetas = registrosVisibles.map(r => formatoMes(r.anio, r.mes));
  const valores = registrosVisibles.map(r =>
    obtenerAnomaliaPreindustrial(r.anomalia)
  );

  const conjuntos = [
    {
      label: 'Anomalía mensual global',
      data: valores,
      borderColor: COLORES.linea,
      backgroundColor: COLORES.relleno,
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 8,
      fill: true,
      tension: 0.25
    }
  ];

  if (mostrarParis) {
    conjuntos.push(
      crearLineaParis('Objetivo 1,5 °C', CONFIG.umbralParis15, COLORES.paris15, valores.length),
      crearLineaParis('Objetivo 2,0 °C', CONFIG.umbralParis20, COLORES.paris20, valores.length)
    );
  }

  if (grafica) {
    grafica.destroy();
  }

  grafica = new Chart(canvas, {
    type: 'line',
    data: { labels: etiquetas, datasets: conjuntos },
    options: opcionesGrafica()
  });
}

function opcionesGrafica() {
  return {
    responsive: true,
    maintainAspectRatio: false,

    interaction: {
      intersect: false,
      mode: 'index'
    },

    plugins: {
      legend: {
        labels: {
          color: COLORES.leyenda,
          usePointStyle: true,
          boxWidth: 8,
          font: { size: 10 }
        }
      },

      tooltip: {
        callbacks: {
          label: contexto =>
            `${contexto.dataset.label}: ${contexto.parsed.y.toFixed(2)} °C`
        }
      }
    },

    scales: {
      x: {
        ticks: {
          color: COLORES.texto,
          maxTicksLimit: 7
        },
        grid: { color: COLORES.rejillaX }
      },

      y: {
        title: {
          display: true,
          text: 'Anomalía respecto a 1880–1900 (°C)',
          color: COLORES.texto
        },
        ticks: {
          color: COLORES.texto,
          callback: valor => `${valor.toFixed(1)} °C`
        },
        grid: { color: COLORES.rejillaY }
      }
    }
  };
}

function actualizarIndicadores() {
  if (registrosVisibles.length === 0) return;

  const primero = registrosVisibles[0];
  const ultimo = registrosVisibles[registrosVisibles.length - 1];
  const promedio = calcularPromedioVisible();

  const indicador = obtener('valorAnomalia');
  const periodo = obtener('textoPeriodo');
  const periodoMapa = obtener('periodoMapa');

  if (indicador) {
    const signo = promedio >= 0 ? '+' : '';
    indicador.textContent = `${signo}${promedio.toFixed(2)} °C`;
  }

  if (periodo) {
    periodo.textContent =
      `${primero.mes}/${primero.anio} – ${ultimo.mes}/${ultimo.anio}`;
  }

  if (periodoMapa) {
    periodoMapa.textContent = `Período: ${primero.anio} – ${ultimo.anio}`;
  }
}

function actualizarMapaVisual() {
  if (registrosVisibles.length === 0) return;

  // La función actualizarMapa está definida en mapa.js
  if (typeof actualizarMapa === 'function') {
    actualizarMapa(calcularPromedioVisible());
  }
}

function alternarSonido() {
  sonidoActivo = !sonidoActivo;

  const boton = obtener('sonido');

  if (boton) {
    boton.textContent = sonidoActivo ? 'Silenciar sonido' : 'Activar sonido';
  }

  if (sonidoActivo) {
    reproducirSonido();
  } else {
    detenerSonidos();
  }
}

// Elige la pista según la anomalía media del período
function elegirAudio(promedio) {
  if (promedio < CONFIG.limiteFrio) return audios.frio;
  if (promedio < CONFIG.limiteTransicion) return audios.transicion;
  return audios.calentamiento;
}

function reproducirSonido() {
  if (!sonidoActivo || registrosVisibles.length === 0) return;

  detenerSonidos();

  const audio = elegirAudio(calcularPromedioVisible());

  audio.currentTime = 0;
  audio.play().catch(error => {
    console.warn('El navegador no pudo reproducir el sonido:', error);
  });
}

function detenerSonidos() {
  Object.values(audios).forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function restablecer() {
  const selectorInicio = obtener('fechaInicio');
  const selectorFinal = obtener('fechaFinal');
  const controlParis = obtener('mostrarParis');

  if (selectorInicio) selectorInicio.value = CONFIG.fechaMinima;
  if (selectorFinal) selectorFinal.value = fechaMaximaDisponible();
  if (controlParis) controlParis.checked = true;

  detenerSonidos();
  aplicarFechas();
}