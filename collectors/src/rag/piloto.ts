/**
 * Normas del piloto vertical. Esta lista NO fetchea: documenta qué leyes
 * cubre el eje salud + datos/transparencia + infancia/víctimas, para que el
 * workflow de recolección y un humano sepan el universo sin abrir PLAN-V2.
 *
 * Las dos últimas (1581, 1712) no cargaban por el troceador; el splitter y
 * la paginación existen precisamente para que dejen de ser un hueco.
 */

export interface NormaPiloto {
  readonly tipo: "Ley";
  readonly numero: string;
  readonly anio: number;
  readonly eje: string;
}

export const PILOTO_ARTICULADO: readonly NormaPiloto[] = [
  { tipo: "Ley", numero: "1616", anio: 2013, eje: "salud mental" },
  { tipo: "Ley", numero: "1751", anio: 2015, eje: "estatutaria de salud" },
  { tipo: "Ley", numero: "1098", anio: 2006, eje: "infancia" },
  { tipo: "Ley", numero: "2136", anio: 2021, eje: "migración" },
  { tipo: "Ley", numero: "1757", anio: 2015, eje: "participación" },
  { tipo: "Ley", numero: "2195", anio: 2022, eje: "transparencia / anticorrupción" },
  { tipo: "Ley", numero: "1448", anio: 2011, eje: "víctimas" },
  { tipo: "Ley", numero: "1581", anio: 2012, eje: "protección de datos" },
  { tipo: "Ley", numero: "1712", anio: 2014, eje: "transparencia y acceso a información" },
];
