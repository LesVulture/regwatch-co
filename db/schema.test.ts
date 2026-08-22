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

const SQL = [
  "01_procedencia",
  "02_vigencia",
  "03_rls",
  "04_proyecto_ley",
  "05_providencia",
  "06_busqueda",
  "07_suscripcion",
  "08_rag",
  "09_contexto",
  "10_listados",
]
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
    expect(snapshot._procedencia.migraciones_aplicadas).toHaveLength(15);
  });

  it("las 8 tablas", () => {
    expect(declarados(/create table (\w+)/g)).toEqual([...snapshot.tablas].sort());
  });

  it("los 9 enums, con sus valores en orden", () => {
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
  /**
   * Las que Postgres nombra SOLO, por venir de un `check` inline sin nombre.
   * No hay `constraint <nombre> check` que encontrar en el SQL, así que se
   * saltan. Antes esta lista tenía una sola entrada y el snapshot NO la
   * listaba: la rama era código muerto y su comentario decía lo contrario.
   */
  const AUTONOMBRADAS = ["captura_gate_outcome_check", "suscripcion_cadencia_check"];

  it("las 25 constraints CHECK — R1 vive aquí", () => {
    const nombradas = declarados(/constraint (\w+)\s+check/g);
    for (const c of snapshot.constraints_check) {
      if (AUTONOMBRADAS.includes(c)) continue;
      expect(nombradas, `falta la constraint ${c}`).toContain(c);
    }
    // Y las auto-nombradas están de verdad en el snapshot: si alguien las
    // quitara, el `continue` volvería a ser código muerto sin que se notara.
    for (const a of AUTONOMBRADAS) expect(snapshot.constraints_check).toContain(a);
  });

  it("los 24 índices con nombre", () => {
    const idx = declarados(/create (?:unique )?index (\w+)/g);
    expect(idx).toEqual([...snapshot.indices].sort());
  });

  it("RLS activo en TODAS las tablas, sin excepción", () => {
    const conRls = declarados(/alter table (\w+)\s+enable row level security/g);
    expect(conRls).toEqual([...snapshot.tablas].sort());
  });

  it("lectura pública solo en las tablas del corpus — captura NO", () => {
    const publicas = declarados(/create policy "lectura pública" on (\w+)/g);
    expect(publicas).toEqual([...snapshot.policies].sort());
    expect(publicas).not.toContain("captura");
    expect(snapshot.tablas_con_rls_sin_policy).toEqual(["captura"]);
  });

  /**
   * `suscripcion` invierte el criterio: propiedad, no lectura pública. Y lleva
   * las CUATRO políticas por separado — una permisiva «para todo» sería fácil
   * de aflojar sin que se notara en el diff.
   */
  it("suscripcion va por propiedad, con las 4 políticas y ninguna pública", () => {
    const propias = [...SOLO_SQL.matchAll(/create policy "([^"]+)" on suscripcion\s+for (\w+)/g)];
    expect(propias.map((m) => m[2]).sort()).toEqual(["delete", "insert", "select", "update"]);
    expect(SOLO_SQL).not.toMatch(/create policy "lectura pública" on suscripcion/);
    // Y toda política de suscripcion compara contra el dueño.
    const bloque = SOLO_SQL.slice(SOLO_SQL.indexOf("create table suscripcion"));
    expect((bloque.match(/auth\.uid\(\) = usuario_id/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("el wrapper existe y apunta a `extensions`, no a `public`", () => {
    expect(SOLO_SQL).toMatch(/create or replace function public\.immutable_unaccent/);
    // La migración 04 movió unaccent. Si el fichero se quedara en public.unaccent
    // describiría una base que ya no existe: justo la deriva que esto vigila.
    expect(SOLO_SQL).toMatch(/extensions\.unaccent/);
    expect(SOLO_SQL).not.toMatch(/select public\.unaccent\(/);
    expect(SOLO_SQL).toMatch(/set search_path = ''/);
  });

  /** Las funciones del snapshot tienen que estar declaradas en el SQL del repo. */
  it("las funciones desplegadas están todas en los ficheros", () => {
    const declaradas = declarados(/create or replace function (?:public\.)?(\w+)/g);
    for (const f of snapshot.funciones) {
      expect(declaradas, `falta la función ${f}`).toContain(f);
    }
  });

  it("las extensiones se crean en `extensions`, ninguna en public", () => {
    for (const [ext, esquema] of Object.entries(snapshot.extensiones_declaradas)) {
      expect(SOLO_SQL, `falta ${ext}`).toMatch(
        new RegExp(`create extension if not exists "${ext}"\\s+with schema ${esquema}`),
      );
    }
  });
});

/**
 * `hybrid_search`: las cuatro propiedades que lo hacen correcto.
 *
 * Estas son aserciones sobre el TEXTO del SQL, y por sí solas probarían poco.
 * Su valor es otro: las cuatro propiedades se verificaron EJECUTANDO la función
 * contra la instancia real el 2026-08-20, y esto impide que alguien deshaga
 * cualquiera de ellas con una edición que parece inocente. Las cifras que
 * aparecen abajo son las medidas, no ilustrativas.
 */
describe("hybrid_search — RRF sobre dos rankings", () => {
  const RRF = SOLO_SQL.slice(SOLO_SQL.indexOf("create or replace function hybrid_search"));

  /**
   * PROPIEDAD 1 — la que corre en producción HOY. Con `consulta_embedding`
   * NULL el resultado tiene que ser exactamente el de `busqueda_lexica`.
   * Medido sobre 6 consultas: `ley` 5 filas, `mental` 2, `salud` 2,
   * `sistema` 1, y dos sin resultados que no dan error. Mismo orden en todas.
   */
  it("el embedding es opcional: sin él degrada a la búsqueda léxica", () => {
    expect(RRF).toMatch(/consulta_embedding\s+extensions\.vector\(256\)\s+default null/);
    // El CTE semántico se apaga entero cuando no hay vector.
    expect(RRF).toMatch(/where consulta_embedding is not null/);
  });

  /**
   * PROPIEDAD 2 — FULL OUTER JOIN, no INNER. Medido: con un ranking vectorial
   * que solo compartía una entidad con el léxico, la ley 1616 de 2013 salió
   * con `posicion_lexica = null` y score 0.019608 = 1/(50+1). Con INNER habría
   * desaparecido, y la búsqueda híbrida no añadiría nada sobre la léxica.
   */
  it("lo que aparece en un solo ranking sigue puntuando", () => {
    expect(RRF).toMatch(/full outer join/);
    expect(RRF).not.toMatch(/\n\s*inner join sem\b/);
    // El término ausente aporta 0, no NULL: sin el coalesce el score entero
    // sería NULL y la fila caería al final en vez de puntuar.
    expect((RRF.match(/coalesce\(peso_/g) ?? []).length).toBe(2);
  });

  /**
   * PROPIEDAD 3 — desempate determinista. Sin él la paginación es inestable.
   */
  it("ordena por score y desempata siempre igual", () => {
    expect(RRF).toMatch(/order by k\.score desc, k\.origen, k\.id/);
  });

  /**
   * PROPIEDAD 4 — un chunk no es un resultado. Medido con dos pasajes de la
   * MISMA ley (distancias -1.0 y -0.9) por encima de un proyecto (-0.6): la
   * ley salió UNA vez y el proyecto en `posicion_semantica = 2`, no 3. Si la
   * posición se reutilizara del ranking de chunks el score sería 0.038476 en
   * vez de 0.038839. Ese decimal es toda la prueba.
   */
  it("deduplica por entidad y RENUMERA después, no antes", () => {
    expect(RRF).toMatch(/group by s\.origen, s\.id/);
    expect(RRF).toMatch(/row_number\(\) over \(order by min\(s\.dist\)/);
  });

  /** La identidad es el PAR: hay tres tablas fusionadas en un solo ranking. */
  it("junta por (origen, id), nunca por id solo", () => {
    expect(RRF).toMatch(/on s\.origen = l\.origen and s\.id = l\.id/);
  });

  /**
   * Toda fila arrastra procedencia, incluida la que solo encontró el vector.
   * Por eso hay rehidratación: una fila del ranking semántico no trae título
   * ni URL, y una fila sin procedencia comprobable no se publica.
   */
  it("rehidrata la procedencia de las filas que solo vio el vector", () => {
    expect(RRF).toMatch(/join datos d on d\.origen = k\.origen and d\.id = k\.id/);
    for (const col of ["url_fuente", "captured_at", "tier"]) {
      expect(RRF, `hybrid_search no devuelve ${col}`).toMatch(new RegExp(`d\\.${col}`));
    }
  });

  /**
   * Los filtros se aplican a los CANDIDATOS, no después del LIMIT. Un
   * post-filtro sobre el top-20 vaciaría resultados en silencio.
   */
  it("filtra en el pool léxico, en el semántico y al rehidratar, y pagina al final", () => {
    expect(RRF).toMatch(/filtro_legislatura/);
    expect(RRF).toMatch(/filtro_estado/);
    expect(RRF).toMatch(/filtro_camara/);
    expect(RRF).toMatch(/filtro_anio/);
    expect(RRF).toMatch(/filtro_tipo_providencia/);
    expect(RRF).toMatch(/busqueda_lexica\(/);
    expect(RRF).toMatch(/left join public\.proyecto_ley p/);
    expect(RRF).toMatch(/offset greatest\(desplazamiento, 0\)/);
  });
});

/**
 * El contrato entre el esquema y `embeddings.ts`. Las 256 dimensiones están
 * escritas en dos sitios y nada las ataba: si `DIMS` cambiara a 512, los
 * INSERT fallarían en tiempo de ejecución y no antes.
 */
describe("chunk — el contrato de dimensiones con embeddings.ts", () => {
  it("vector(256) coincide con DIMS", async () => {
    const { DIMS } = await import("../collectors/src/rag/embeddings.ts");
    expect(SOLO_SQL).toMatch(new RegExp(`embedding\\s+extensions\\.vector\\(${DIMS}\\)`));
  });

  /** La PK es el id natural de chunking.ts: R2 compara contra ella. */
  it("la PK del chunk es TEXT, no un uuid generado", () => {
    expect(SOLO_SQL).toMatch(/create table chunk \(\s*\n\s*id\s+text primary key/);
    // OJO con el regex: `[^)]*id\s+uuid` casaba con `norma_id        uuid`,
    // porque `norma_id` TERMINA en `id`. La aserción fallaba dijera lo que
    // dijera el esquema. Se ancla a la PRIMERA columna, que es lo que se quiere
    // comprobar.
    expect(SOLO_SQL).not.toMatch(/create table chunk \(\s*\n\s*id\s+uuid/);
  });
});

/**
 * `contexto_qa`: el puente de la consulta al contexto citable.
 *
 * Igual que con RRF, estas son aserciones sobre el TEXTO del SQL y su valor
 * está en lo que impiden deshacer. Las propiedades se verificaron EJECUTANDO
 * la función contra la instancia real el 2026-08-20.
 */
describe("contexto_qa — el hueco de evidencia viaja dentro de la respuesta", () => {
  const CTX = SOLO_SQL.slice(SOLO_SQL.indexOf("create or replace function contexto_qa"));

  /**
   * LA PROPIEDAD CENTRAL. Con INNER JOIN, una norma relevante cuyo articulado
   * no se ha capturado DESAPARECE del resultado, y el modelo responde como si
   * no existiera. Con LEFT JOIN sale con `chunk_id` NULL y quien llama no
   * puede no verla. Medido con `chunk` vacía: la ley 1616 sale igual, con su
   * procedencia y su tier.
   */
  it("LEFT JOIN, no INNER: una entidad sin texto no desaparece", () => {
    expect(CTX).toMatch(/left join ch/);
    expect(CTX).not.toMatch(/\n\s*join ch\b/);
  });

  /** El tope recorta por RELEVANCIA cuando hay vector, no por id. */
  it("selecciona los mejores pasajes y respeta el tope por entidad", () => {
    expect(CTX).toMatch(/row_number\(\) over \(\s*\n\s*partition by e\.origen, e\.id/);
    expect(CTX).toMatch(/ch\.n <= max_chunks_por_entidad/);
    expect(CTX).toMatch(/c\.embedding operator\(extensions\.<#>\) consulta_embedding/);
  });

  /** También la fila del hueco tiene que ser verificable. */
  it("la fila sin chunk hereda la procedencia de la entidad", () => {
    expect(CTX).toMatch(/coalesce\(ch\.url_fuente, e\.url_fuente\)/);
    expect(CTX).toMatch(/coalesce\(ch\.captured_at, e\.captured_at\)/);
    expect(CTX).toMatch(/coalesce\(ch\.tier, e\.tier\)/);
  });

  it("los huecos salen PRIMERO en su entidad, no escondidos al final", () => {
    expect(CTX).toMatch(/order by e\.posicion, ch\.chunk_id nulls first/);
  });
});
