import { describe, expect, it } from "vitest";
import type { Chunk } from "./chunking.ts";
import {
  construirEvidencia,
  parsearRespuesta,
  procesarRespuesta,
  RespuestaIlegible,
  SISTEMA,
  verificarTextualidad,
} from "./qa.ts";

const TEXTO_1 =
  "ARTÍCULO 1o. OBJETO. La presente ley tiene por objeto garantizar el ejercicio " +
  "pleno del Derecho a la Salud Mental a la población colombiana.";
const TEXTO_3 =
  "ARTÍCULO 3o. Modifíquese el artículo 1o de la Ley 1616 de 2013, el cual quedará así.";

const chunk = (id: string, ref: string, texto: string): Chunk => ({
  id,
  fuente: "norma",
  referencia: ref,
  texto,
  caracteres: texto.length,
  urlFuente: "http://x/y.html",
  capturedAt: "2026-08-20T00:00:00.000Z",
});

const CHUNKS = [
  chunk("ley:1616:2013:art:1", "Ley 1616 de 2013, artículo 1", TEXTO_1),
  chunk("ley:2460:2025:art:3", "Ley 2460 de 2025, artículo 3", TEXTO_3),
];

/** Arma la respuesta cruda del modelo tal como llega: una cadena JSON. */
const respuesta = (frases: unknown[]) => JSON.stringify({ frases });

describe("construirEvidencia", () => {
  /**
   * `chunk_id` es lo que se COMPARA al validar; `referencia` lo que ve el
   * lector. Si la validación dependiera de cómo se redacta una referencia,
   * cambiar un título rompería las citas.
   */
  it("separa el identificador que se valida de la referencia que se muestra", () => {
    const e = construirEvidencia(CHUNKS);
    expect(e[0]?.chunk_id).toBe("ley:1616:2013:art:1");
    expect(e[0]?.referencia).toBe("Ley 1616 de 2013, artículo 1");
    expect(e[0]?.chunk_id).not.toBe(e[0]?.referencia);
  });

  it("manda el texto entero: es contra lo que se comprueba la literalidad", () => {
    expect(construirEvidencia(CHUNKS)[0]?.texto).toBe(TEXTO_1);
  });
});

describe("parsearRespuesta — sin fiarse de la forma", () => {
  it("lee el JSON limpio", () => {
    const f = parsearRespuesta(
      respuesta([{ texto: "x", citas: [{ chunk_id: "a", cita_textual: "y" }] }]),
    );
    expect(f[0]?.citas[0]?.chunk_id).toBe("a");
  });

  it("aguanta el ```json que un modelo añade de más", () => {
    const f = parsearRespuesta("```json\n" + respuesta([{ texto: "x", citas: [] }]) + "\n```");
    expect(f).toHaveLength(1);
  });

  it("rescata el objeto cuando viene con prosa alrededor", () => {
    const f = parsearRespuesta(`Claro, aquí tienes: ${respuesta([{ texto: "x", citas: [] }])} .`);
    expect(f).toHaveLength(1);
  });

  /**
   * Una frase SIN citas se conserva con la lista vacía para que `validarCitas`
   * la elimine y la CUENTE. Descartarla aquí escondería cuánta respuesta venía
   * sin apoyo, que es justo la métrica que interesa.
   */
  it("la frase sin citas no se descarta aquí: se pasa para que se cuente", () => {
    const f = parsearRespuesta(respuesta([{ texto: "Suena bien.", citas: [] }]));
    expect(f).toHaveLength(1);
    expect(f[0]?.citas).toEqual([]);
  });

  /**
   * «DECLINÓ» Y «NO SE PUDO LEER» NO SON LO MISMO, y salían idénticos.
   *
   * Los tres casos de abajo son FALLOS del proveedor, y devolver `[]` los
   * confundía con una respuesta legítima de cero frases. Aguas abajo eso se
   * imprimía como «no está en lo capturado»: un fallo del sistema comunicado
   * como una afirmación sobre el corpus, que es justo la distinción que este
   * proyecto vigila.
   */
  it("un fallo de lectura LANZA, no se disfraza de respuesta vacía", () => {
    expect(() => parsearRespuesta("lo siento, no puedo")).toThrow(RespuestaIlegible);
    expect(() => parsearRespuesta('{"respuesta": "hola"}')).toThrow(/`frases`/);
    expect(() => parsearRespuesta("{roto")).toThrow(/no hay ningún objeto JSON/);
    expect(() => parsearRespuesta('{"frases": [roto}')).toThrow(/no se pudo analizar/);
  });

  /** Y el modelo que declina BIEN sigue devolviendo la lista vacía, sin lanzar. */
  it("cero frases declaradas es una respuesta válida, no un fallo", () => {
    expect(parsearRespuesta(respuesta([]))).toEqual([]);
  });
});

