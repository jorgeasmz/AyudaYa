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
    valor: 'mascotas',
    etiqueta: 'Mascotas',
    emoji: '🐾',
    color: '#0f766e',
    ayuda: 'Animales perdidos, rescate, comida o refugio para mascotas',
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
/**
 * Municipios afectados por el sismo. Coordenadas del casco urbano,
 * comprobadas contra OpenStreetMap: el centroide del límite municipal cae
 * en el campo en los municipios grandes y rurales.
 *
 * Van de norte a sur por zona (Chocó, Eje Cafetero, Valle, Cauca) para que
 * la lista se recorra igual que el mapa. `Otra` cubre cualquier otro sitio,
 * incluido dónde esté quien busca desde fuera de la región.
 */
export const CIUDADES = [
  { nombre: 'Quibdó', centro: [5.6913, -76.6531], zoom: 12 },
  { nombre: 'Istmina', centro: [5.1593, -76.6855], zoom: 13 },
  { nombre: 'Sipí', centro: [4.6532, -76.6441], zoom: 14 },
  { nombre: 'San José del Palmar', centro: [4.895, -76.235], zoom: 13 },
  { nombre: 'Manizales', centro: [5.0669, -75.5067], zoom: 12 },
  { nombre: 'Pereira', centro: [4.8143, -75.6947], zoom: 12 },
  { nombre: 'Dosquebradas', centro: [4.834, -75.6713], zoom: 13 },
  { nombre: 'La Virginia', centro: [4.8996, -75.8826], zoom: 14 },
  { nombre: 'Armenia', centro: [4.5363, -75.6724], zoom: 12 },
  { nombre: 'Cartago', centro: [4.7465, -75.9121], zoom: 13 },
  { nombre: 'La Unión', centro: [4.5319, -76.1032], zoom: 13 },
  { nombre: 'Roldanillo', centro: [4.4091, -76.1544], zoom: 13 },
  { nombre: 'Zarzal', centro: [4.3939, -76.0706], zoom: 13 },
  { nombre: 'Calima Darién', centro: [3.9318, -76.4842], zoom: 13 },
  { nombre: 'Buenaventura', centro: [3.8882, -77.0738], zoom: 12 },
  { nombre: 'Cali', centro: [3.452, -76.5325], zoom: 12 },
  { nombre: 'Popayán', centro: [2.4422, -76.6072], zoom: 12 },
  { nombre: 'Otra', centro: null, zoom: null },
];

export const NOMBRES_CIUDADES = CIUDADES.map((c) => c.nombre);

/** Encuadre inicial: toda la región afectada (Chocó - Eje Cafetero - Valle). */
export const VISTA_INICIAL = { centro: [4.07, -76.29], zoom: 7 };

/** Tras 48 h sin actualizarse, un reporte se considera caducado. */
export const HORAS_CADUCIDAD = 48;

/**
 * Un reporte se oculta cuando las denuncias le sacan esta ventaja a las
 * confirmaciones. Debe coincidir con las policies `lectura_publica_*`.
 */
export const UMBRAL_OCULTAR = 3;

/** A partir de estas confirmaciones el reporte se destaca en el mapa. */
export const CONFIRMACIONES_DESTACADO = 2;

/** Radio para detectar reportes repetidos, en metros. */
export const RADIO_DUPLICADOS = 150;

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
