# Anexo de procedencia — investigación de campo para PLAN-V2

Estos 17 JSON son los **informes crudos** que fundamentan `PLAN-V2.md`. Se publican para que cualquiera pueda verificar de dónde salió cada cifra del plan, en vez de tener que creerle.

## Qué es y qué no es

**Es** material de investigación: notas de campo de 13 especialistas que abrieron cada fuente con peticiones reales entre el 2026-08-16 y el 2026-08-19, más 4 auditorías adversariales que los refutaron.

**No es** un dataset, ni un corpus, ni un producto. Nada de aquí alimenta la base de datos: el pipeline de ingesta de regwatch-co lee de las fuentes oficiales, nunca de este directorio.

## Estado de auditoría

**Las 13 especialidades están auditadas por un escéptico adversarial**, en dos rondas, más 4 verificaciones contra documentación viva.

| Ronda | Archivos | Veredictos |
|---|---|---|
| 1ª | `refute-{normativa,jurisprudencia,electoral,modelo-legal}.json` | 84 → 45 confirmados · 19 parciales · **15 refutados** · 5 no verificables |
| 2ª | `refute2-{congreso,prensa,supabase-infra,frontend,ingesta,ai-layer,legal-ai,comparables}.json` | 165 → 82 confirmados · 57 parciales · **22 refutados** · 4 no verificables |
| Docs | `docs-{frontend-stack,ingesta-stack,supabase-features,ai-apis}.json` | 54 ítems verificados contra documentación oficial · 15 no vigentes |
| Diseño | `wf2-diseno-*.json`, `wf2-juicio-*.json`, `wf2-esceptico-diseno.json`, `wf3-sintesis-14.json` | panel de 3 diseños + 2 juicios + 1 escéptico + la síntesis que produjo §14 |
| Sobre el plan | `wf3-critico-completitud.json`, `wf3-auditor-legal.json` | 16 + 19 hallazgos, 8 de ellos bloqueantes, sobre el plan cruzado consigo mismo |

**Total: 249 veredictos sobre la investigación, más 35 hallazgos sobre el plan mismo. De los veredictos, 37 refutados y 76 corregidos en parte.** Es decir: **el 15 % de lo investigado resultó falso y otro 30 % inexacto.** Léase todo con esa tasa delante — incluidas las auditorías, que también se equivocan.

Dos advertencias de método que salieron de las propias auditorías y que conviene respetar al releer estos ficheros:

1. **No uses `grep -o` con ventana fija de caracteres sobre estos JSON.** Son ficheros de una sola línea muy larga y ese `grep` **falla en silencio**, devolviendo vacío para cadenas que sí están. Un auditor estuvo a punto de publicar dos refutaciones falsas por eso. Usa `python3` con `json.load()`.
2. **Cuatro auditorías declararon haber recibido su input truncado** (`refute-electoral`, `refute-normativa`, y los dos juicios de diseño `wf2-juicio-*`). Lo dijeron ellas mismas en su campo `overall`/`veredicto`, que es el comportamiento correcto; sus conclusiones cubren solo lo que llegaron a ver.

## Citas de terceros

Algunos informes citan **fragmentos breves** de las fuentes analizadas para documentar la estructura técnica del campo — por ejemplo, **106 palabras (531 caracteres)** del `insRow1()` de la Ley 100 en `normativa.json`, con elipsis, sobre un archivo fuente de 283.184 bytes.

Son **citas técnicas con fines de análisis y crítica**, amparadas por el artículo 31 de la Ley 23 de 1982, y su contenido es mayoritariamente hecho jurídico no protegible (número de ley, número de Diario Oficial, fecha de entrada en vigor). No sustituyen ni reproducen la obra citada.

Esto no contradice la regla operativa del sistema, que se mantiene intacta: **las notas de vigencia de Avance Jurídico son *leads*, nunca registros almacenados**. Lo que regwatch-co guarda es el texto normativo de dominio público y la arista de afectación verificada contra el Diario Oficial. Ver `PLAN-V2.md` §5.2 y §12.

## Higiene

El token de sesión de SAMAI (Consejo de Estado) que aparecía en `jurisprudencia.json` fue truncado. Era un JWT de ~1 hora de vida, sin credenciales de usuario, generado por el propio investigador para un documento público; se recorta por higiene, no porque diera acceso a nada.

Las direcciones IP que aparecen en los informes son de **servidores públicos** resueltos por DNS (`suin-juriscol.gov.co`, `secretariasenado.gov.co`, `imprenta.gov.co`, `curul501.org`), citadas al documentar timeouts y conexiones rechazadas. No hay IPs de clientes.

**Sobre datos personales, con precisión.** Un barrido de correos, teléfonos móviles colombianos y cédulas sobre los 17 archivos devuelve **un solo registro de persona identificable**: en `refute-electoral.json`, la muestra `{"Nombre":"Óscar David Benavides Angulo","Comision":"Comisión Primera Constitucional Permanente","IdComision":1,"Correo":"oscar.benavides@camara.gov.co"}`, usada para probar que el blob `departamentosInfo` trae la comisión sin visitar 181 perfiles.

Se conserva porque es **dato público de un servidor público en ejercicio**: un representante a la Cámara en funciones, con su correo **institucional** `@camara.gov.co` tal como la Cámara lo publica en su directorio abierto para contacto ciudadano, y cuya publicación ordena la Ley 1712 de 2014. No hay teléfono, cédula, dirección ni dato de contacto privado en ningún archivo.

Aun así, el tratamiento de datos de congresistas —figuras públicas, pero personas— es una de las preguntas abiertas que `PLAN-V2.md` §13.4 manda resolver antes de publicar el producto. Aquí solo se documenta lo que hay.
