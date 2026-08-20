/**
 * El generador de INSERT para `providencia`. Puro: no se conecta a nada.
 *
 * Lo que se prueba aquí no es «que salga SQL», es lo que separa este importador
 * de uno escrito de oído: que la procedencia de cada fila salga de SU ventana y
 * no del año, y que lo que el esquema rechazaría se declare en vez de colarse
 * o de tumbar la carga entera.
 */

import { describe, expect, it } from "vitest";
import {
  type ArtefactoCorte,
  generarSqlProvidencias,
  type ProvidenciaArtefacto,
} from "./import-providencias.ts";

const CORRIDAS = [
  {
    anio: 2023,
    ventana: { fini: "2023-01-01", ffin: "2023-07-02" },
    gate: { outcome: "ok", url: "https://corte.example/?fini=2023-01-01&ffin=2023-07-02" },
    capturedAt: "2026-08-20T04:01:22.757Z",
  },
  {
    anio: 2023,
    ventana: { fini: "2023-07-03", ffin: "2023-12-31" },
    gate: { outcome: "ok", url: "https://corte.example/?fini=2023-07-03&ffin=2023-12-31" },
    capturedAt: "2026-08-20T04:01:33.597Z",
  },
] as const;

const prov = (extra: Partial<ProvidenciaArtefacto> = {}): ProvidenciaArtefacto => ({
  anio: 2023,
  ventanaIdx: 0,
  id: 8474,
  sentencia: "T-100/23",
  tipo: "Tutela",
  tipoDesconocido: false,
  fechaPublicacion: "2023-05-10",
  fechaSentencia: "2023-04-11",
  expediente: "T-5240390",
  magistrados: ["Diana Fajardo Rivera"],
  tema: "Derecho a la salud",
  urlTexto: "https://www.corteconstitucional.gov.co/relatoria/2023/T-100-23.htm",
  raw: { rutahtml: "2023/T-100-23.htm" },
  ...extra,
});

const art = (providencias: ProvidenciaArtefacto[]): ArtefactoCorte => ({
  corridas: CORRIDAS,
  providencias,
});

describe("generarSqlProvidencias — la procedencia sale de la ventana, no del año", () => {
  it("usa la URL y el captured_at de la ventana que devolvió cada fila", () => {
    const { lotes } = generarSqlProvidencias(art([prov(), prov({ id: 9000, ventanaIdx: 1 })]));
    const sql = lotes.join("\n");
    expect(sql).toContain("fini=2023-01-01");
    expect(sql).toContain("fini=2023-07-03");
    expect(sql).toContain("2026-08-20T04:01:22.757Z");
    expect(sql).toContain("2026-08-20T04:01:33.597Z");
  });

  it("rechaza un artefacto sin `ventanaIdx` en vez de atribuirle la primera ventana", () => {
    const sin = { ...prov() } as Record<string, unknown>;
    delete sin.ventanaIdx;
    expect(() => generarSqlProvidencias(art([sin as unknown as ProvidenciaArtefacto]))).toThrow(
      /ventanaIdx/,
    );
  });

  it("rechaza un `ventanaIdx` que apunta a una ventana inexistente", () => {
    expect(() => generarSqlProvidencias(art([prov({ ventanaIdx: 7 })]))).toThrow(/no existe/);
  });
});

