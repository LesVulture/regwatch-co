/**
 * TUI de consulta. Misma frontera de egreso que la web y el MCP:
 * `web/src/lib/consultas.ts`. No hay taxonomía de temas ni chat de Q&A.
 */

import { render } from "ink";
import { createElement } from "react";
import { App } from "./app.tsx";
import { parsearArgv } from "./opciones.ts";

const flags = parsearArgv(process.argv.slice(2));
render(createElement(App, { flags }), { exitOnCtrlC: true });
