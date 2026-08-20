/**
 * MCP server de regwatch-co.
 *
 * Expone la consulta normativa a un agente. Y eso cambia el modelo de amenaza,
 * no solo la interfaz: **un agente itera sin cansarse**. Lo que un humano haría
 * cien veces, un agente lo hace cien mil, así que cualquier dato que salga por
 * aquí sale, en la práctica, en bloque.
 *
 * De ahí que el contexto de egreso sea `"mcp"` y no `"ficha_individual"`, y de
 * ahí que el correo institucional de un congresista NUNCA salga por este canal
 * aunque sea perfectamente legítimo mostrarlo en su ficha web. Es la misma
 * distinción de §15.4 del plan, aplicada donde de verdad importa.
 *
 * Las herramientas son de SOLO LECTURA. No hay ninguna que escriba: un agente
 * con capacidad de escribir en el corpus podría contaminar la evidencia, y la
 * evidencia es lo único que este proyecto tiene.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buscar, vigencia } from "../../web/src/lib/consultas.ts";
import { consultanteDesdeEntorno } from "../../web/src/lib/supabase.ts";

const server = new McpServer({ name: "regwatch-co", version: "0.1.0" });

/**
 * Texto que acompaña a TODA respuesta.
 *
 * Un agente que recibe una lista de resultados tiende a presentarlos como «lo
 * que hay». Estas dos frases son las que impiden que un vacío se convierta en
 * una afirmación, y van en la respuesta —no en la descripción de la
 * herramienta— porque la descripción se lee una vez y la respuesta, siempre.
 */
const ADVERTENCIA_SIEMPRE =
  "\n\n---\n" +
  "Procedencia: cada resultado trae su URL y su fecha de captura; cítalas.\n" +
  "La ausencia de resultados significa que no está en lo capturado, NO que no exista.\n" +
  "Esto no es asesoría jurídica: la lectura jurídica se hace sobre el texto oficial.";

server.registerTool(
  "buscar_normatividad",
  {
    title: "Buscar en normatividad, proyectos de ley y jurisprudencia",
    description:
      "Busca por texto en el corpus colombiano: normas, proyectos de ley en trámite " +
      "y providencias de la Corte Constitucional. Devuelve cada resultado con su " +
      "fuente verificable y su fecha de captura. NO afirma vigencia: para eso, " +
      "usa `consultar_vigencia`.",
    inputSchema: {
      consulta: z.string().min(1).describe("Términos a buscar, en español."),
      limite: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ consulta, limite }) => {
    // Contexto `mcp`: la política de egreso aplica su criterio de bloque.
    const r = await buscar(consultanteDesdeEntorno(), consulta, "mcp", limite);
    const cuerpo =
      r.filas.length === 0
        ? (r.advertencia ?? "Sin resultados.")
        : r.filas
            .map(
              (f) =>
                `- [${String(f.origen)}] ${String(f.referencia ?? "")} — ${String(f.titulo ?? "")}\n` +
                `  fuente: ${String(f.url_fuente)} · capturado: ${String(f.captured_at ?? "").slice(0, 10)} · tier: ${String(f.tier)}`,
            )
            .join("\n");
    // Si la búsqueda se ensanchó, el aviso va DELANTE de los resultados y no en
    // la coletilla final. Un agente que recibe una lista la presenta como «lo
    // que hay»: enterarse al final de que el criterio era más laxo que el
    // pedido llega tarde.
    const aviso = r.ensanchada && r.advertencia ? `${r.advertencia}\n\n` : "";
    return { content: [{ type: "text", text: aviso + cuerpo + ADVERTENCIA_SIEMPRE }] };
  },
);

server.registerTool(
  "consultar_vigencia",
  {
    title: "Consultar la vigencia de una norma a una fecha",
    description:
      "Dice si una norma fue afectada (modificada, derogada, declarada inexequible…) " +
      "y desde cuándo, con la CLÁUSULA de la norma afectante que lo prueba. " +
      "Si no consta ninguna afectación lo dice explícitamente: eso NO significa " +
      "que la norma esté vigente sin cambios.",
    inputSchema: {
      tipo: z.string().describe("ley, decreto, acto_legislativo…"),
      numero: z.string().describe("El número, sin el año. Ej.: «1616»."),
      anio: z.number().int().min(1810).max(2100),
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Fecha a la que consultar la vigencia. Por defecto, hoy."),
    },
  },
  async ({ tipo, numero, anio, fecha }) => {
    const r = await vigencia(consultanteDesdeEntorno(), { tipo, numero, anio }, "mcp", fecha);
    const cuerpo =
      r.filas.length === 0
        ? (r.advertencia ?? "No consta ninguna afectación.")
        : r.filas
            .map(
              (f) =>
                `${String(f.veredicto)}\n` +
                `  artículo: ${String(f.articulo)} · por: ${String(f.norma_afectante)}\n` +
                `  Diario Oficial: ${String(f.diario_oficial ?? "—")} · efecto: ${String(f.fecha_efecto ?? "no determinable")}\n` +
                `  cláusula que lo prueba: «${String(f.clausula_prueba)}»\n` +
                `  regla: ${String(f.regla_aplicada)}\n` +
                `  ${String(f.procedencia)} · verificar: ${String(f.verificable_en)}`,
            )
            .join("\n\n");
    return { content: [{ type: "text", text: cuerpo + ADVERTENCIA_SIEMPRE }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
