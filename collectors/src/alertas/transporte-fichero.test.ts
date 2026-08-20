/**
 * El transporte a fichero. Lo que se comprueba es que NO se disfrace de envío.
 */

import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enviarDigests } from "./envio.ts";
import { nombreFichero, serializar, transporteFichero } from "./transporte-fichero.ts";

const MENSAJE = {
  para: "daniel@example.com",
  asunto: "regwatch-co · 2 novedades en los temas que sigues",
  texto: "Cuerpo del digest.",
  listUnsubscribe: "<https://regwatch.co/baja?t=abc>",
};

describe("transporteFichero", () => {
  /**
   * El nombre es la advertencia. Un fichero llamado `digest-…` invitaría a
   * creer que salió; nadie recibió nada.
   */
  it("el nombre del fichero dice que NO se envió", () => {
    expect(nombreFichero(MENSAJE, "2026-08-20", 1)).toMatch(/^SIN-ENVIAR-/);
  });

  it("el destinatario va en el nombre, saneado", () => {
    expect(nombreFichero({ ...MENSAJE, para: "a b/c@x.com" }, "s", 2)).toContain("a_b_c@x.com");
  });

  it("serializa con las cabeceras que harían falta para mandarlo", () => {
    const s = serializar(MENSAJE);
    expect(s).toContain("To: daniel@example.com");
    expect(s).toContain("Subject: regwatch-co");
    expect(s).toContain("List-Unsubscribe: <https://regwatch.co/baja?t=abc>");
    expect(s).toContain("Cuerpo del digest.");
  });

  /**
   * LA REGLA QUE NO SE RELAJA POR SER LOCAL: un envío, un destinatario. Cada
   * mensaje a su fichero, igual que cada mensaje a su correo. Si aquí se
   * agruparan, el día del proveedor real alguien copiaría la agrupación.
   */
  it("un fichero por destinatario, igual que un envío por destinatario", async () => {
    const dir = mkdtempSync(join(tmpdir(), "regwatch-digests-"));
    const t = transporteFichero("2026-08-20", dir);

    const r = await enviarDigests(
      [
        {
          suscripcionId: "s1",
          correo: "uno@example.com",
          texto: "a",
          novedades: 1,
          tokenBaja: "t1",
        },
        {
          suscripcionId: "s2",
          correo: "dos@example.com",
          texto: "b",
          novedades: 2,
          tokenBaja: "t2",
        },
      ],
      t,
      "https://regwatch.co/baja",
    );

    expect(r.enviados).toBe(2);
    const ficheros = readdirSync(dir).sort();
    expect(ficheros).toHaveLength(2);
    // Cada fichero lleva UN `To:`, no dos.
    for (const f of ficheros) {
      const contenido = readFileSync(join(dir, f), "utf-8");
      expect(contenido.match(/^To: /gm)).toHaveLength(1);
    }
    expect(readFileSync(join(dir, ficheros[0] as string), "utf-8")).toContain("uno@example.com");
  });
});
