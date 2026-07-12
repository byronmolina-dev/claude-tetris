---
name: clima
description: Consulta el clima actual de una ciudad usando la API gratuita Open-Meteo (sin API key). Úsala cuando el usuario pida el clima, temperatura o pronóstico de un lugar (ej. "/clima Madrid", "¿qué clima hace en Quito?").
---

# Clima (Open-Meteo)

Obtiene el clima actual de una ciudad usando las APIs públicas y gratuitas de Open-Meteo (no requieren API key).

## Cuándo usar esta skill

- El usuario escribe `/clima <ciudad>` o pregunta por el clima/temperatura de un lugar.
- Si no se indica ninguna ciudad, pregunta al usuario cuál ciudad quiere consultar antes de continuar.

## Pasos

1. **Geocodificar la ciudad** con WebFetch para obtener latitud/longitud:

   ```
   https://geocoding-api.open-meteo.com/v1/search?name=<CIUDAD>&count=1&language=es&format=json
   ```

   - `<CIUDAD>` debe ir codificada para URL (espacios como `%20` o `+`).
   - Si `results` viene vacío, informa al usuario que no se encontró la ciudad y pide que aclare el nombre (puede ayudar agregar el país, ej. "Springfield, US").
   - Del primer resultado toma: `latitude`, `longitude`, `name`, `country`, `timezone`.

2. **Consultar el clima actual** con WebFetch usando esas coordenadas:

   ```
   https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto
   ```

3. **Interpretar `weather_code`** (código WMO) usando esta tabla resumida:

   | Código | Descripción |
   |---|---|
   | 0 | Despejado |
   | 1, 2, 3 | Parcialmente nublado / Nublado |
   | 45, 48 | Niebla |
   | 51, 53, 55 | Llovizna |
   | 56, 57 | Llovizna helada |
   | 61, 63, 65 | Lluvia (ligera/moderada/fuerte) |
   | 66, 67 | Lluvia helada |
   | 71, 73, 75 | Nieve (ligera/moderada/fuerte) |
   | 77 | Granizo fino |
   | 80, 81, 82 | Chubascos (ligeros/moderados/violentos) |
   | 85, 86 | Chubascos de nieve |
   | 95 | Tormenta eléctrica |
   | 96, 99 | Tormenta con granizo |

4. **Presentar el resultado** al usuario en español, de forma breve, incluyendo:
   - Ciudad y país (del paso 1).
   - Condición (de la tabla anterior).
   - Temperatura actual y sensación térmica (`temperature_2m`, `apparent_temperature`, en °C).
   - Humedad relativa (`relative_humidity_2m`, en %).
   - Viento (`wind_speed_10m`, en km/h).
   - Precipitación si `precipitation` > 0.

## Notas

- No requiere API key ni configuración adicional.
- Todas las peticiones son HTTPS GET simples vía la herramienta WebFetch.
- Si el usuario pide pronóstico de varios días en vez de clima actual, se puede añadir el parámetro `daily=temperature_2m_max,temperature_2m_min,weather_code` a la URL del paso 2.
