# AyudaYa

Herramienta comunitaria creada tras el sismo del 10 de agosto de 2026 (magnitud
7,4, epicentro cerca de San José del Palmar, Chocó). No es un canal oficial:
complementa a la Cruz Roja Colombiana, la UNGRD y las alcaldías.

| Módulo | Ruta | Qué hace |
| --- | --- | --- |
| Mapa | `/` | Agua, alimento, refugio, atención médica, vías bloqueadas, rescates y mascotas. Con dirección exacta. Se actualiza en vivo y permite buscar lugares públicos o ubicarte en el mapa |
| Personas | `/personas` | "Busco a alguien" y "estoy bien". Solo texto, sin mapa |
| Moderación | `/admin` | Cambiar estado y eliminar contenido. No verifica nada |

React + Vite + Leaflet contra Supabase. Sin servidor propio: la lógica de
negocio vive en PostgreSQL.

---

## Puesta en marcha

Variables de entorno (`.env` en local, panel del proveedor en producción):

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Sí | URL del proyecto de Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sí | Clave pública. Es pública por diseño: protege la RLS, no el secreto |
| `VITE_URL_GEOCODIFICACION` | No | Servidor de autocompletado de direcciones. Vacío usa Nominatim |

La base de datos se crea ejecutando [`supabase/schema.sql`](supabase/schema.sql)
entero en el SQL Editor de Supabase. Es idempotente: se puede reejecutar.
Después, [`supabase/diagnostico.sql`](supabase/diagnostico.sql) confirma en ocho
comprobaciones que los permisos y la RLS quedaron como deben.

Al crear el proyecto, Supabase pregunta por la Data API. Los ajustes correctos
son: **Data API activada**, **exposición automática de tablas desactivada** (el
esquema concede permisos de forma explícita) y **RLS automática activada**.

Si sale la pantalla "Falta configurar la aplicación", revisa el `.env` y
reinicia. Las variables `VITE_*` se incrustan **al compilar**, no se leen en
caliente: cambiarlas en producción exige volver a desplegar.

---

## Antes de tocar el código

Diez cosas que no se deducen leyendo los archivos y que causan bugs si se
ignoran.

**1. El navegador no puede escribir en las tablas.** `anon` solo tiene `SELECT`.
Todas las escrituras pasan por funciones `security definer` que validan, limpian
y aplican el límite por IP. Un `INSERT` directo devuelve 401. No hay policy de
`INSERT` para `anon`, ni debe haberla.

**2. `normalizar()` en JS y `normalizar_texto()` en SQL tienen que dar el mismo
resultado.** La búsqueda de personas usa una columna generada
(`nombre_normalizado`) para encontrar "José" escribiendo "jose". Si las dos
implementaciones divergen, la búsqueda deja de encontrar gente.
Ver [`src/lib/formato.js`](src/lib/formato.js) y la sección 2.1 del esquema.

**3. El `id` y el código de edición los genera el navegador**, no el servidor
([`src/lib/identificadores.js`](src/lib/identificadores.js)). Las funciones de
creación son idempotentes: reenviar el mismo `id` devuelve la fila existente en
lugar de duplicarla. Esto es lo que permite encolar envíos sin conexión, porque
en 3G saturada es normal que la petición llegue y se pierda la respuesta. No lo
"arregles" devolviéndolo al servidor.

**4. Se puede publicar sin red.** El envío se guarda en el dispositivo
([`src/lib/cola.js`](src/lib/cola.js)) y sale solo al recuperar la señal. Por
eso los envíos hacen **un solo intento** con tope de 8 segundos: quien reintenta
de verdad es la cola. Con la política general (3 intentos, 12 s) el usuario se
quedaba 40 segundos mirando "Publicando…".

**5. La contraseña del panel no está en una variable de entorno, a propósito.**
Cualquier `VITE_*` acaba en texto plano dentro del JS que descarga el navegador.
En su lugar hay un único usuario de Supabase Auth con registro público
desactivado, y `public.es_admin()` comprueba además que esté en
`privado.administradores`.

**6. Con RLS, un `UPDATE` sin permiso no lanza error: afecta a 0 filas.**
Tenlo en cuenta al escribir pruebas o al depurar moderación.

**7. Se admiten direcciones exactas, a propósito.** Es una decisión de producto:
en una emergencia, "Carrera 5 #12-34" vale más que "barrio Obrero". El texto se
sanea y se recorta a 140 caracteres, pero no se restringe su contenido. Lo único
que la interfaz conserva es una línea diciendo que lo publicado es visible para
cualquiera.

**8. No hay verificación por una autoridad, y es deliberado.** Nadie va a
revisar cientos de reportes en una emergencia, y ningún organismo va a validar
una herramienta informal. En su lugar hay tres mecanismos que funcionan solos:

- **Confirmaciones.** Cualquiera puede pulsar "sigue aquí". Una por IP y
  reporte. Sube el contador que se ve, compensa denuncias y refresca
  `actualizado_en`, así que un reporte confirmado no caduca a las 48 h y uno que
  nadie confirma se apaga solo.
- **Visibilidad por saldo.** Un reporte desaparece cuando las denuncias le sacan
  3 a las confirmaciones. Es un saldo, no un contador suelto: una persona
  malintencionada no tumba lo que otras diez confirmaron, y un reporte falso sin
  apoyo se cae con tres avisos. La fórmula vive en las policies
  `lectura_publica_*` y en `UMBRAL_OCULTAR`; deben coincidir.
