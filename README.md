# regwatch-co

**Monitor normativo y legislativo colombiano con procedencia obligatoria.** Ningún dato entra sin URL checkeable, fecha de captura y una declaración explícita de qué tan lejos llega su evidencia.

La consulta que el proyecto existe para responder no es «búscame esta ley», es **«¿qué decía esta norma el 3 de marzo de 2024?»** — y responderla exige un grafo de afectaciones tipadas, no un buscador.

```
$ regwatch → /vigencia/ley/1616/2013

ley 1616 de 2013 · Vigencia a día de hoy

AFECTADA — el cambio ya surtió efecto a la fecha consultada
  Artículo 1 · por ley 2460 de 2025 · Diario Oficial 53.153 · efecto 2025-06-18
  «ARTÍCULO 3o. Modifíquese el artículo 1o de la Ley 1616 de 2013, el cual quedará así:»
  Regla: «La presente ley entrará a regir a partir de su sanción, promulgación y
         publicación en el Diario Oficial…» (Ley 2460 de 2025, art. 39) + DO 53.153
  declarado_en_norma · tier primaria · verificar en la fuente ↗
```

Esa cláusula entre comillas no es decorativa: **es la prueba**. Sin ella la fila no existe — lo impide una restricción del esquema, no una convención.

## Estado real

Esto es un proyecto en construcción y el README no va a decir otra cosa.

| | |
|---|---|
| ✅ **Recolección** | Senado (1.694 proyectos, 5 legislaturas), Corte Constitucional (21.661 providencias, 2015-2026), articulado por artículo. Corren contra las fuentes vivas |
| ✅ **Vigencia a fecha arbitraria** | Funciona de punta a punta, con la cláusula probatoria y su Diario Oficial |
| ✅ **Búsqueda léxica** | FTS en español sobre normas, proyectos y providencias |
| ✅ **Servidor MCP** | Dos herramientas de solo lectura, con advertencia de procedencia en cada respuesta |
| 🟡 **Corpus cargado** | La base tiene una **semilla**, no el corpus. Cargarlo requiere `SUPABASE_DB_URL` |
| 🟡 **Búsqueda semántica** | `hybrid_search` está entera y degrada exactamente a la léxica sin vectores. Los embeddings requieren `VOYAGE_API_KEY` |
| ⛔ **Q&A con citas** | La validación de citas (R2) y el contexto están escritos y probados; exponerlo requiere `ANTHROPIC_API_KEY` y superar el gold set |
| ⛔ **Alertas por correo** | El digest y el envío están escritos; enviar requiere un proveedor de correo |
| ⛔ **Cámara de Representantes** | El colector está escrito **con una guarda que impide correrlo** hasta que haya respuesta al derecho de petición (`legal/peticiones/`) |

**Lo que este proyecto no promete, y no lo va a prometer:** que los datos sean *ciertos*. Puede probar que son consistentes con lo que la fuente publicó, que la procedencia es la declarada y que nada llegó por un camino roto. Si la fuente oficial publica un dato equivocado, ningún gate lo ve. Por eso está prohibido en este repo el claim «datos validados» a secas — y el de «sin alucinaciones».

**Esto no es asesoría jurídica.** Es un índice con procedencia; la lectura jurídica se hace sobre el texto oficial, y cada resultado enlaza al suyo.

## Cómo se usa

Requiere **Node ≥ 24** (usa el *stripping* nativo de TypeScript, por eso los `import` llevan extensión `.ts`) y **pnpm 11**. `.nvmrc` fija 24; se desarrolla y verifica sobre 26.

```bash
git clone https://github.com/LesVulture/regwatch-co.git
cd regwatch-co
pnpm install

cp .env.example .env      # y rellena SUPABASE_URL y SUPABASE_ANON_KEY
pnpm web:dev              # http://localhost:3000
```

El `.env` va en la **raíz** del monorepo. La aplicación de Next vive en `web/` y no lo leería sola; `web/next.config.ts` lo carga explícitamente.

```bash
pnpm verify               # lint + typecheck + 330 tests + build de la web
pnpm collect:senado       # proyectos de ley → artefactos/senado-pdly.json
pnpm collect:corte        # providencias → artefactos/corte-relatoria.json
pnpm collect:articulado Ley 1616 2013
pnpm db:load              # carga el artefacto (requiere SUPABASE_DB_URL)
pnpm db:load-chunks artefactos/articulado-ley_1616_2013.json
```

Los colectores **no escriben nunca directo a la base**: producen un artefacto validado y un segundo paso lo importa. Es lo que permite mirar una corrida antes de que toque datos.

### Servidor MCP

```json
{
  "mcpServers": {
    "regwatch-co": {
      "command": "node",
      "args": ["/ruta/a/regwatch-co/mcp/src/server.ts"],
      "env": {
        "SUPABASE_URL": "https://TU-PROYECTO.supabase.co",
        "SUPABASE_ANON_KEY": "sb_publishable_..."
      }
    }
  }
}
```

Expone `buscar_normatividad` y `consultar_vigencia`. Las dos son de solo lectura y ninguna afirma vigencia sin fuente primaria.

## Cómo está hecho

Monorepo pnpm: `collectors/` (recolección, gates y RAG), `db/` (esquema e importadores), `web/` (Next 16) y `mcp/`. Postgres 17 con pgvector en Supabase.

Tres cosas que no son detalles de implementación:

1. **La vigencia nunca sale de un modelo de lenguaje.** `afectacion.fecha_derivation` lo hace cumplir con restricciones `CHECK`: una fecha sin procedencia no entra, y si se derivó por regla, la regla tiene que estar escrita.
2. **Cero filas no significa «vigente para siempre».** Significa que no consta ninguna afectación capturada. La interfaz lo dice con esas palabras.
3. **El aparato editorial de terceros no se republica.** El articulado es dominio público (art. 41 de la Ley 23 de 1982); las notas de vigencia y del editor de las compilaciones privadas **no lo son**, y hay un saneado estructural con tests que lo impide.

Las reglas completas están en **[GOVERNANCE.md](GOVERNANCE.md)**, que dice de cada una *dónde se hace cumplir*. El plan y sus correcciones medidas, en `PLAN-V2.md`.

## Licencia

MIT — ver [LICENSE](LICENSE). El código es MIT; el texto normativo que indexa es de sus fuentes oficiales y cada registro enlaza a la suya.
