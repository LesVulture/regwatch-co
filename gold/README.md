# Gold set — preguntas con respuesta anotada contra fuente primaria

**Preregistrado.** Las preguntas se escriben ANTES de que exista el Q&A y no se
tocan para que el sistema apruebe. Si una respuesta esperada resulta estar mal,
se corrige con la fuente delante y se deja constancia en el historial de git —
que es justo para lo que sirve tenerlo versionado.

## Por qué existe ya, en la Fase 1

El plan lo agendaba en la **Fase 4** y lo *usaba* en la **Fase 2** («el bake-off
contra el gold set»), seis semanas antes de existir. No necesita corpus
embebido: necesita preguntas con respuesta verificable, y el trámite legislativo
de la Fase 1 ya da material de sobra.

## Qué mide, y por qué no son preguntas fáciles

Un gold set de preguntas amables solo mide si el sistema sabe recitar. Estas
están escogidas por dónde **rompen**:

| Tipo | Qué comprueba |
|------|---------------|
| `factual` | Que sepa contar y citar sin inventar |
| `negacion` | Que diga **«no hay»** en vez de fabricar un resultado plausible. Es el fallo más caro de un buscador jurídico |
| `premisa_falsa` | Que **corrija la premisa** en vez de responder a una pregunta que no tiene sentido. «¿Qué dice la ley de IA colombiana?» presupone una ley que no existe |
| `rechazo` | Que **se niegue** cuando le falta fuente primaria. R1 dice que la vigencia nunca sale del LLM; aquí se comprueba que de verdad no sale |
| `multi_hop` | Que cruce dos hechos sin inventar el puente |
| `trampa_temporal` | Que distinga «archivado» de «nunca existió», y «vigente hasta donde sabemos» de «vigente para siempre» |

## Anclaje

Cada respuesta lleva `ancla`: de dónde sale y cómo re-verificarla. Las que salen
del trámite legislativo se re-verifican corriendo `pnpm collect:senado` y
consultando el artefacto; las de normatividad esperan a la Fase 2.

**Estado de la medición:** las cifras se re-midieron el **2026-08-21** sobre
1.693 proyectos de 5 legislaturas (artefacto `senado-pdly.json`; 2024-2025 pasó
de 471 a 470). Evidencia: `docs/verificacion-viva-2026-08-21.md`. Una cifra de
trámite **caduca**: un proyecto radicado hoy cambia de estado mañana. Por eso
cada pregunta declara `volatil: true|false` — las volátiles se re-miden antes de
cada evaluación, y una discrepancia NO es un fallo del sistema hasta
comprobarlo.