- **Detección de repetidos.** Al fijar la ubicación se buscan reportes del mismo
  tipo a menos de 150 m y se ofrece confirmar el existente en lugar de publicar
  otro. Convierte un duplicado en una señal que refuerza el original. Avisa,
  nunca bloquea: puede haber dos puntos de agua en la misma manzana.

**9. El autocompletado de direcciones usa Nominatim, que limita a una petición
por segundo.** Por eso hay rebote de 600 ms en el campo e intervalo mínimo entre
llamadas en [`src/lib/geocodificacion.js`](src/lib/geocodificacion.js). Su
política exige identificar la aplicación, así que `Referrer-Policy` es
`strict-origin-when-cross-origin` y no `no-referrer`: envía el origen, no la
ruta. Con tráfico real, cambia de proveedor con `VITE_URL_GEOCODIFICACION`.

**10. No añadas sobrecargas a las RPC de creación.** Hubo una que omitía `p_tipo`
y lo rellenaba con `'otro'`: quitaba un PGRST202 y, a cambio, la app guardó
todos los reportes como "Otro" sin que nadie se enterara. Si PostgREST no
encuentra la función, el cliente manda mal los parámetros. `diagnostico.sql`
comprueba que solo exista una firma por función.

---

## Cómo encaja

```
  navegador (SPA React)
       |  HTTPS
       v
  Supabase
    PostgREST (/rest/v1) ---> PostgreSQL: RLS + funciones RPC + esquema privado
    GoTrue    (/auth/v1)      (solo para el panel de moderación)
    Realtime  (WebSocket)     (solo para el mapa, carga diferida)
```

No se usa `@supabase/supabase-js` (58 KB comprimidos). PostgREST y GoTrue son
APIs HTTP corrientes, así que [`src/lib/supabase.js`](src/lib/supabase.js) habla
con ellas por `fetch`. De la familia oficial solo se carga
`@supabase/realtime-js` (17 KB), y de forma diferida. La primera carga del mapa
son unos 118 KB comprimidos.

Todo fallo se normaliza a un `ErrorApp` con un campo `motivo`, que decide el
comportamiento del resto del sistema:

| `motivo` | Se reintenta | Se encola |
| --- | --- | --- |
| `red` | Sí | Sí |
| `limite` (cuota por IP agotada) | Tras esperar | Sí |
| `validacion`, `permiso`, `configuracion` | No | No |

---

## Estructura

```
supabase/schema.sql        Tablas, RLS, funciones, Realtime. Fuente de verdad del modelo
src/
  lib/
    constantes.js          Tipos, ciudades, umbrales   <- empieza por aquí
    supabase.js            Cliente HTTP a PostgREST y GoTrue
    api.js                 Una función por caso de uso
    cola.js                Envíos pendientes sin conexión
    identificadores.js     uuid y códigos de edición
    formato.js             Fechas, teléfonos, normalización de nombres
    almacenamiento.js      localStorage a prueba de fallos
    enrutador.js           Enrutador de 40 líneas
  componentes/             Banner, hoja deslizante, avisos, esqueletos
  modulos/mapa/            Leaflet, filtros, formulario, ficha, borrador, búsqueda de lugares y ubicación
  modulos/personas/        Buscador, tarjetas, formulario
  modulos/admin/           Panel de moderación
public/sw.js               Service worker mínimo, sin Workbox
```

Ningún componente hace peticiones directamente: todo pasa por `lib/api.js`.

---

## Ajustes habituales

| Qué | Dónde |
| --- | --- |
| Añadir una ciudad | `CIUDADES` en `constantes.js`. No hay que tocar SQL |
| Añadir un tipo de reporte | `TIPOS_REPORTE` en `constantes.js` y `alter type tipo_reporte add value` (ver `mascotas` como ejemplo) |
| Comprobar la instalación | `supabase/diagnostico.sql` en el SQL Editor: ocho comprobaciones, todas deben dar `t` |
| Revisar el código antes de desplegar | `npm run lint`. Vite compila aunque una variable no exista; ESLint no |
| Umbral de ocultado automático | Tres sitios que deben coincidir: las dos policies `lectura_publica_*` y `UMBRAL_OCULTAR` |
| Límite de envíos por IP | Argumentos de `privado.exigir_limite()` en el esquema |
| Caducidad de 48 h | `HORAS_CADUCIDAD` en `constantes.js` y el `interval` de `marcar_caducados()` |
| Purga automática de datos | Activar `pg_cron` y ejecutar la sección 9 del esquema |
| Radio de detección de repetidos | `RADIO_DUPLICADOS` en `constantes.js` |
| Cuántas confirmaciones destacan un reporte | `CONFIRMACIONES_DESTACADO` en `constantes.js` |
| Búsqueda de lugares públicos | Buscador de ubicación en `modulos/mapa/Mapa.jsx` y CSP de Vercel para Nominatim |
| Añadir un moderador | Crear el usuario en Supabase Auth e insertarlo en `privado.administradores` |
| Cambiar el proveedor de mapas | URL de teselas en `modulos/mapa/Mapa.jsx` y `img-src` en `vercel.json` y `netlify.toml` |

---

## Licencia

**Código: MIT** (ver [`LICENSE`](LICENSE)). Cópialo y adáptalo para cualquier
emergencia sin pedir permiso.

Dos cosas que la MIT no cubre:

- Los datos de mapa son de [OpenStreetMap](https://www.openstreetmap.org/copyright)
  bajo ODbL. Por eso la atribución de Leaflet no se puede quitar.
- Los datos que publica la gente en una instancia son datos personales de
  terceros bajo la Ley 1581 de 2012. La licencia del código no autoriza a
  reutilizarlos.
