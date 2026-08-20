/**
 * El generador de INSERT para `chunk`. Puro: no se conecta a nada.
 *
 * Las tres guardas lanzan en vez de producir SQL dudoso. No es celo: un id
 * duplicado revienta el INSERT a mitad de carga con un error de Postgres mucho
 * menos claro, y una `fuente` incoherente con la FK viola una CHECK del esquema
 * después de haber viajado por toda la tubería.
 */

import { describe, expect, it } from "vitest";
import type { Chunk } from "../collectors/src/rag/chunking.ts";
import { generarSqlChunks } from "./import-chunks.ts";

const UUID = "454ca224-538e-4392-aeef-35f2540da1b1";
const DESTINO = { fuente: "norma", entidadId: UUID, tier: "primaria" } as const;

const chunk = (id: string, extra: Partial<Chunk> = {}): Chunk => ({
  id,
  fuente: "norma",
  referencia: "Ley 1616 de 2013, artículo 1",
  texto: "ARTÍCULO 1o. OBJETO. El objeto de la presente ley.",
  caracteres: 49,
  urlFuente: "http://www.secretariasenado.gov.co/senado/basedoc/ley_1616_2013.html",
  capturedAt: "2026-08-20T00:00:00.000Z",
  ...extra,
});

describe("generarSqlChunks — las guardas", () => {
  it("rechaza un entidadId que no es uuid", () => {
    expect(() =>
      generarSqlChunks([chunk("a:art:1")], { ...DESTINO, entidadId: "no-uuid" }),
    ).toThrow(/no es un uuid/);
  });

  it("rechaza ids duplicados dentro del lote", () => {
    expect(() => generarSqlChunks([chunk("a:art:1"), chunk("a:art:1")], DESTINO)).toThrow(
      /duplicado/,
    );
  });

  it("rechaza un chunk cuya fuente no case con el destino", () => {
    expect(() => generarSqlChunks([chunk("a:art:1", { fuente: "providencia" })], DESTINO)).toThrow(
      /fuente/,
    );
  });
});

describe("generarSqlChunks — la forma del SQL", () => {
  it("usa la columna de FK que toca según la fuente", () => {
    expect(generarSqlChunks([chunk("a:art:1")], DESTINO)[0]).toContain("norma_id");
    const p = generarSqlChunks([chunk("a:art:1", { fuente: "proyecto_ley" })], {
      ...DESTINO,
      fuente: "proyecto_ley",
    })[0];
    expect(p).toContain("proyecto_id");
    expect(p).not.toContain("norma_id");
  });

  it("escapa las comillas simples del texto normativo", () => {
    const sql = generarSqlChunks(
      [chunk("a:art:1", { texto: "el 'objeto' de la ley" })],
      DESTINO,
    )[0];
    expect(sql).toContain("el ''objeto'' de la ley");
  });

  /**
   * REINGESTAR NO DEBE DUPLICAR NI RECALCULAR. El `on conflict` refresca el
   * texto y NO toca `embedding`: recalcular un vector cuesta dinero, y el texto
   * de un artículo que no cambió produce exactamente el mismo vector.
   * Verificado además contra la base real el 2026-08-20: tras reingestar, el
   * embedding sobrevivió y el texto se actualizó.
   */
  it("el on-conflict refresca el texto y NO toca el embedding", () => {
    const sql = generarSqlChunks([chunk("a:art:1")], DESTINO)[0] as string;
    expect(sql).toContain("on conflict (id) do update set");
    expect(sql).toContain("texto       = excluded.texto");
    expect(sql).not.toContain("embedding");
    expect(sql).not.toContain("modelo_embedding");
  });

  it("parte en lotes y no pierde ninguno", () => {
    const muchos = Array.from({ length: 7 }, (_, i) => chunk(`a:art:${i}`));
    const lotes = generarSqlChunks(muchos, DESTINO, 3);
    expect(lotes).toHaveLength(3);
    const todo = lotes.join("\n");
    for (const c of muchos) expect(todo).toContain(c.id);
  });
});
