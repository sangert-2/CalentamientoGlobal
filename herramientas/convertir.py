import json
import numpy as np
import xarray as xr

ENTRADA = "herramientas/gistemp.nc"
SALIDA = "Datos/mapa_calor.json"
BLOQUE = 3  # 3 celdas de 2° = bloques de 6°

ds = xr.open_dataset(ENTRADA)
print("Variables encontradas:", list(ds.data_vars))

temp = ds["tempanomaly"]  # dimensiones: time, lat, lon

# Referencia 1880-1900 (promedio global ponderado por latitud)
pesos = np.cos(np.deg2rad(ds["lat"]))
ref = temp.sel(time=slice("1880-01-01", "1900-12-31"))
desplazamiento = float(ref.weighted(pesos).mean(dim=("time", "lat", "lon")))
print("Desplazamiento a 1880-1900:", round(desplazamiento, 3))

# Promedio anual y paso a referencia 1880-1900
anual = temp.groupby("time.year").mean("time", skipna=True) - desplazamiento

# Agrupar en bloques de 6° x 6°
bloques = anual.coarsen(lat=BLOQUE, lon=BLOQUE, boundary="trim").mean()

datos = {}
for anio in bloques["year"].values:
    valores = bloques.sel(year=anio).values.flatten()
    # Valores en centésimas de °C (enteros) para que el archivo pese poco
    datos[int(anio)] = [
        None if np.isnan(v) else int(round(float(v) * 100)) for v in valores
    ]

salida = {
    "lat": [round(float(v), 2) for v in bloques["lat"].values],
    "lon": [round(float(v), 2) for v in bloques["lon"].values],
    "escala": 100,
    "datos": datos,
}

with open(SALIDA, "w") as archivo:
    json.dump(salida, archivo, separators=(",", ":"))

print("Listo:", SALIDA)
print("Años:", min(datos), "a", max(datos))
print("Celdas por año:", len(next(iter(datos.values()))))