describe("verificarTextualidad — la comprobación que sustituye a la API", () => {
  /**
   * LA PIEZA QUE SOSTIENE R2 FUERA DE LA CITATIONS API. La API garantizaba que
   * `cited_text` era literal del bloque; aquí se comprueba contra el texto que
   * se envió, que es una garantía más fuerte, no un apaño.
   */
  it("tira la cita entrecomillada que la fuente NO dice", () => {
    const { frases, noLiterales } = verificarTextualidad(
      [
        {
          texto: "La ley crea un fondo de salud mental.",
          citas: [{ chunk_id: "ley:1616:2013:art:1", cita_textual: "crea el Fondo Nacional" }],
        },
      ],
      CHUNKS,
    );
    expect(frases[0]?.citas).toEqual([]);
    expect(noLiterales[0]?.chunkId).toBe("ley:1616:2013:art:1");
  });

  it("acepta la cita literal", () => {
    const { frases, noLiterales } = verificarTextualidad(
      [
        {
          texto: "La ley garantiza el derecho.",
          citas: [
            { chunk_id: "ley:1616:2013:art:1", cita_textual: "garantizar el ejercicio pleno" },
          ],
        },
      ],
      CHUNKS,
    );
    expect(frases[0]?.citas).toEqual(["ley:1616:2013:art:1"]);
    expect(noLiterales).toEqual([]);
  });

  /**
   * Tolerar comillas curvas y saltos de línea NO es bajar el listón: es no
   * rechazar citas honestas por cómo se copió un carácter. Lo que no se tolera
   * es una palabra distinta.
   */
  it("tolera tildes, comillas y espacios; no tolera otra palabra", () => {
    const ok = verificarTextualidad(
      [
        {
          texto: "x",
          citas: [
            { chunk_id: "ley:1616:2013:art:1", cita_textual: "GARANTIZAR   el  ejercicio pleno" },
          ],
        },
      ],
      CHUNKS,
    );
    expect(ok.frases[0]?.citas).toEqual(["ley:1616:2013:art:1"]);

    const no = verificarTextualidad(
      [
        {
          texto: "x",
          citas: [
            { chunk_id: "ley:1616:2013:art:1", cita_textual: "garantizar el ejercicio parcial" },
          ],
        },
      ],
      CHUNKS,
    );
    expect(no.frases[0]?.citas).toEqual([]);
  });

  /**
   * SE DESCARTAN IGUAL Y NO SIGNIFICAN LO MISMO. «la» aparece literalmente en el
   * texto: denunciarla como «cita que la fuente no dice» sería acusar al modelo
   * de fabricar algo que la fuente sí dice, y esa acusación es justo la métrica
   * que el gold set garantiza. El motivo las separa.
   */
  it("una cita demasiado corta no cuenta como cita, y se marca como tal", () => {
    const { frases, noLiterales } = verificarTextualidad(
      [{ texto: "x", citas: [{ chunk_id: "ley:1616:2013:art:1", cita_textual: "la" }] }],
      CHUNKS,
    );
    expect(frases[0]?.citas).toEqual([]);
    expect(noLiterales[0]?.motivo).toBe("demasiado_corta");
  });

  it("la que la fuente NO dice se marca `no_literal`, que es lo grave", () => {
    const { noLiterales } = verificarTextualidad(
      [
        {
          texto: "x",
          citas: [{ chunk_id: "ley:1616:2013:art:1", cita_textual: "crea el Fondo Nacional" }],
        },
      ],
      CHUNKS,
    );
    expect(noLiterales[0]?.motivo).toBe("no_literal");
  });

  /**
   * Una cita a un chunk que no se le pasó al modelo se deja pasar a
   * `validarCitas`, que la cuenta como fantasma. Contarla aquí TAMBIÉN haría
   * ilegible la métrica: el mismo fallo aparecería con dos nombres.
   */
  it("el chunk desconocido no se juzga aquí: se deja para `validarCitas`", () => {
    const { frases, noLiterales } = verificarTextualidad(
      [{ texto: "x", citas: [{ chunk_id: "ley:9999:2099:art:1", cita_textual: "lo que sea" }] }],
      CHUNKS,
    );
    expect(frases[0]?.citas).toEqual(["ley:9999:2099:art:1"]);
    expect(noLiterales).toEqual([]);
  });
});

