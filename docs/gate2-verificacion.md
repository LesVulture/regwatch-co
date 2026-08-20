# Gate 2 — Extensiones y esquema, verificados contra la instancia real

**Fecha:** 2026-08-20 · **Instancia:** Supabase Free, región `us-east-1`, plan Nano
**Postgres:** 17.6 (`server_version_num` 170006)

El gate decía, literalmente: *«presencia en catálogo **no** es lo mismo que
`CREATE EXTENSION` exitoso»*. Así que se comprobaron las dos cosas por separado.

## 1. Extensiones

| Extensión | Disponible | Creada | Versión | Esquema final |
|---|---|---|---|---|
| `pgcrypto` | ✓ | ✓ | 1.3 | `extensions` |
| `unaccent` | ✓ | ✓ | 1.1 | `extensions` |
| `vector` | ✓ | ✓ | **0.8.2** | `extensions` |
| `pg_trgm` | ✓ | ✓ | 1.6 | `extensions` |
| `pg_net` | ✓ | ✓ | 0.20.4 | `extensions` |
| `pg_cron` | ✓ | ✓ | 1.6.4 | `pg_catalog` |
| `pgmq` | ✓ | ✓ | 1.5.1 | `pgmq` |

`vector` 0.8.2 soporta `halfvec`, que es lo que §8.4 presupone para los 256 dims.

**Hallazgo:** `pg_net` **no admite `ALTER EXTENSION ... SET SCHEMA`** — devuelve
`0A000: extension "pg_net" does not support SET SCHEMA`. Hay que crearla ya en
`extensions`; moverla después obliga a `drop` + `create`. Ahora es gratis porque
no la usa nadie; en la Fase 5 no lo sería.

## 2. El wrapper `IMMUTABLE` de `unaccent` — la premisa, probada en las dos direcciones

El plan afirmaba que sin el wrapper la tabla de búsqueda de §8.3 «no se crea».
No era una cautela teórica y ahora tampoco es una cita de segunda mano:

| Caso | Resultado |
|---|---|
| Columna generada con `unaccent()` pelado | **rechazada** — `generation expression is not immutable` |
| Columna generada con `public.immutable_unaccent()` | creada ✓ |
| Buscar «sancion» (sin tilde) encuentra «Sanción presidencial» | ✓ |
| Buscar «gestión» (con tilde) encuentra «Gestión normativa» | ✓ |
| Buscar «adopcion tecnologias» encuentra el texto con tildes | ✓ |
| **Control negativo:** buscar «pesca», que no está | 0 filas ✓ |

## 3. R1 no es una promesa en prosa: es un `CHECK` que rechaza

Ocho sondas contra el esquema desplegado. Siete debían ser rechazadas y una
—el control positivo— aceptada. **Las ocho se comportaron:**

| Sonda | Esperado | Resultado |
|---|---|---|
| 1. `fecha_efecto` sin procedencia | rechazo | rechazada ✓ |
| 2. `derivada_deterministicamente` sin escribir la regla | rechazo | rechazada ✓ |
| 3. Vigencia declarada con tier no primario | rechazo | rechazada ✓ |
| 4. Arista sin cláusula citada (`texto_soporte` en blanco) | rechazo | rechazada ✓ |
| 5. Norma que se afecta a sí misma | rechazo | rechazada ✓ |
| 6. Captura bloqueada sin motivo | rechazo | rechazada ✓ |
| 7. URL que no es `http(s)` | rechazo | rechazada ✓ |
| 8. **Control positivo:** afectación bien formada | aceptación | aceptada ✓ |

El control positivo importa tanto como los rechazos: un esquema que lo rechaza
todo también «pasa» siete sondas de siete, y sería inútil.

## 4. RLS: corrección de orden respecto al plan

El plan agendaba «Auth + RLS» en la **Fase 5**. Es un error de orden, y el
linter de Supabase lo marcó como **ERROR** en las cuatro tablas: en cuanto una
tabla existe en `public`, PostgREST la expone. Se corrigió en la Fase 0.

Verificado asumiendo el rol `anon`:

| Acción de `anon` | Resultado |
|---|---|
| LEE `norma` | lee ✓ *(es el objetivo: el dato es público)* |
| ESCRIBE `norma` | denegado ✓ |
| MODIFICA `norma` | denegado ✓ (0 filas) |
| BORRA `norma` | denegado ✓ (0 filas) |
| LEE `captura` (telemetría de ingesta) | no ve nada ✓ |

**Estado final del linter de seguridad:** 0 ERROR, 0 WARN, 1 INFO
(`rls_enabled_no_policy` sobre `captura`) — y ese INFO **es la decisión**, no un
descuido: `captura` guarda `blob_uri` y la traza de gates, que no es contenido
para el ciudadano.
