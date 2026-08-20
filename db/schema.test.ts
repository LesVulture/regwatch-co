/**
 * ¿Los ficheros de `db/schemas/` reconstruyen de verdad la base desplegada?
 *
 * Hasta ahora eso era una afirmación en prosa. La base se levantó con cinco
 * migraciones incrementales y los ficheros del repo se editaron después para
 * «describirla» — que es exactamente la forma que tiene una divergencia de
 * empezar: nadie miente, simplemente nadie comprueba.
 *
 * `deployed-snapshot.json` es el inventario REAL de la instancia, consultado a
 * `information_schema`/`pg_catalog`. Este test lee el SQL del repo y comprueba
 * que declara ese inventario y no otro. No sustituye a levantar una base desde
 * cero —eso es trabajo de CI con un Postgres efímero— pero sí caza el caso que
 * de verdad ocurre: alguien toca la base a mano, o edita un fichero y no
 * despliega.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import snapshot from "./deployed-snapshot.json" with { type: "json" };

const SQL = ["01_procedencia", "02_vigencia", "03_rls"]
  .map((f) => readFileSync(new URL(`./schemas/${f}.sql`, import.meta.url), "utf-8"))
  .join("\n");

/** Quita comentarios: lo que se comprueba es el SQL, no la prosa que lo explica. */
const SOLO_SQL = SQL.replace(/--[^\n]*/g, "");

function declarados(re: RegExp): string[] {
  return [...SOLO_SQL.matchAll(re)].map((m) => m[1] as string).sort();
}

describe("los ficheros de db/schemas/ declaran la base desplegada", () => {
  it("el snapshot trae su procedencia", () => {
    expect(snapshot._procedencia.postgres).toBe("17.6");
    expect(snapshot._procedencia.migraciones_aplicadas).toHaveLength(5);
  });

  it("las 4 tablas", () => {
    expect(declarados(/create table (\w+)/g)).toEqual([...snapshot.tablas].sort());
  });

  it("los 4 enums, con sus valores en orden", () => {
    for (const [nombre, valores] of Object.entries(snapshot.enums)) {
      const bloque = SOLO_SQL.match(
        new RegExp(`create type ${nombre} as enum\\s*\\(([^)]*)\\)`, "s"),
      );
      expect(bloque, `falta el enum ${nombre}`).toBeTruthy();
      const leidos = [...(bloque?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
      // El ORDEN importa: un enum de Postgres es ordenado y se compara.
      expect(leidos).toEqual(valores);
    }
  });

  it("el dominio url_fuente", () => {
    expect(declarados(/create domain (\w+)/g)).toEqual(snapshot.dominios);
  });

  /** Las CHECK son R1. Que falte una es que una regla dejó de aplicarse. */
  it("las 10 constraints CHECK con nombre — R1 vive aquí", () => {
    const nombradas = declarados(/constraint (\w+)\s+check/g);
    for (const c of snapshot.constraints_check) {
      // `captura_gate_outcome_check` la nombra Postgres sola (check inline), por
      // eso el snapshot la lista y aquí solo se exigen las declaradas a mano.
      if (c === "captura_gate_outcome_check") continue;
      expect(nombradas, `falta la constraint ${c}`).toContain(c);
    }
  });

  it("los 6 índices con nombre", () => {
    const idx = declarados(/create (?:unique )?index (\w+)/g);
    expect(idx).toEqual([...snapshot.indices].sort());
  });

  it("RLS activo en las 4 tablas", () => {
    const conRls = declarados(/alter table (\w+)\s+enable row level security/g);
    expect(conRls).toEqual([...snapshot.tablas].sort());
  });

  it("políticas de lectura solo en las 3 públicas — captura NO", () => {
    const conPolicy = declarados(/create policy "[^"]+" on (\w+)/g);
    expect(conPolicy).toEqual([...snapshot.policies].sort());
    expect(conPolicy).not.toContain("captura");
    expect(snapshot.tablas_con_rls_sin_policy).toEqual(["captura"]);
  });

  it("el wrapper existe y apunta a `extensions`, no a `public`", () => {
    expect(SOLO_SQL).toMatch(/create or replace function public\.immutable_unaccent/);
    // La migración 04 movió unaccent. Si el fichero se quedara en public.unaccent
    // describiría una base que ya no existe: justo la deriva que esto vigila.
    expect(SOLO_SQL).toMatch(/extensions\.unaccent/);
    expect(SOLO_SQL).not.toMatch(/select public\.unaccent\(/);
    expect(SOLO_SQL).toMatch(/set search_path = ''/);
  });

  it("las extensiones se crean en `extensions`, ninguna en public", () => {
    for (const [ext, esquema] of Object.entries(snapshot.extensiones_declaradas)) {
      expect(SOLO_SQL, `falta ${ext}`).toMatch(
        new RegExp(`create extension if not exists "${ext}"\\s+with schema ${esquema}`),
      );
    }
  });
});
