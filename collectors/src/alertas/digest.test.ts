import { describe, expect, it } from "vitest";
import { puedeSalir } from "../egreso/politica.ts";
import {
  casa,
  construirDigest,
  debeEnviarse,
  type Novedad,
  redactar,
  type Suscripcion,
  ventanaDesde,
} from "./digest.ts";

const AHORA = new Date("2026-08-20T12:00:00.000Z");

const nov = (titulo: string, capturedAt: string, referencia = "ref"): Novedad => ({
  tipo: "proyecto_ley",
  titulo,
  referencia,
  url: "https://leyes.senado.gov.co/x",
  capturedAt,
});

const sus = (over: Partial<Suscripcion> = {}): Suscripcion => ({
  id: "s1",
  temas: ["salud mental"],
  cadencia: "semanal",
  ultimoEnvio: "2026-08-13T12:00:00.000Z",
  ...over,
});

describe("la ventana empieza en el último envío, no «hace una semana»", () => {
  /**
   * SI EL ENVÍO FALLA Y SE REINTENTA AL DÍA SIGUIENTE, una ventana fija se
   * comería un día entero de novedades — y nadie lo notaría, porque el digest
   * llegaría con buen aspecto.
   */
  it("usa ultimoEnvio cuando existe", () => {
    expect(ventanaDesde(sus(), AHORA).toISOString()).toBe("2026-08-13T12:00:00.000Z");
  });

  it("en el primer envío cae al fallback de la cadencia", () => {
    expect(ventanaDesde(sus({ ultimoEnvio: null }), AHORA).toISOString()).toBe(
      "2026-08-13T12:00:00.000Z",
    );
    expect(ventanaDesde(sus({ ultimoEnvio: null, cadencia: "diaria" }), AHORA).toISOString()).toBe(
      "2026-08-19T12:00:00.000Z",
    );
  });

  /**
   * Ventana SEMIABIERTA `(desde, hasta]`. Una novedad capturada exactamente en
   * el instante del último envío ya se envió; volver a mandarla es el fallo de
   * duplicación más fácil de cometer.
   */
  it("excluye lo capturado justo en el instante del último envío", () => {
    const d = construirDigest(sus(), [nov("Salud mental A", "2026-08-13T12:00:00.000Z")], AHORA);
    expect(d.novedades).toEqual([]);
  });

  it("incluye lo capturado un milisegundo después", () => {
    const d = construirDigest(sus(), [nov("Salud mental A", "2026-08-13T12:00:00.001Z")], AHORA);
    expect(d.novedades).toHaveLength(1);
  });

  it("excluye lo capturado antes de la ventana", () => {
    expect(
      construirDigest(sus(), [nov("Salud mental vieja", "2026-08-01T00:00:00.000Z")], AHORA)
        .novedades,
    ).toEqual([]);
  });
});

