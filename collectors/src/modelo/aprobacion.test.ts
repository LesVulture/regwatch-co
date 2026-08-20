import { describe, expect, it } from "vitest";
import {
  FACTORES_ADMISIBLES,
  FACTORES_CON_FUGA,
  FactorConFugaError,
  type ModeloLogistico,
  predecir,
  predecirEtapa,
  sigmoide,
  tasaBase,
  validarFactores,
} from "./aprobacion.ts";

/** Réplica de la proporción REAL medida en las 3 legislaturas cerradas. */
const CERRADAS = ["2022-2023", "2023-2024", "2024-2025"];
const CORPUS = [
  ...Array.from({ length: 278 }, () => ({ legislatura: "2022-2023", esLey: true })),
  ...Array.from({ length: 842 }, () => ({ legislatura: "2022-2023", esLey: false })),
  // Una legislatura ABIERTA, con proyectos vivos que aún pueden llegar a ley.
  ...Array.from({ length: 194 }, () => ({ legislatura: "2026-2027", esLey: false })),
];

describe("la fuga del objetivo, que es el hallazgo de este módulo", () => {
  /**
   * MEDIDO EL 2026-08-20: de los 1.120 proyectos de legislaturas cerradas, 278
   * llegaron a ley y LOS 278 tienen `numero_camara`. De los 842 que no
   * llegaron, solo el 31 %.
   *
   * Como predictor eso parece oro y es fuga: un proyecto tiene número de Cámara
   * PORQUE cruzó, no al revés. Un modelo que la use saca un AUC magnífico y no
   * sirve para nada, porque el día que hay que predecir el dato no existe.
   */
  it("numero_camara se rechaza, con el motivo delante", () => {
    expect(() => validarFactores(["numero_camara"])).toThrow(FactorConFugaError);
    expect(() => validarFactores(["numero_camara"])).toThrow(/100 % de las 278 leyes/);
  });

  it("el estado es el objetivo disfrazado", () => {
    expect(() => validarFactores(["estado"])).toThrow(/objetivo disfrazado/);
  });

  it("el crosswalk arrastra la misma fuga porque se deriva de numero_camara", () => {
    expect(() => validarFactores(["crosswalk"])).toThrow(FactorConFugaError);
  });

  /**
   * LANZA, no advierte. Un modelo entrenado con fuga es PEOR que no tener
   * modelo: parece funcionar, y por eso nadie lo revisa.
   */
  it("lanza en vez de devolver una advertencia ignorable", () => {
    expect(() => predecirEtapa({ intercepto: 0, pesos: {} }, { numero_camara: 1 })).toThrow(
      FactorConFugaError,
    );
  });

  /**
   * LISTA BLANCA, por el mismo motivo que en egreso: con lista negra, una
   * variable nueva entra por defecto y la fuga vuelve sin avisar.
   */
  it("una variable no declarada tampoco pasa, aunque no esté en la lista de fugas", () => {
    expect(() => validarFactores(["variable_nueva"])).toThrow(/no está en FACTORES_ADMISIBLES/);
  });

  it("los factores admisibles son todos conocidos en la radicación", () => {
    // Si alguno de estos dejara de serlo, el modelo predeciría el pasado.
    expect([...FACTORES_ADMISIBLES]).toEqual([
      "camara_origen",
      "comision",
      "autor_gobierno",
      "num_autores",
      "es_acto_legislativo",
      "mes_legislatura",
    ]);
    for (const f of FACTORES_ADMISIBLES) expect(FACTORES_CON_FUGA[f]).toBeUndefined();
  });
});