describe("generarSqlProvidencias — lo que el esquema rechazaría se declara", () => {
  it("excluye la fila cuya fecha de sentencia es posterior a la de publicación", () => {
    const { lotes, excluidas } = generarSqlProvidencias(
      art([prov({ fechaSentencia: "2023-06-01", fechaPublicacion: "2023-05-10" })]),
    );
    expect(lotes).toHaveLength(0);
    expect(excluidas[0]?.motivo).toMatch(/posterior a la de publicación/);
  });

  it("excluye la fila sin URL de texto, que es donde se comprueba", () => {
    const { excluidas } = generarSqlProvidencias(art([prov({ urlTexto: null })]));
    expect(excluidas[0]?.motivo).toMatch(/sin URL de texto/);
  });

  it("excluye la fila sin rutahtml", () => {
    const { excluidas } = generarSqlProvidencias(art([prov({ raw: {} })]));
    expect(excluidas[0]?.motivo).toMatch(/rutahtml/);
  });

  it("excluye el duplicado, que haría fallar el INSERT entero, y carga el resto", () => {
    const { lotes, excluidas } = generarSqlProvidencias(
      art([prov(), prov({ ventanaIdx: 1 }), prov({ id: 9001 })]),
    );
    expect(excluidas).toHaveLength(1);
    expect(excluidas[0]?.motivo).toMatch(/duplicado/);
    expect(lotes.join("\n").match(/\(8474,/g)).toHaveLength(1);
  });

  it("una exclusión no tumba las demás filas", () => {
    const { lotes, excluidas } = generarSqlProvidencias(
      art([prov({ id: 1, urlTexto: null }), prov({ id: 2 })]),
    );
    expect(excluidas).toHaveLength(1);
    expect(lotes.join("\n")).toContain("(2, ");
  });
});

describe("generarSqlProvidencias — el tipo no se adjudica por parecido", () => {
  it("manda a `desconocido` CON requiere_revision lo que no es uno de los cuatro", () => {
    const sql = generarSqlProvidencias(
      art([prov({ tipo: "Sentencia de tutela y unificación", tipoDesconocido: true })]),
    ).lotes.join("\n");
    expect(sql).toContain("'desconocido'::tipo_providencia");
    // El CHECK del esquema exige que las dos cosas vayan juntas.
    expect(sql).toContain("true");
    // El original se conserva: es la evidencia de qué publicó la fuente.
    expect(sql).toContain("'Sentencia de tutela y unificación'");
  });

  it("no se fía solo de la bandera: un tipo fuera de la lista también va a revisión", () => {
    const sql = generarSqlProvidencias(
      art([prov({ tipo: "Concepto", tipoDesconocido: false })]),
    ).lotes.join("\n");
    expect(sql).toContain("'desconocido'::tipo_providencia");
  });
});

describe("generarSqlProvidencias — la forma del SQL", () => {
  it("deja NULL la fecha de publicación ausente en vez de inventar una", () => {
    const sql = generarSqlProvidencias(art([prov({ fechaPublicacion: null })])).lotes.join("\n");
    expect(sql).toContain("NULL, '2023-04-11'::date");
  });

  it("escapa las comillas simples de los temas", () => {
    const sql = generarSqlProvidencias(
      art([prov({ tema: "Acción de tutela 'urgente'" })]),
    ).lotes.join("\n");
    expect(sql).toContain("''urgente''");
  });

  it("trocea en lotes del tamaño pedido", () => {
    const muchas = Array.from({ length: 5 }, (_, i) => prov({ id: 1000 + i }));
    expect(generarSqlProvidencias(art(muchas), 2).lotes).toHaveLength(3);
  });

  it("re-importar refresca en vez de duplicar", () => {
    expect(generarSqlProvidencias(art([prov()])).lotes[0]).toContain(
      "on conflict (fuente_id) do update set",
    );
  });
});

describe("generarSqlProvidencias — el tamaño de lote", () => {
  /**
   * `--lotes=0` colgaba el proceso en un bucle que no avanza y `--lotes=abc`
   * emitía SQL partido en trozos de `NaN` saliendo con código 0. La validación
   * vive en `main()`, y aquí se fija lo que la función SÍ garantiza: que un
   * tamaño válido trocea de verdad.
   */
  it("un tamaño válido trocea, y el troceo cubre todas las filas", () => {
    const muchas = Array.from({ length: 7 }, (_, i) => prov({ id: 2000 + i }));
    const { lotes } = generarSqlProvidencias(art(muchas), 3);
    expect(lotes).toHaveLength(3);
    for (let i = 0; i < 7; i++) {
      expect(lotes.join("\n")).toContain(`(${2000 + i},`);
    }
  });
});