describe("la coincidencia es LÉXICA y explicable", () => {
  /**
   * Hay que poder responder «¿por qué me llegó esto?» con un término concreto.
   * El coste se declara: no captura sinónimos ni paráfrasis.
   */
  it("ignora acentos y mayúsculas en AMBOS lados", () => {
    expect(casa(nov("LEY DE SALUD MENTAL", "x"), "salud mental")).toBe(true);
    // Y también al revés: un acento de más en la fuente no impide la coincidencia.
    expect(casa(nov("Ley de Atención en Salud Méntal", "x"), "salud mental")).toBe(true);
    expect(casa(nov("Ley de salud mental", "x"), "SALUD MENTAL")).toBe(true);
  });

  /**
   * EL COSTE, DECLARADO Y CON TEST. La coincidencia léxica no captura sinónimos
   * ni paráfrasis: un proyecto sobre «trastornos psiquiátricos» no llega a quien
   * sigue «salud mental». La mitigación es mantener la lista de temas, no
   * cambiar a una distancia coseno — que capturaría más y no se podría defender
   * ante quien pregunte por qué le llegó algo.
   */
  it("NO captura sinónimos, y eso es la limitación conocida", () => {
    expect(casa(nov("Atención de trastornos psiquiátricos", "x"), "salud mental")).toBe(false);
  });

  it("un tema vacío no casa con todo", () => {
    expect(casa(nov("cualquier cosa", "x"), "   ")).toBe(false);
  });

  it("el digest dice QUÉ tema disparó cada novedad", () => {
    const d = construirDigest(
      sus({ temas: ["salud mental", "pensiones"] }),
      [
        nov("Reforma a la salud mental", "2026-08-15T00:00:00.000Z"),
        nov("Reforma a las pensiones", "2026-08-16T00:00:00.000Z"),
      ],
      AHORA,
    );
    expect(Object.keys(d.porTema).sort()).toEqual(["pensiones", "salud mental"]);
    expect(d.porTema["salud mental"]).toHaveLength(1);
  });

  /**
   * Una novedad que casa con dos temas se LISTA en los dos pero se CUENTA una
   * vez: si no, el digest exagera cuánto pasó, y exagerar es una forma de
   * mentir con datos correctos.
   */
  it("una novedad que casa con dos temas no se cuenta dos veces", () => {
    const n = nov("Salud mental y pensiones", "2026-08-15T00:00:00.000Z");
    const d = construirDigest(sus({ temas: ["salud mental", "pensiones"] }), [n], AHORA);
    expect(d.novedades).toHaveLength(1);
    expect(d.porTema["salud mental"]).toHaveLength(1);
    expect(d.porTema.pensiones).toHaveLength(1);
  });
});

describe("un digest vacío no se envía", () => {
  /**
   * Un correo que dice «no hay novedades» es ruido, y el ruido semanal es lo
   * que hace que la gente deje de abrir el correo que sí importa.
   */
  it("sin novedades, no se manda", () => {
    expect(debeEnviarse(construirDigest(sus(), [], AHORA))).toBe(false);
  });

  it("con una sola novedad, sí", () => {
    expect(
      debeEnviarse(
        construirDigest(sus(), [nov("Salud mental X", "2026-08-15T00:00:00.000Z")], AHORA),
      ),
    ).toBe(true);
  });
});

describe("la redacción lleva la fuente y las advertencias", () => {
  const d = construirDigest(
    sus(),
    [nov("Reforma a la salud mental", "2026-08-15T00:00:00.000Z", "PL 002/25")],
    AHORA,
  );

  /**
   * El correo es la única superficie del sistema que se lee FUERA del sistema.
   * Si no lleva la fuente dentro, se cita sin comprobar.
   */
  it("cada novedad va con su URL", () => {
    expect(redactar(d)).toContain("https://leyes.senado.gov.co/x");
    expect(redactar(d)).toContain("PL 002/25");
  });

  it("repite las dos advertencias, porque se lee sin el resto del sistema delante", () => {
    const t = redactar(d);
    expect(t).toContain("no es asesoría jurídica");
    expect(t).toContain("no que no exista");
  });

  it("dice desde cuándo va el aviso", () => {
    expect(redactar(d)).toContain("2026-08-13");
  });
});

describe("los datos del suscriptor no salen por ningún canal", () => {
  /**
   * Categoría propia, distinta de `contacto_servidor_publico`: un congresista
   * es servidor público y su correo institucional es dato público por su
   * función; un suscriptor es un particular que confió un correo para recibir
   * alertas, y nada más.
   */
  it("ni siquiera en una ficha individual", () => {
    for (const c of ["ficha_individual", "api_bloque", "dump", "mcp"] as const) {
      expect(puedeSalir("dato_suscriptor", c).sale, `salió en ${c}`).toBe(false);
    }
  });

  it("el fundamento nombra la finalidad y por qué los temas también importan", () => {
    const v = puedeSalir("dato_suscriptor", "dump");
    expect(v.fundamento).toContain("finalidad");
    expect(v.fundamento).toContain("litigio");
  });
});
