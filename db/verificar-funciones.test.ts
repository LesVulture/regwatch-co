/**
 * El troceador de `db/verificar-funciones.ts`, probado sin base.
 *
 * Lo que importa aquí no es que corte texto: es que no se deje una función sin
 * ver. Una función que este troceador no encuentra no se comprueba nunca — y el
 * comando sale VERDE, que es peor que salir rojo.
 */

import { describe, expect, it } from "vitest";
import { bloquesDeFuncion } from "./verificar-funciones.ts";

const FN = (nombre: string, cuerpo = "  select 1;") =>
  `create or replace function ${nombre}()\nreturns int\nlanguage sql\nas $$\n${cuerpo}\n$$;`;

describe("bloquesDeFuncion", () => {
  it("saca cada función con su cuerpo entero", () => {
    const b = bloquesDeFuncion(`-- comentario\n${FN("uno")}\n\n${FN("dos")}\n`, "x.sql");
    expect(b.map((x) => x.nombre)).toEqual(["uno", "dos"]);
    expect(b[0]?.sql).toContain("select 1;");
    expect(b[0]?.sql.startsWith("create or replace function uno()")).toBe(true);
    expect(b[0]?.sql.trimEnd().endsWith("$$;")).toBe(true);
  });

  it("le quita el esquema al nombre, que es como lo devuelve pg_proc", () => {
    expect(bloquesDeFuncion(FN("public.tres"), "x.sql")[0]?.nombre).toBe("tres");
  });

  it("acepta `create function` a secas", () => {
    const sql = FN("cuatro").replace("create or replace function", "create function");
    expect(bloquesDeFuncion(sql, "x.sql")[0]?.nombre).toBe("cuatro");
  });

  it("no se traga lo que hay entre funciones", () => {
    const b = bloquesDeFuncion(`${FN("a")}\ncreate index i on t (c);\n${FN("b")}`, "x.sql");
    expect(b).toHaveLength(2);
    expect(b[0]?.sql).not.toContain("create index");
    expect(b[1]?.sql).not.toContain("create index");
  });

  /**
   * EL FALLO QUE ESTE TEST EXISTE PARA EVITAR. Un `$$` sin cerrar dejaría la
   * función fuera del recuento y el comando saldría verde habiendo comprobado
   * una menos. Un verde que no comprobó nada es peor que un rojo.
   */
  it("una función sin cerrar revienta en vez de desaparecer del recuento", () => {
    const roto = "create or replace function mala()\nreturns int\nlanguage sql\nas $$\n  select 1;";
    expect(() => bloquesDeFuncion(roto, "roto.sql")).toThrow(/sin cerrar/);
  });

  it("un fichero sin funciones devuelve la lista vacía", () => {
    expect(bloquesDeFuncion("create table t (id int);\n", "x.sql")).toEqual([]);
  });

  it("conserva de qué fichero salió cada una: es lo que se enseña al fallar", () => {
    expect(bloquesDeFuncion(FN("a"), "db/schemas/09_contexto.sql")[0]?.fichero).toBe(
      "db/schemas/09_contexto.sql",
    );
  });
});