describe("la tasa base y su denominador", () => {
  /**
   * Solo legislaturas CERRADAS. Una abierta tiene proyectos en curso que aún
   * pueden llegar a ley, y contarlos como fracasos hunde la tasa: medido, con
   * las cinco sale 18,06 % y con las tres cerradas 24,82 %.
   */
  it("ignora las legislaturas abiertas", () => {
    const t = tasaBase(CORPUS, CERRADAS, "listado del Senado", null);
    expect(t.total).toBe(1120);
    expect(t.leyes).toBe(278);
    expect(t.tasa * 100).toBeCloseTo(24.82, 1);
  });

  it("con las abiertas dentro, la cifra se hunde — y por eso se excluyen", () => {
    const conAbiertas = tasaBase(CORPUS, [...CERRADAS, "2026-2027"], "todo", null);
    expect(conAbiertas.tasa * 100).toBeCloseTo(21.15, 1);
    expect(conAbiertas.tasa).toBeLessThan(tasaBase(CORPUS, CERRADAS, "cerradas", null).tasa);
  });

  /**
   * PUBLICAR EL DENOMINADOR ES LA OTRA MITAD DEL PATRÓN. Una tasa base con el
   * denominador equivocado es una cifra inventada con aspecto de medición.
   */
  it("el sesgo del denominador viaja con la tasa, no en una nota al pie", () => {
    const t = tasaBase(
      CORPUS,
      CERRADAS,
      "proyectos del listado del Senado",
      "un proyecto que muere en Cámara sin llegar al Senado no aparece",
    );
    expect(t.sesgo).toContain("muere en Cámara");
  });

  it("sin legislaturas cerradas no se inventa una tasa", () => {
    expect(() => tasaBase(CORPUS, ["1999-2000"], "x", null)).toThrow(/no hay tasa base/);
  });
});

describe("las dos etapas encadenadas", () => {
  const e1: ModeloLogistico = { intercepto: -0.5, pesos: { autor_gobierno: 2.0 } };
  const e2: ModeloLogistico = { intercepto: -0.8, pesos: { autor_gobierno: 1.5 } };
  const base = tasaBase(CORPUS, CERRADAS, "listado del Senado", "sesgo conocido");

  it("multiplica las dos etapas", () => {
    const r = predecir(e1, e2, { autor_gobierno: 1 }, base);
    expect(r.probabilidad).toBeCloseTo(r.pAprobadoOrigen * r.pLeyDadoOrigen, 10);
  });

  it("el autor de Gobierno sube la probabilidad en las dos etapas", () => {
    const con = predecir(e1, e2, { autor_gobierno: 1 }, base);
    const sin = predecir(e1, e2, { autor_gobierno: 0 }, base);
    expect(con.probabilidad).toBeGreaterThan(sin.probabilidad);
    expect(con.pAprobadoOrigen).toBeGreaterThan(sin.pAprobadoOrigen);
  });

  /**
   * «Factores explicables» no significa que el modelo sea simple: significa
   * poder decir POR QUÉ dio lo que dio.
   */
  it("devuelve la contribución de cada factor", () => {
    const r = predecir(e1, e2, { autor_gobierno: 1 }, base);
    // 2.0 en la etapa 1 + 1.5 en la 2.
    expect(r.contribuciones.autor_gobierno).toBeCloseTo(3.5, 10);
  });

  /**
   * «Veces la tasa base» es lo que un lector entiende de verdad. Un «32 %» a
   * secas no le dice si eso es mucho o poco.
   */
  it("expresa el resultado en veces la tasa base", () => {
    const r = predecir(e1, e2, { autor_gobierno: 1 }, base);
    expect(r.vecesLaBase).toBeCloseTo(r.probabilidad / base.tasa, 10);
  });

  it("la tasa base y su sesgo viajan CON la predicción", () => {
    const r = predecir(e1, e2, { autor_gobierno: 1 }, base);
    expect(r.advertencias.join(" ")).toContain("24.82 %");
    expect(r.advertencias.join(" ")).toContain("278 de 1120");
    expect(r.advertencias.join(" ")).toContain("Sesgo conocido");
    expect(r.advertencias.join(" ")).toContain("NO una predicción sobre este proyecto");
  });

  it("una probabilidad siempre cae en [0,1]", () => {
    for (const v of [-100, -1, 0, 1, 100]) {
      const p = predecir(e1, e2, { num_autores: v }, base).probabilidad;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("sigmoide", () => {
  it("es 0,5 en cero y monótona", () => {
    expect(sigmoide(0)).toBe(0.5);
    expect(sigmoide(-10)).toBeLessThan(0.001);
    expect(sigmoide(10)).toBeGreaterThan(0.999);
  });
});
