import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import type { ParamsFiltro } from "../../web/src/lib/filtros.ts";
import { etiquetaCamara, etiquetaEstado, etiquetaOrigen } from "../../web/src/lib/filtros.ts";
import { correrBusqueda, correrFicha, lineaFila, pieFila } from "./consultar.ts";
import {
  anterior,
  CAMARAS_CICLO,
  ESTADOS_CICLO,
  LEGISLATURAS_CICLO,
  siguiente,
  TIPOS_CICLO,
} from "./opciones.ts";

type Campo = "q" | "tipo" | "legislatura" | "estado" | "camara" | "anio" | "lista" | "ficha";

const CAMPOS_FILTRO: readonly Campo[] = ["q", "tipo", "legislatura", "estado", "camara", "anio"];

export function App({ flags }: { flags: ParamsFiltro }) {
  const { exit } = useApp();
  const [q, setQ] = useState(flags.q ?? "");
  const [tipo, setTipo] = useState(flags.tipo ?? "");
  const [legislatura, setLegislatura] = useState(flags.legislatura ?? "");
  const [estado, setEstado] = useState(flags.estado ?? "");
  const [camara, setCamara] = useState(flags.camara ?? "");
  const [anio, setAnio] = useState(flags.anio ?? "");
  const [campo, setCampo] = useState<Campo>("q");
  const [filas, setFilas] = useState<readonly Record<string, unknown>[]>([]);
  const [indice, setIndice] = useState(0);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sinSemantica, setSinSemantica] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function params(): ParamsFiltro {
    return {
      q,
      ...(tipo ? { tipo } : {}),
      ...(legislatura ? { legislatura } : {}),
      ...(estado ? { estado } : {}),
      ...(camara ? { camara } : {}),
      ...(anio ? { anio } : {}),
    };
  }

  async function buscarAhora() {
    setCargando(true);
    setError(null);
    setDetalle(null);
    const r = await correrBusqueda(params());
    setFilas(r.filas);
    setIndice(0);
    setAviso(r.aviso);
    setSinSemantica(r.sinSemantica);
    setError(r.error);
    setCargando(false);
    if (r.filas.length > 0) setCampo("lista");
  }

  async function abrirFicha() {
    const fila = filas[indice];
    if (!fila) return;
    setCargando(true);
    try {
      setDetalle(await correrFicha(fila));
      setCampo("ficha");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: un disparo al montar con argv
  useEffect(() => {
    if ((flags.q ?? "") !== "") void buscarAhora();
  }, []);

  useInput((input, key) => {
    if (cargando) return;
    if (campo === "ficha") {
      if (key.escape || input === "q") {
        setCampo("lista");
        setDetalle(null);
      }
      return;
    }
    if (campo === "lista") {
      if (input === "q") {
        exit();
        return;
      }
      if (key.escape) {
        setCampo("q");
        return;
      }
      if (key.upArrow) setIndice((i) => Math.max(0, i - 1));
      if (key.downArrow) setIndice((i) => Math.min(Math.max(filas.length - 1, 0), i + 1));
      if (key.return) void abrirFicha();
      return;
    }
    if (key.tab) {
      const i = CAMPOS_FILTRO.indexOf(campo);
      setCampo(CAMPOS_FILTRO[(i + 1) % CAMPOS_FILTRO.length] ?? "q");
      return;
    }
    if (key.return) {
      void buscarAhora();
      return;
    }
    if (campo === "q") {
      if (key.backspace || key.delete) setQ((s) => s.slice(0, -1));
      else if (input && !key.ctrl) setQ((s) => s + input);
      return;
    }
    if (campo === "anio") {
      if (key.backspace || key.delete) setAnio((s) => s.slice(0, -1));
      else if (/^\d$/.test(input)) setAnio((s) => (s + input).slice(0, 4));
      return;
    }
    const dir = key.rightArrow || input === " " ? 1 : key.leftArrow ? -1 : 0;
    if (dir === 0) return;
    const ciclo = dir === 1 ? siguiente : anterior;
    if (campo === "tipo") setTipo((v) => ciclo(TIPOS_CICLO, v));
    if (campo === "legislatura") setLegislatura((v) => ciclo(LEGISLATURAS_CICLO, v));
    if (campo === "estado") setEstado((v) => ciclo(ESTADOS_CICLO, v));
    if (campo === "camara") setCamara((v) => ciclo(CAMARAS_CICLO, v));
  });

  const marca = (c: Campo) => (campo === c ? ">" : " ");

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>regwatch-co</Text>
      <Text dimColor>Tab filtros · ←→ valor · Enter busca · ↑↓ lista · q sale</Text>
      {sinSemantica ? (
        <Text color="yellow">
          Solo búsqueda léxica en esta consulta: {sinSemantica}. Los resultados que únicamente
          encontraría el vector no aparecen.
        </Text>
      ) : null}
      {aviso ? <Text color="yellow">{aviso}</Text> : null}
      {error ? <Text color="red">No se pudo consultar: {error}</Text> : null}
      {cargando ? <Text>Consultando lo capturado…</Text> : null}

      {campo !== "ficha" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            {marca("q")} q: {q}
            {campo === "q" ? "█" : ""}
          </Text>
          <Text>
            {marca("tipo")} tipo: {tipo ? etiquetaOrigen(tipo) : "(todos)"}
          </Text>
          <Text>
            {marca("legislatura")} legislatura: {legislatura || "(cualquiera)"}
          </Text>
          <Text>
            {marca("estado")} estado: {estado ? etiquetaEstado(estado) : "(cualquiera)"}
          </Text>
          <Text>
            {marca("camara")} camara: {camara ? etiquetaCamara(camara) : "(cualquiera)"}
          </Text>
          <Text>
            {marca("anio")} anio: {anio}
            {campo === "anio" ? "█" : ""}
          </Text>
        </Box>
      ) : null}

      {campo === "ficha" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Esc vuelve a la lista</Text>
          <Text>{detalle}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {filas.map((f, i) => (
            <Box key={String(f.id)} flexDirection="column">
              <Text inverse={campo === "lista" && i === indice} wrap="truncate">
                {lineaFila(f)}
              </Text>
              <Text dimColor wrap="truncate">
                {pieFila(f)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