describe("procesarRespuesta — de punta a punta", () => {
  it("publica lo citado y arma las referencias legibles", () => {
    const r = procesarRespuesta(
      respuesta([
        {
          texto: "El artículo 1 fue modificado en 2025.",
          citas: [{ chunk_id: "ley:2460:2025:art:3", cita_textual: "Modifíquese el artículo 1o" }],
        },
      ]),
      CHUNKS,
    );
    expect(r.texto).toBe("El artículo 1 fue modificado en 2025.");
    expect(r.referencias.map((x) => x.referencia)).toEqual(["Ley 2460 de 2025, artículo 3"]);
    // Con procedencia: es lo que hace la cita comprobable en vez de creíble.
    expect(r.referencias[0]?.urlFuente).toBe("http://x/y.html");
    expect(r.referencias[0]?.capturedAt).toBe("2026-08-20T00:00:00.000Z");
    expect(r.noLiterales).toEqual([]);
  });

  it("una frase inventada se cae y no llega al texto", () => {
    const r = procesarRespuesta(
      respuesta([
        {
          texto: "Con cita.",
          citas: [{ chunk_id: "ley:1616:2013:art:1", cita_textual: "Derecho a la Salud Mental" }],
        },
        { texto: "Sin cita, pero convincente.", citas: [] },
      ]),
      CHUNKS,
    );
    expect(r.texto).toBe("Con cita.");
    expect(r.texto).not.toContain("convincente");
    expect(r.validacion.tasaSupervivencia).toBe(0.5);
  });

  /**
   * La frase con una cita LITERALMENTE FALSA es el caso que la Citations API
   * hacía imposible y aquí hay que atrapar a mano. No se publica.
   */
  it("la frase apoyada en una cita que la fuente no dice no se publica", () => {
    const r = procesarRespuesta(
      respuesta([
        {
          texto: "La ley creó un impuesto del 19 %.",
          citas: [{ chunk_id: "ley:1616:2013:art:1", cita_textual: "un impuesto del 19 %" }],
        },
      ]),
      CHUNKS,
    );
    expect(r.texto).toBe("");
    expect(r.noLiterales).toHaveLength(1);
  });

  /**
   * Si no queda nada publicable, `texto` es la cadena vacía. Quien llame tiene
   * que tratarlo como «no hay evidencia suficiente», no como respuesta corta.
   */
  it("sin nada citado devuelve texto vacío, no una respuesta corta", () => {
    const r = procesarRespuesta(respuesta([{ texto: "Todo inventado.", citas: [] }]), CHUNKS);
    expect(r.texto).toBe("");
    expect(r.referencias).toEqual([]);
  });

  it("una cita a un chunk que no se le dio se reporta como fantasma", () => {
    const r = procesarRespuesta(
      respuesta([
        {
          texto: "x",
          citas: [{ chunk_id: "ley:9999:2099:art:1", cita_textual: "cualquier cosa" }],
        },
      ]),
      CHUNKS,
    );
    expect(r.validacion.citasFantasma).toEqual(["ley:9999:2099:art:1"]);
    expect(r.texto).toBe("");
  });

  it("una respuesta que no es JSON no se interpreta como respuesta: lanza", () => {
    expect(() => procesarRespuesta("No puedo ayudarte con eso.", CHUNKS)).toThrow(
      RespuestaIlegible,
    );
  });
});

describe("la instrucción del sistema", () => {
  /**
   * Los fallos de este tipo de asistente son por EXCESO: responder de más,
   * suavizar una negativa, convertir «no consta» en «no hay». Por eso la
   * instrucción dedica más espacio a lo que no debe hacer.
   */
  it("nombra las cuatro confusiones que el gold set castiga", () => {
    expect(SISTEMA).toContain("No consta en el corpus");
    expect(SISTEMA).toContain("Un proyecto de ley NO es una ley");
    expect(SISTEMA).toContain("archivo NO significa que el tema esté cerrado");
    expect(SISTEMA).toContain("NO significa que no exista");
  });

  it("prohíbe afirmar vigencia sin fuente y dar asesoría jurídica", () => {
    expect(SISTEMA).toContain("No afirmes que una norma está vigente");
    expect(SISTEMA).toContain("No des asesoría jurídica");
  });

  /**
   * El contrato de salida vive en la instrucción, no en un comentario: es lo
   * único que hace que `parsearRespuesta` tenga algo que parsear.
   */
  it("declara el contrato de salida y avisa de que la cita se comprueba", () => {
    expect(SISTEMA).toContain('"cita_textual"');
    expect(SISTEMA).toContain("COPIADO LETRA POR LETRA");
    expect(SISTEMA).toContain("se descarta");
  });
});
