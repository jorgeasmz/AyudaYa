/**
 * Constantes compartidas por toda la aplicación.
 *
 * Si añades una ciudad aquí, añádela también a la app: la base de datos acepta
 * cualquier texto de hasta 40 caracteres, así que basta con tocar este archivo.
 */

/** Tipos de reporte del mapa. El `valor` coincide con el enum `tipo_reporte`. */
export const TIPOS_REPORTE = [
  {
    valor: 'agua',
    etiqueta: 'Agua',
    emoji: '💧',
    color: '#0284c7',
    ayuda: 'Punto de agua potable, carrotanque, filtro o solicitud de agua',
  },
  {
    valor: 'alimento',
    etiqueta: 'Alimento',
    emoji: '🍞',
    color: '#b45309',
    ayuda: 'Olla comunitaria, entrega de mercados o solicitud de comida',
  },
  {
    valor: 'refugio',
    etiqueta: 'Refugio',
    emoji: '🏠',
    color: '#6d28d9',
    ayuda: 'Albergue, casa que recibe personas o solicitud de techo',
  },
  {
    valor: 'atencion_medica',
    etiqueta: 'Atención médica',
    emoji: '🏥',
    color: '#be123c',
    ayuda: 'Puesto de salud, brigada, medicamentos o solicitud de atención',
  },
  {
    valor: 'via_bloqueada',
    etiqueta: 'Vía bloqueada',
    emoji: '🚧',
    color: '#c2410c',
    ayuda: 'Derrumbe, puente caído, calle cerrada o aviso de paso imposible',
  },
  {
    valor: 'rescate',
    etiqueta: 'Rescate',
    emoji: '🆘',
    color: '#dc2626',
    ayuda: 'Personas atrapadas, rescate en curso o solicitud urgente de ayuda',
  },
  {
    valor: 'otro',
    etiqueta: 'Necesidad o recurso',
    emoji: '📍',
    color: '#475569',
    ayuda: 'Pañales, guantes, linternas, palas, picos o cualquier otra solicitud o recurso',
  },
];

/** Índice por valor, para no recorrer el array en cada render. */
export const TIPOS_POR_VALOR = Object.fromEntries(
  TIPOS_REPORTE.map((t) => [t.valor, t])
);

export const TIPO_POR_DEFECTO = TIPOS_POR_VALOR.otro;

export function tipoDe(valor) {
  return TIPOS_POR_VALOR[valor] || TIPO_POR_DEFECTO;
}

/** Ciudades del selector. `centro` sirve para encuadrar el mapa. */
export const CIUDADES = [
  { nombre: 'San José del Palmar', centro: [4.8967, -76.2264], zoom: 13 },
  { nombre: 'Cali', centro: [3.4516, -76.532], zoom: 12 },
  { nombre: 'Zarzal', centro: [4.3947, -76.0707], zoom: 13 },
  { nombre: 'Cartago', centro: [4.7463, -75.9117], zoom: 13 },
  { nombre: 'Pereira', centro: [4.8133, -75.6961], zoom: 13 },
  { nombre: 'Manizales', centro: [5.0703, -75.5138], zoom: 13 },
  { nombre: 'Armenia', centro: [4.5339, -75.6811], zoom: 13 },
  { nombre: 'Popayán', centro: [2.4448, -76.6147], zoom: 12 },
  { nombre: 'Otra', centro: null, zoom: null },
];

export const NOMBRES_CIUDADES = CIUDADES.map((c) => c.nombre);

/** Encuadre inicial: toda la región afectada (Chocó - Eje Cafetero - Valle). */
export const VISTA_INICIAL = { centro: [4.7, -76.2], zoom: 8 };

/** Tras 48 h sin actualizarse, un reporte se considera caducado. */
export const HORAS_CADUCIDAD = 48;

/** A partir de aquí el reporte se oculta solo (coincide con la policy de RLS). */
export const UMBRAL_ABUSO = 5;

/** Tope de registros por consulta. Si se alcanza, se avisa al usuario. */
export const LIMITE_REPORTES = 800;
export const LIMITE_PERSONAS = 200;

export const TIPOS_PERSONA = [
  {
    valor: 'busco_a_alguien',
    etiqueta: 'Busco a alguien',
    emoji: '🔎',
    color: '#b45309',
  },
  {
    valor: 'estoy_bien',
    etiqueta: 'Estoy bien',
    emoji: '💚',
    color: '#15803d',
  },
];

export const TIPOS_PERSONA_POR_VALOR = Object.fromEntries(
  TIPOS_PERSONA.map((t) => [t.valor, t])
);

/** Teléfonos oficiales. Se muestran en el banner y en la pantalla de error. */
export const TELEFONOS_OFICIALES = [
  { nombre: 'Emergencias', numero: '123' },
  { nombre: 'Cruz Roja Colombiana', numero: '132' },
  { nombre: 'Defensa Civil', numero: '144' },
  { nombre: 'Bomberos', numero: '119' },
];
