# AyudaYa

Herramienta comunitaria creada tras el sismo del 10 de agosto de 2026 (magnitud
7,4, epicentro cerca de San José del Palmar, Chocó). No es un canal oficial:
complementa a la Cruz Roja Colombiana, la UNGRD y las alcaldías.

Dos módulos en una sola página:

| Módulo | Ruta | Qué resuelve |
| --- | --- | --- |
| Mapa de necesidades | `/` | Agua, alimento, refugio, atención médica, vías bloqueadas y rescates, con actualización en vivo |
| Buscador de personas | `/personas` | "Busco a alguien" y "estoy bien". Solo texto, sin mapa y sin direcciones exactas |
| Panel de moderación | `/admin` | Verificar, ocultar y eliminar contenido |

Este documento explica **cómo está construido y por qué**. Para poner una
instancia en marcha hacen falta un proyecto de Supabase, el esquema de
[`supabase/schema.sql`](supabase/schema.sql) y dos variables de entorno
(ver [`.env.example`](.env.example)).

---

## Índice

- [Contexto de diseño](#contexto-de-diseño)
- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Modelo de seguridad](#modelo-de-seguridad)
- [Funcionamiento sin conexión](#funcionamiento-sin-conexión)
- [Rendimiento](#rendimiento)
- [Privacidad](#privacidad)
- [Estructura del código](#estructura-del-código)
- [Desarrollo local](#desarrollo-local)
- [Puntos de extensión](#puntos-de-extensión)
- [Limitaciones conocidas](#limitaciones-conocidas)

---

## Contexto de diseño

Cuatro restricciones condicionan casi todas las decisiones del código. Conviene
tenerlas presentes antes de cambiar nada:

1. **La red está saturada, no ausente.** En una emergencia las antenas siguen en
   pie pero el ancho de banda por usuario se desploma. Eso implica presupuestos
   de bytes estrictos, topes de tiempo en toda petición y degradación por etapas
   en vez de pantallas de error.
2. **El dispositivo es un Android de gama baja.** Poca memoria, CPU lenta y un
   navegador que descarta la pestaña en cuanto se cambia de aplicación.
3. **Quien usa la app está bajo estrés.** Manos temblando, sol de frente,
   posiblemente de noche y con prisa. De ahí los 48 px mínimos en cualquier
   elemento tocable, el contraste alto y la ausencia de animaciones decorativas.
4. **Los datos son sensibles.** Nombres de desaparecidos y ubicaciones en un
   contexto con temor a saqueos. Cada campo que se pide tiene que justificarse.

---

## Arquitectura

No hay servidor propio. El navegador habla directamente con Supabase, y toda la
lógica de negocio vive en PostgreSQL:

```
   navegador (SPA React)
        |
        |  HTTPS
        v
   +---------------------------------------------+
   |  Supabase                                   |
   |                                             |
   |   PostgREST  ---->  PostgreSQL              |
   |   (/rest/v1)          |                     |
   |                       +-- RLS               |
   |   GoTrue              +-- funciones RPC     |
   |   (/auth/v1)          +-- esquema `privado` |
   |                                             |
   |   Realtime (WebSocket)                      |
   +---------------------------------------------+
```

### Por qué no se usa `@supabase/supabase-js`

El SDK oficial pesa unos 58 KB comprimidos e incluye Storage, Edge Functions y
un cliente de Postgres completo que este proyecto no utiliza. PostgREST y GoTrue
son APIs HTTP corrientes, así que [`src/lib/supabase.js`](src/lib/supabase.js)
habla con ellas mediante `fetch` en unas 150 líneas y 0 KB de dependencia.

De la familia oficial solo se carga `@supabase/realtime-js` (17 KB), y además de
forma diferida: los reportes se pintan antes de que exista el WebSocket. La
diferencia son 41 KB comprimidos fuera de la ruta crítica, varios segundos en
una conexión saturada.

El modelo de seguridad no cambia: la clave pública viaja en cada petición y son
las políticas de Row Level Security las que deciden qué se puede leer y escribir.

### Capas del cliente

| Capa | Archivos | Responsabilidad |
| --- | --- | --- |
| Transporte | `lib/supabase.js` | `fetch` a PostgREST y GoTrue, topes de tiempo, traducción de errores, Realtime diferido |
| Operaciones | `lib/api.js` | Una función por caso de uso, con reintentos y selección explícita de columnas |
| Resiliencia | `lib/cola.js`, `lib/usarConexion.js` | Cola de envíos pendientes y estado real de la red |
| Estado de vista | `modulos/*/usar*.js` | Hooks por módulo: reportes, borrador, cola |
| Presentación | `modulos/*/*.jsx`, `componentes/` | Componentes sin lógica de red |

### Tratamiento de errores

`lib/supabase.js` normaliza cualquier fallo a un `ErrorApp` con un campo
`motivo`, que es lo que decide el comportamiento del resto del sistema:

| `motivo` | Origen | Se reintenta | Se puede encolar |
| --- | --- | --- | --- |
| `red` | `fetch` rechazado, tope de tiempo, 5xx | Sí | Sí |
| `limite` | Cuota por IP agotada (P0001) | No de inmediato | Sí, con espera |
| `validacion` | CHECK, enum o `raise` de una RPC | No | No |
| `permiso` | 401, 403, RLS, token vencido | No | No |
| `configuracion` | Faltan variables de entorno | No | No |

Distinguir `red` de `validacion` es lo que evita el peor comportamiento posible:
reintentar en bucle algo que nunca va a ser aceptado.

---

## Modelo de datos

### `reportes_mapa`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | Lo genera el navegador (ver [idempotencia](#idempotencia)) |
| `tipo` | `tipo_reporte` | `agua`, `alimento`, `refugio`, `atencion_medica`, `via_bloqueada`, `rescate`, `otro` |
| `titulo` | `text` | 3 a 90 caracteres |
| `descripcion` | `text` | Opcional, máx. 400 |
| `lat`, `lng` | `float8` | Redondeados a 6 decimales (~11 cm). CHECK contra la caja de Colombia |
| `ciudad` | `text` | Máx. 40 |
| `contacto` | `text` | Opcional, público |
| `estado` | `estado_reporte` | `activo`, `resuelto`, `caducado` |
| `verificado` | `boolean` | Solo lo cambia moderación |
| `fuente_verificacion` | `text` | CHECK: obligatorio si `verificado` |
| `reportes_abuso` | `int` | Contador de denuncias |
| `created_at`, `actualizado_en` | `timestamptz` | `actualizado_en` alimenta la caducidad |

### `personas_busqueda`

Los mismos principios, más una columna generada:

```sql
nombre_normalizado text generated always as (public.normalizar_texto(nombre_completo)) stored
```

`normalizar_texto` quita tildes y pasa a minúsculas, con un índice GIN de
trigramas encima. Así "jose" encuentra a "José" sin recorrer la tabla. Su
equivalente en JavaScript es `normalizar()` en
[`src/lib/formato.js`](src/lib/formato.js): **si las dos implementaciones
divergen, la búsqueda por nombre deja de encontrar gente**. Hay una prueba de
paridad para eso.

### Esquema `privado`

Invisible para el navegador (`revoke all on schema privado`). Contiene lo que
nunca debe salir del servidor:

| Tabla | Contenido |
| --- | --- |
| `config` | Sales de hash, generadas al instalar |
| `administradores` | Allowlist de moderadores por `user_id` |
| `codigos` | Hash SHA-256 de los códigos de edición |
| `envios` | Huellas de IP para el límite de envíos, purgadas a las 24 h |
| `denuncias` | Una fila por IP y contenido denunciado |

---

## Modelo de seguridad

### El navegador no puede escribir en las tablas

`anon` solo tiene `SELECT`. Supabase concede `ALL` por defecto sobre las tablas
nuevas de `public`, así que el esquema lo revoca de forma explícita. Todas las
escrituras pasan por funciones `security definer`:

```
crear_reporte_mapa()
  |
  +-- 1. ¿ya existe este id?  -> devolver y salir (reintento idempotente)
  +-- 2. validar el código de edición
  +-- 3. limpiar y validar el texto
  +-- 4. exigir_limite()      -> cuota por IP
  +-- 5. INSERT ... on conflict (id) do nothing
  +-- 6. guardar el hash del código
```

Un `INSERT` directo desde la consola del navegador devuelve 401. No existe
policy de `INSERT` para `anon`, ni la habrá.

### Límite de envíos por IP, sin servidor intermedio

PostgREST expone las cabeceras HTTP a SQL en `request.headers`, así que
`privado.huella_ip()` lee `x-forwarded-for` directamente desde PostgreSQL. No
hace falta ninguna función serverless.

Las IP nunca se guardan en claro: solo `sha256(ip || sal_secreta)`, y las filas
se borran a las 24 horas.

Topes actuales, por IP y ventana de 10 minutos:

| Acción | Máximo |
| --- | --- |
| Crear reportes o registros de personas | 5 |
| Denunciar contenido | 20 |
| Cambiar el estado de algo propio | 20 |

### Códigos de edición

Al publicar algo, el navegador genera un código de 12 caracteres (60 bits,
alfabeto de 32 símbolos sin I, L, O ni U para que se pueda copiar a mano sin
confusiones). El servidor solo guarda su SHA-256 con sal, en un esquema al que
el navegador no tiene acceso.

Ese código es lo que permite marcar un reporte como resuelto o borrar un
registro de persona sin necesidad de cuentas de usuario.

### Idempotencia

Las dos funciones de creación aceptan el `id` y el `codigo` que genera el
cliente ([`src/lib/identificadores.js`](src/lib/identificadores.js)), y son
idempotentes: reenviar el mismo `id` devuelve la fila existente en lugar de
crear una segunda.

Esto no es un adorno. Es lo que hace segura la cola de envíos: en 3G saturada es
perfectamente normal que una petición llegue al servidor y se pierda la
respuesta. Sin idempotencia, cada reintento sembraría un duplicado en un mapa de
emergencia.

Que el cliente elija el `id` no abre ningún hueco de seguridad:

- Si el `id` ya existe, el `INSERT` no hace nada.
- El código **no** se sobrescribe, así que nadie puede apropiarse de un reporte
  ajeno reenviando su `id` con un código nuevo.
- Un reintento sobre algo ya guardado no consume cuota, porque la comprobación
  de existencia va antes que `exigir_limite()`.

### Moderación automática

Un registro con más de 5 denuncias desaparece solo de la vista pública, por
política de RLS, hasta que alguien lo revise. Cada IP solo puede denunciar una
vez el mismo elemento (clave primaria en `privado.denuncias`).

### Autenticación del panel

**No hay contraseña en una variable de entorno, y es deliberado.** En una SPA,
cualquier variable `VITE_*` acaba escrita en texto plano dentro del JavaScript
que descarga el navegador: se lee con "ver código fuente". Sería seguridad
aparente sobre datos de una emergencia real.

En su lugar se usa un único usuario de Supabase Auth con el registro público
desactivado. La sesión por sí sola no basta: `public.es_admin()` comprueba
además que el `user_id` esté en `privado.administradores`, y todas las policies
de moderación dependen de esa función.

Detalle a tener en cuenta al leer las pruebas: con RLS, un `UPDATE` sin permiso
**no lanza error**, simplemente afecta a 0 filas. La garantía que hay que
verificar es "0 filas modificadas", no "excepción lanzada".

### Prevención de XSS

Tres capas independientes:

1. React escapa todo lo que renderiza.
2. Las fichas del mapa son componentes de React, **no popups HTML de Leaflet**.
   El texto que escribe la gente nunca se pasa a un `innerHTML`.
3. `privado.limpiar_texto()` en el servidor elimina `<`, `>`, caracteres de
   control e invisibles, colapsa espacios y trunca. Protege también a cualquier
   consumidor futuro (exportaciones a CSV, paneles, integraciones) que no escape
   por su cuenta.

Las cabeceras `Content-Security-Policy` de [`vercel.json`](vercel.json) y
[`netlify.toml`](netlify.toml) cierran el círculo: sin `unsafe-inline` en
`script-src` y con `connect-src` limitado a Supabase.

---

## Funcionamiento sin conexión

Se puede rellenar y publicar un reporte con la red caída. El envío se guarda en
el dispositivo y sale solo en cuanto vuelve la señal.

```
  Publicar
     |
     +-- navigator.onLine === false ?  --> a la cola, sin tocar la red
     |
     +-- intento único (tope 8 s)
            |
            +-- éxito            -> publicado
            +-- motivo 'red'     -> a la cola
            +-- otro motivo      -> error en pantalla
```

### Decisiones que importan

**Un solo intento antes de encolar.** Quien reintenta de verdad es la cola. Con
la política general (3 intentos, espera creciente, tope de 12 s) el usuario se
quedaba casi 40 segundos mirando "Publicando…" antes de enterarse de que su
reporte estaba a salvo. Ahora el tope de los envíos es de 8 segundos
(`TOPE_ENVIO_MS`) y, si el navegador ya sabe que no hay red, ni siquiera se
intenta.

**Envío en serie, no en paralelo.** Vaciar la cola de golpe agotaría la cuota
por IP y desordenaría los reportes.

**La cola vive fuera de React.** [`src/lib/cola.js`](src/lib/cola.js) es un
almacén a nivel de módulo con suscripción. Así sigue vaciándose aunque quien
creó el envío haya cambiado de pestaña o cerrado el formulario. Los componentes
la consumen con el hook `useCola`.

**Lo pendiente se ve.** Un envío en cola se pinta en el mapa como un marcador
con borde discontinuo y un reloj de arena, y en la lista de personas como una
tarjeta marcada. Si no se viera, parecería que se perdió. Sobre un elemento
pendiente no se ofrecen acciones contra el servidor (denunciar, marcar
resuelto); solo cancelar el envío.

**Qué se descarta y qué no.** Un fallo de validación o de permiso saca el
elemento de la cola: reintentarlo daría siempre el mismo error y lo dejaría
atascado para siempre. Un fallo de red o de cuota lo conserva.

### Disparadores del vaciado

- Evento `online`.
- `visibilitychange` a visible. En Android es habitual volver a la aplicación
  con la red ya recuperada sin que se haya disparado ningún evento `online`.
- Temporizador mientras quede algo pendiente (30 s tras un corte, 3 min tras
  agotar la cuota).
- Botón "Enviar ahora" del aviso de pendientes.

### Otras defensas ante red mala

- **Borrador persistente.** Los campos del formulario del mapa viven en
  `useBorradorReporte`, fuera del componente, y se guardan en el dispositivo. Al
  pulsar "Señalar en el mapa" el formulario se desmonta; sin esto se perdería
  todo lo escrito. También sobrevive a que Android descarte la pestaña.
- **Caché de la última consulta.** Sin red se muestra el último estado conocido,
  siempre con su antigüedad a la vista.
- **Service worker.** ~90 líneas escritas a mano, sin Workbox. Red primero con
  tope de 4 s para las navegaciones, caché primero para `/assets/*` (que llevan
  hash en el nombre). Las teselas y las llamadas a Supabase no se cachean nunca:
  un dato viejo confunde más de lo que ayuda.

---

## Rendimiento

Peso de la primera carga del mapa, comprimido:

| Recurso | Tamaño |
| --- | --- |
| HTML, CSS y JS de arranque | ~13 KB |
| React | 45 KB |
| Leaflet y su CSS | 50 KB |
| Vista del mapa y capa de datos | ~10 KB |
| **Total antes de ver el mapa** | **~118 KB** |
| Realtime (diferido, tras el primer pintado) | 17 KB |

Cómo se consigue:

- **CSS crítico en línea** en `index.html`. El banner y el esqueleto se pintan
  en el primer viaje de red, antes de que llegue ningún JavaScript.
- **División por rutas.** Quien entra al mapa no descarga el panel de
  moderación, y viceversa.
- **Leaflet directo**, no `react-leaflet` (unos 12 KB extra). Lo único que hace
  falta es sincronizar una lista de marcadores: treinta líneas de diff manual.
- **Marcadores como `divIcon` con emoji.** Cero peticiones de imagen, frente a
  las dos que gasta el marcador por defecto de Leaflet (icono y sombra).
- **Enrutador propio** de 40 líneas en lugar de react-router (unos 15 KB). Hay
  tres rutas y ninguna con parámetros.
- **CSS a mano**, sin framework. El archivo entero pesa menos que el logotipo de
  cualquier librería de componentes.
- **Filtrado en el cliente.** La lista completa vive en memoria; marcar una
  casilla no dispara una consulta. A escala de cientos de reportes sale mucho
  más barato que ir al servidor.
- **Selección explícita de columnas** en cada consulta, nunca `select=*`.

---

## Privacidad

Ley 1581 de 2012 (Habeas Data), aplicada a decisiones concretas:

- **Nunca se piden direcciones exactas.** El campo es "barrio o zona", con aviso
  al lado y límite de 80 caracteres.
- **El módulo de personas no tiene mapa.** Cruzar un nombre con una ubicación
  exacta es justo lo que hay que evitar cuando hay temor a saqueos.
- **Autorización previa, expresa e informada.** El aviso se muestra completo
  antes del formulario, no detrás de un enlace, y hay que marcar una casilla
  explícita para publicar.
- **Derecho de supresión.** Quien publica puede borrar su registro en cualquier
  momento con su código, sin pedir permiso a nadie.
- **Minimización.** Las IP se guardan hasheadas y se borran a las 24 h. Con
  `pg_cron` activado (sección 9 del esquema), los registros de personas se
  eliminan a los 90 días y los reportes cerrados a los 30.
- **Sin analítica, sin cookies, sin rastreadores.** Ninguno.

---

## Estructura del código

```
.
├── supabase/schema.sql        Esquema completo: tablas, RLS, funciones, Realtime
├── index.html                 Cáscara con CSS crítico en línea
├── public/
│   ├── sw.js                  Service worker mínimo
│   ├── icono.svg              Icono en SVG (cero binarios en el repositorio)
│   └── manifest.webmanifest
└── src/
    ├── App.jsx                Enrutado y estructura
    ├── main.jsx               Montaje y arranque de la cola
    ├── estilos.css            Todos los estilos
    ├── lib/
    │   ├── supabase.js        Cliente HTTP a PostgREST y GoTrue, Realtime diferido
    │   ├── api.js             Operaciones de datos con reintentos
    │   ├── cola.js            Cola de envíos pendientes
    │   ├── usarCola.js        Puente entre la cola y React
    │   ├── identificadores.js Generación de uuid y códigos de edición
    │   ├── constantes.js      Tipos, ciudades, umbrales  (empieza por aquí)
    │   ├── formato.js         Fechas, teléfonos, normalización de nombres
    │   ├── almacenamiento.js  localStorage a prueba de fallos
    │   ├── enrutador.js       Enrutador de 40 líneas
    │   └── usarConexion.js    Estado real de la conexión
    ├── componentes/           Banner, hoja deslizante, avisos, esqueletos
    └── modulos/
        ├── mapa/              Leaflet, filtros, formulario, ficha, borrador
        ├── personas/          Buscador, tarjetas, formulario
        └── admin/             Panel de moderación
```

### Convenciones

- **Identificadores en español**, incluidos los de React (`establecerCargando`
  en vez de `setLoading`). El dominio es español y quien mantenga esto
  probablemente también.
- **Los comentarios explican el porqué, no el qué.** Si un comentario describe
  lo que ya dice el código, sobra.
- **Ningún componente hace peticiones directamente.** Todo pasa por `lib/api.js`.
- **Prettier** con la configuración de [`.prettierrc`](.prettierrc).

---

## Desarrollo local

```bash
cp .env.example .env      # pega la URL y la clave pública de tu proyecto Supabase
npm install
npm run dev               # http://localhost:5173
```

Si aparece la pantalla "Falta configurar la aplicación", revisa el `.env` y
reinicia: las variables `VITE_*` se leen al arrancar y se incrustan al compilar,
no en caliente.

Sin `VITE_SUPABASE_URL` la aplicación no arranca a ciegas: muestra una pantalla
que explica qué falta.

---

## Puntos de extensión

**Añadir una ciudad.** Edita `CIUDADES` en
[`src/lib/constantes.js`](src/lib/constantes.js) con su centro y zoom. La base
de datos acepta cualquier texto de hasta 40 caracteres; no hay que tocar SQL.

**Añadir un tipo de reporte.** `TIPOS_REPORTE` en `constantes.js` y un valor
nuevo en el enum `tipo_reporte` (`alter type ... add value`).

**Cambiar el umbral de ocultado automático.** Está en tres sitios que deben
coincidir: las dos policies `lectura_publica_*` del esquema y `UMBRAL_ABUSO` en
`constantes.js`.

**Cambiar el límite de envíos.** Los argumentos de `privado.exigir_limite()` en
cada función de `supabase/schema.sql`.

**Cambiar las 48 horas de caducidad.** `HORAS_CADUCIDAD` en `constantes.js` y el
`interval '48 hours'` de `public.marcar_caducados()`. Se calcula en los dos
sitios a propósito: en la base de datos de forma oportunista y por cron, y
también en el navegador, para que funcione aunque no se configure nada.

**Activar las tareas programadas.** Database, Extensions, activar `pg_cron`, y
ejecutar la sección 9 del esquema (viene comentada).

**Añadir otro moderador.** Crear el usuario en Supabase Auth e insertarlo en
`privado.administradores`.

---

## Limitaciones conocidas

- **Marcadores superpuestos.** Dos reportes en el mismo punto se tapan. Agrupar
  marcadores costaría unos 20 KB de librería; si el mapa se satura en una zona
  concreta, es lo primero que habría que añadir.
- **Teselas de OpenStreetMap.** La
  [política de uso](https://operations.osmfoundation.org/policies/tiles/) del
  servidor comunitario no está pensada para tráfico alto. Si la herramienta se
  populariza, cambiar la URL en
  [`src/modulos/mapa/Mapa.jsx`](src/modulos/mapa/Mapa.jsx) por un proveedor con
  capa gratuita (Carto, MapTiler) y ajustar `img-src` en `vercel.json` y
  `netlify.toml`.
- **El límite por IP es por IP.** Una red móvil con NAT de operador puede hacer
  que varias personas del mismo barrio compartan cuota. Es un riesgo asumido a
  cambio de no exigir registro; si molesta, subir el tope de 5.
- **La moderación es humana.** No hay filtro automático de contenido: alguien
  tiene que mirar `/admin`. Con mucho tráfico, ese es el cuello de botella.
- **Los códigos de edición se pierden con los datos del navegador.** Por eso la
  interfaz insiste en anotarlos. No hay recuperación posible: es el precio de no
  pedir registro.
- **Sin pruebas automatizadas en el repositorio.** El esquema se validó contra
  PostgreSQL y PostgREST reales, y los recorridos completos (con red y sin ella)
  en navegador, pero esas pruebas no quedaron incluidas aquí.

---

## Licencia y créditos

**Código: licencia MIT** (ver [`LICENSE`](LICENSE)). Úsalo, cópialo y adáptalo
para cualquier emergencia. No hace falta pedir permiso ni avisar.

**Datos de mapa: © colaboradores de
[OpenStreetMap](https://www.openstreetmap.org/copyright), bajo ODbL.** Es una
licencia distinta y no la cubre la MIT: si redistribuyes teselas o derivas datos
de OSM, la atribución del mapa tiene que seguir visible. Por eso el control de
atribución de Leaflet no se puede quitar.

**Los datos que publica la gente en una instancia no son tuyos.** Son datos
personales de terceros bajo la Ley 1581 de 2012. La licencia del código no te
autoriza a reutilizarlos, venderlos ni exportarlos con otra finalidad.
