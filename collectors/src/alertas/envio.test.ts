import { describe, expect, it } from "vitest";
import {
  asunto,
  type DigestListo,
  enviarDigests,
  informe,
  type MensajeSaliente,
  type Transporte,
} from "./envio.ts";

function transporteEspia(fallarPara: string[] = []) {
  const enviados: MensajeSaliente[] = [];
  const t: Transporte = {
    async enviar(m) {
      if (fallarPara.includes(m.para)) throw new Error("rebotado");
      enviados.push(m);
      return { id: `id-${enviados.length}` };
    },
  };
  return { t, enviados };
}

const d = (correo: string, novedades = 2): DigestListo => ({
  suscripcionId: `s-${correo}`,
  correo,
  texto: "Novedades…",
  novedades,
  tokenBaja: `tok-${correo}`,
});

describe("un envío, un destinatario", () => {
  /**
   * EL FALLO DEL QUE ESTE MÓDULO PROTEGE. Mandar el digest a N suscriptores con
   * las N direcciones en el mismo `To:` revela a cada uno quiénes son los
   * demás. Aquí es peor que en una lista cualquiera: la lista de destinatarios
   * de un monitor normativo es, en la práctica, la lista de quién sigue qué
   * tema jurídico — la misma información que GOVERNANCE §8.2 protege.
   */
  it("cada mensaje va a UNA sola dirección", async () => {
    const { t, enviados } = transporteEspia();
    await enviarDigests([d("a@x.test"), d("b@x.test"), d("c@x.test")], t, "https://r.test");
    expect(enviados).toHaveLength(3);
    for (const m of enviados) {
      expect(m.para).not.toContain(",");
      expect(m.para).not.toContain(";");
    }
    expect(enviados.map((m) => m.para)).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
  });

  /**
   * La API no admite una lista de destinatarios. No es una convención que se
   * respeta: es que el tipo no deja. Evitar la construcción entera es más
   * barato que revisar cada vez que no se usó mal.
   */
  it("el mensaje no tiene campo para copia ni copia oculta", async () => {
    const { t, enviados } = transporteEspia();
    await enviarDigests([d("a@x.test")], t, "https://r.test");
    const m = enviados[0] as unknown as Record<string, unknown>;
    expect(m.cc).toBeUndefined();
    expect(m.bcc).toBeUndefined();
    expect(Object.keys(m).sort()).toEqual(["asunto", "listUnsubscribe", "para", "texto"]);
  });
});

describe("robustez del lote", () => {
  /**
   * El rebote de una dirección no dice nada de las otras. Abortar el lote
   * dejaría sin aviso a todos los que venían detrás.
   */
  it("un fallo no detiene a los demás", async () => {
    const { t, enviados } = transporteEspia(["b@x.test"]);
    const r = await enviarDigests(
      [d("a@x.test"), d("b@x.test"), d("c@x.test")],
      t,
      "https://r.test",
    );
    expect(r.enviados).toBe(2);
    expect(r.fallidos).toHaveLength(1);
    expect(r.fallidos[0]?.para).toBe("b@x.test");
    expect(enviados.map((m) => m.para)).toEqual(["a@x.test", "c@x.test"]);
  });

  it("un digest sin novedades no se manda, y se cuenta aparte", async () => {
    const { t, enviados } = transporteEspia();
    const r = await enviarDigests([d("a@x.test", 0), d("b@x.test", 1)], t, "https://r.test");
    expect(r.enviados).toBe(1);
    expect(r.omitidos).toBe(1);
    expect(enviados).toHaveLength(1);
  });
});

describe("la baja tiene que ser fácil", () => {
  /**
   * Enlace de baja que funciona SIN iniciar sesión. Obligar a autenticarse para
   * darse de baja es una forma de retener a alguien que ya dijo que no, y la
   * Ley 1581 da derecho a la supresión sin fricción.
   */
  it("cada mensaje lleva su enlace de baja con token propio", async () => {
    const { t, enviados } = transporteEspia();
    await enviarDigests([d("a@x.test"), d("b@x.test")], t, "https://r.test");
    expect(enviados[0]?.listUnsubscribe).toBe("<https://r.test/baja/tok-a@x.test>");
    expect(enviados[0]?.listUnsubscribe).not.toBe(enviados[1]?.listUnsubscribe);
  });
});

describe("el informe de la corrida", () => {
  /**
   * Un log con los correos de los suscriptores es una filtración esperando a
   * que alguien comparta un log.
   */
  it("NO lleva direcciones", async () => {
    const { t } = transporteEspia(["b@x.test"]);
    const r = await enviarDigests([d("a@x.test"), d("b@x.test")], t, "https://r.test");
    const texto = informe(r);
    expect(texto).not.toContain("@x.test");
    expect(texto).toContain("enviados: 1");
    expect(texto).toContain("fallidos: 1");
  });
});

describe("asunto", () => {
  it("concuerda en singular y plural", () => {
    expect(asunto(1)).toContain("1 novedad ");
    expect(asunto(3)).toContain("3 novedades");
  });
});
