**INCA RAIL**

**TRAVEL HUB**

Documento de iniciativa: experiencia digital del cliente

**Versión consolidada con la Fase 1 del App Inca Rail**

Mobile-first · Antes, durante y después del viaje · Incluye experiencia
a bordo

| **Ficha** | **Detalle** |
|----|----|
| Propósito | Centralizar la experiencia del pasajero y convertir el post-compra en un canal de acompañamiento, servicio y venta. |
| Formato | Aplicación mobile-first. El formato (web/PWA sin descarga o app nativa) está pendiente de decisión; ver sección 27. |
| Alcance inicial | Viajes Inca Rail y experiencias/tours asociados, con capacidad de ampliar el portafolio a otras regiones del Perú. Se suma el acompañamiento a bordo del tren y en Machu Picchu Pueblo definido en la Fase 1 del App. |
| Principio | El cliente debe encontrar en un solo lugar qué tiene comprado, qué debe hacer ahora, qué viene después y qué puede agregar. |
| Documentos base | Inca Rail Travel Hub: Documento Detallado (base) y App Inca Rail Fase 1, Funcionalidades v4.0 (24/09/2026). |
| Versión y estado | v2.0 · 28 de septiembre de 2026 · Borrador de trabajo para validación |

**Cómo leer este documento.** Se conserva la estructura del Travel Hub
original. Lo que proviene de la Fase 1 del App se identifica con
etiquetas:

| **Etiqueta** | **Significado** |
|----|----|
| **NUEVO** | Elemento no considerado en el Travel Hub original. |
| **AMPLIADO** | Elemento ya considerado, con mayor detalle o alcance desde el App. |
| **DIVERGENCIA** | Punto donde ambos documentos plantean decisiones distintas (sección 27). |
| **YA CONSIDERADO** | Coincide con el Travel Hub original (solo en tablas de trazabilidad). |

**1. Resumen ejecutivo**

Travel Hub es una aplicación mobile-first de Inca Rail que acompaña al
cliente desde que compra hasta que termina su viaje. Su función
principal es transformar información dispersa (itinerario, trenes,
traslados, tours, hoteles, documentos, horarios y recomendaciones) en
una experiencia digital única, contextual y accionable.

No debe entenderse solo como un portal de consulta. Debe funcionar como
el "centro de control del viaje": el cliente entra para saber qué hacer
ahora, recibe alertas y contenido relevante, puede solicitar ayuda y,
cuando existe una oportunidad, puede comprar servicios adicionales sin
abandonar la experiencia.

La visión de evolución es pasar de un portal postventa a una capa
digital que conecte Journey + Service + Commerce + Data, permitiendo a
Inca Rail conocer el contexto del viaje para mejorar el servicio,
aumentar el attach/cross-sell y generar advocacy después de la
experiencia.

**NUEVO** Esta versión incorpora la definición de la Fase 1 del App Inca
Rail (v4.0, 24/09/2026): cuenta propia con vinculación del viaje
mediante boarding pass, avisos de incidencias y reubicaciones,
experiencia a bordo del tren (mapa del recorrido, WiFi, carta a bordo),
información práctica de Machu Picchu Pueblo y funcionamiento sin señal.
Estos elementos extienden el Travel Hub más allá del itinerario hacia el
momento en que el pasajero está dentro del tren.

**1.1 Qué cambia respecto al Travel Hub original**

De las 32 funcionalidades y características de la Fase 1 del App (21
funcionalidades y 11 transversales), el análisis de este documento
arroja:

| **Clasificación** | **Cantidad** | **Significado** |
|----|----|----|
| **NUEVO** | 14 | No estaba considerado en el Travel Hub. Se incorpora como nueva capacidad. |
| **AMPLIADO** | 8 | Ya existía a nivel conceptual; el App aporta detalle o alcance adicional. |
| **DIVERGENCIA** | 4 | Ambos documentos plantean decisiones distintas. Requiere resolución (sección 27). |
| **YA CONSIDERADO** | 6 | Coincide con lo que ya definía el Travel Hub. |

El detalle de cada ítem, con su ID de origen (A1 a F2 y T1 a T11), está
en el Anexo A. En el texto, las incorporaciones se marcan con las
etiquetas NUEVO, AMPLIADO y DIVERGENCIA.

**2. Problema / oportunidad**

| **Situación actual** | **Oportunidad con Travel Hub** |
|----|----|
| El viajero recibe información en distintos canales y formatos. | Unificar la información en una sola experiencia digital. |
| El cliente puede tener dudas sobre horarios, puntos de encuentro, tickets o próximos pasos. | Mostrar un timeline personalizado y la acción siguiente. |
| La compra termina cuando se confirma la reserva. | Extender el eCommerce al periodo post-compra. |
| Las oportunidades de venta adicional dependen de que el cliente vuelva a buscar productos. | Recomendar add-ons y experiencias según destino, fecha y etapa del viaje. |
| El soporte puede recibir consultas sin todo el contexto del viaje. | Chat/ayuda con contexto de reserva e itinerario. |
| Después del viaje existe poca interacción estructurada. | Convertir la experiencia en contenido, reseñas, referidos y advocacy. |
| **NUEVO** Los avisos de demoras y cambios operativos llegan hoy por WhatsApp. | Notificaciones push de incidencias y reubicaciones, complementando el aviso actual. |
| **NUEVO** Si el pasajero es reubicado, el nuevo boarding debe comunicarse por separado. | Actualización automática del boarding en el app. |
| **NUEVO** A bordo, la navegación y la información del recorrido no están integradas a la experiencia digital. | Mapa del recorrido con ETA, paquetes de WiFi y carta a bordo dentro del app. |
| **NUEVO** En la encuesta a pasajeros (jul-2026), el ingreso complicado fue la principal barrera de uso del InfoTrain. | Registro y vinculación del viaje en pocos pasos. |
| **NUEVO** Los pasajeros necesitan orientarse en Machu Picchu Pueblo y elegir entre circuitos. | Mapa de puntos de interés, ruta paso a paso y explicación de circuitos. |

**3. Objetivos de negocio**

- Mejorar la experiencia del cliente antes y durante el viaje.

- Reducir fricciones operativas y consultas repetitivas mediante
  información contextual y autoservicio.

- Incrementar la venta incremental mediante add-ons, upgrades, tours y
  productos complementarios.

- Aumentar el valor del cliente durante un mismo viaje, especialmente
  considerando que los visitantes de Cusco suelen permanecer varios
  días.

- Construir una base digital de comportamiento post-compra que permita
  personalizar comunicaciones y ofertas.

- Fortalecer la relación con el pasajero después de la experiencia,
  priorizando satisfacción, reseñas, contenido compartido y
  recomendación.

- Preparar una plataforma escalable para experiencias en Cusco y futuras
  regiones del Perú.

- **NUEVO** Comunicar incidencias, demoras y reubicaciones de forma
  inmediata y verificable dentro del app.

- **NUEVO** Detectar problemas durante el viaje de ida, mediante el
  pulso de experiencia, para actuar antes del retorno.

- **NUEVO** Generar ingresos por conectividad a bordo con la venta de
  paquetes de navegación WiFi.

- **NUEVO** Reducir la barrera de ingreso a la herramienta digital,
  tomando como referencia la experiencia del InfoTrain.

**4. Principios de diseño de la iniciativa**

- Mobile-first: el teléfono es el dispositivo principal durante el
  viaje.

- **DIVERGENCIA** Formato del producto: el Travel Hub original plantea
  una experiencia web/PWA sin descarga obligatoria; la Fase 1 del App
  define una app nativa descargable en App Store y Google Play, "no web
  app". Ver sección 27.

- Contextual: mostrar información según etapa, destino, fecha, hora y
  productos comprados.

- Accionable: cada pantalla debe responder "¿qué puedo hacer ahora?".

- Commerce integrado: comprar debe sentirse como una continuación
  natural del viaje, no como un eCommerce separado.

- Progressive disclosure: mostrar primero lo relevante y abrir el
  detalle cuando el cliente lo necesite.

- Human support con contexto: cuando interviene un asesor, debe tener
  visibilidad del viaje y de la interacción previa.

- Escalable: arquitectura y modelo de datos preparados para nuevos
  destinos y productos.

- **NUEVO** Funciona sin señal: boarding, tickets, itinerario y mapas
  disponibles offline.

- **NUEVO** Trilingüe desde el lanzamiento: español, inglés y portugués.

- **NUEVO** Interfaz según servicio: el app identifica el servicio
  (Voyager, 360°, Prime o First Class) a partir del boarding pass
  vinculado.

- **NUEVO** Simple de ingresar: registro y vinculación del viaje en
  pocos pasos.

- **NUEVO** Datos personales mínimos: consentimiento explícito,
  contraseñas almacenadas de forma segura y uso mínimo de datos
  sensibles como el documento de identidad.

**5. Customer Journey propuesto**

| **Etapa** | **Necesidad del cliente** | **Travel Hub** | **Oportunidad de negocio** |
|----|----|----|----|
| Pre-trip | Entender qué compró y prepararse. | Resumen, documentos, checklist, horarios, recomendaciones. Nuevo: pre check-in con escaneo de documento. | Add-ons previos, upgrades, tours. |
| Llegada / inicio | Saber dónde ir y qué hacer. | Ubicación/punto de encuentro, timeline, alertas. Nuevo: boarding pass descargable. | Servicios complementarios contextualizados. |
| **NUEVO** A bordo del tren | Saber dónde va el tren, cuánto falta, conectarse y consultar qué hay a bordo. | Mapa del recorrido con ETA, WiFi, carta a bordo, conoce tu servicio, pulso de experiencia. | Venta de paquetes de navegación WiFi. |
| Durante el viaje | No perder pasos ni horarios. | "¿Qué hago ahora?", mapa, próximos hitos, contenido. Nuevo: avisos push de incidencias y reubicación. | Upsell/cross-sell de productos disponibles. |
| Experiencia | Disfrutar sin preocuparse por la logística. | Información contextual, asistencia, contenido. Nuevo: mapa de Machu Picchu Pueblo, cómo llegar y circuitos. | Servicios adicionales si existe una ventana real de compra. |
| Post-experiencia | Guardar/compartir lo vivido. | Fotos, recuerdos, reseña, certificado/contenido. | Advocacy, referral y futuras oportunidades. |
| Post-trip | Mantener el vínculo. | Resumen del viaje, contenido y recomendaciones futuras. Nuevo: enlaces a redes sociales de Inca Rail. | Nuevas experiencias según interés y destino. |

**6. Arquitectura funcional del Travel Hub**

La navegación original se estructura en cinco áreas. La Fase 1 del App
agrega contenido a bordo y de destino que no encaja de forma natural en
ellas, por lo que se propone una sexta área.

| **Área** | **Contenido** | **Origen** |
|----|----|----|
| Inicio | Estado del viaje, próxima acción y alertas prioritarias. | Travel Hub |
| Mi viaje | Itinerario completo, reservas, tickets, horarios, hoteles, traslados y tours. Se suman boarding pass, actualización por reubicación y pre check-in. | Travel Hub + App (B1 a B5) |
| **NUEVO** A bordo | Mapa del recorrido con ETA, paquetes de WiFi, carta a bordo, conoce tu servicio. Propuesta de área nueva. | App (D1 a D4) |
| Explorar | Experiencias, add-ons y servicios para ese viaje. Se suman mapa de Machu Picchu Pueblo, cómo llegar, circuitos y "Complementa tu viaje". | Travel Hub + App (E1 a E3, F1) |
| Ayuda | Preguntas frecuentes, asistencia digital y escalamiento a Contact Center. Se suman contacto por WhatsApp y pulso de experiencia. | Travel Hub + App (C2 a C4) |
| Perfil / documentos | Datos del pasajero, documentos, preferencias. Se suman cuenta, viajes vinculados, idioma y preferencias de notificación. | Travel Hub + App (A1 a A3) |

> **Nota de diseño.** La propuesta de un área "A bordo" es una decisión
> de este documento, no una definición de la Fase 1 del App. Una
> alternativa es mostrar esos módulos dentro de "Inicio" y "Mi viaje"
> cuando el pasajero esté en el tren.

**7. Acceso, cuenta y vinculación del viaje**

**NUEVO** Sección nueva. El Travel Hub original resolvía el acceso con
"link personalizado / autenticación simple asociada a reserva". La Fase
1 del App define un modelo basado en cuenta propia.

| **ID** | **Funcionalidad** | **Descripción** |
|----|----|----|
| A1 | Crear cuenta e iniciar sesión | Registro con correo electrónico y contraseña creada por el pasajero, aceptación de T&C e inicio de sesión. Incluye recuperación de contraseña. |
| A2 | Agregar mi viaje con el boarding pass | Dentro de su cuenta, el pasajero ingresa su número de boarding pass y el app reconoce su itinerario, boarding, tickets y recomendaciones (similar a "agregar viaje" en apps de aerolíneas). |
| A3 | Mi perfil y mis viajes | Datos de la cuenta, viajes vinculados (código, servicio, pasajeros y fecha), idioma y preferencias de notificación. |

**Puntos de atención.**

- La encuesta a pasajeros identificó el ingreso complicado como la
  principal barrera de uso del InfoTrain; el registro y la vinculación
  deben resolverse en pocos pasos.

- **DIVERGENCIA** Un modelo de cuenta con contraseña añade fricción
  frente a un link personalizado, pero permite agrupar varios viajes por
  pasajero. La decisión se recoge en la sección 27.

- El link personalizado desde comunicaciones transaccionales sigue
  siendo una vía posible de activación para reducir la baja adopción
  (riesgo ya identificado en el Travel Hub).

**8. Home: la pantalla más importante**

La Home no debe comportarse como un dashboard tradicional. Debe ser un
"asistente visual del viaje" donde el contenido cambia según el momento.

| **Módulo** | **Qué muestra** | **Prioridad** |
|----|----|----|
| ¿Qué hago ahora? | Próxima acción concreta: hora, lugar, instrucciones y CTA. | Muy alta |
| Estado del viaje | Progreso del itinerario: comprado → próximo → en curso → completado. | Muy alta |
| Alertas | Cambios de horario, recomendaciones operativas o recordatorios. Incluye demoras, reubicaciones e incidencias. | Muy alta |
| Mi próximo servicio | Siguiente tren, tour, traslado, hotel u otra actividad. | Alta |
| **NUEVO** En el tren | Mapa del recorrido con ubicación del tren y tiempo restante al destino (ETA). Visible cuando el pasajero está a bordo. | Alta |
| Comprar para mi viaje | Productos disponibles según fecha/destino/contexto. En el tren: paquetes de WiFi. | Alta |
| Ayuda | Acceso rápido a soporte con contexto (incluye contacto por WhatsApp). | Alta |
| **NUEVO** Pulso de experiencia | Pregunta "¿cómo va tu viaje?" con caritas durante el viaje. | Media |
| Después del viaje | Reseña, compartir, recuerdos y advocacy. | Media |

*Las prioridades de los módulos nuevos son propuesta de este documento y
deben validarse con Producto/UX.*

**9. Timeline / itinerario digital**

El timeline es el núcleo de "Mi viaje". Debe representar el viaje como
una secuencia de hitos, no como una lista de reservas.

- Fecha y hora de cada actividad.

- Lugar de inicio y destino.

- Tiempo estimado y ventana recomendada de llegada.

- **AMPLIADO** Tipo de servicio: tren, bus/traslado, tour, hotel,
  entrada, almuerzo u otro.

- **AMPLIADO** Ticket/documento asociado: boarding del tren, entrada a
  Machu Picchu (Consettur, INC), almuerzo y tea time.

- CTA contextual: Ver detalle, Cómo llegar, Contactar, Comprar
  complemento.

- Estado: pendiente, próximo, en curso, completado.

- Alertas específicas cuando exista una condición que requiera acción.

- **NUEVO** Boarding pass descargable y disponible para presentar en el
  embarque, también sin señal.

- **NUEVO** Actualización automática por reubicación: si el pasajero es
  reubicado, el nuevo boarding se refleja en el app sin acción del
  pasajero.

- **NUEVO** Pre check-in: registro previo del pasajero con foto y carga
  del documento de identidad mediante escaneo.

| **ID** | **Funcionalidad** | **Descripción** | **Clasificación** |
|----|----|----|----|
| B1 | Itinerario del viaje | Línea de tiempo con cada hito (tren, bus, entrada, almuerzo, traslados) con hora, lugar y estado. | **YA CONSIDERADO** |
| B2 | Boarding pass descargable | Boarding del tren disponible para descarga y presentación en el embarque. | **AMPLIADO** |
| B3 | Actualización por reubicación | El nuevo boarding se refleja automáticamente en el app. | **NUEVO** |
| B4 | Tickets de servicios adicionales | Descarga de tickets de Consettur, INC (entrada Machu Picchu), almuerzo y tea time. | **AMPLIADO** |
| B5 | Pre check-in con escaneo de documento | Registro previo con foto y carga del documento de identidad. | **NUEVO** |

**10. "¿Qué hago ahora?" como corazón de la experiencia**

El concepto debe reducir la carga cognitiva del viajero. En vez de
obligarlo a interpretar todo el itinerario, Travel Hub identifica el
siguiente paso relevante.

| **Ejemplo de momento** | **Mensaje funcional** | **CTA** |
|----|----|----|
| Antes de salir | Tu tren sale a las 07:50. Debes estar en la estación antes de la hora recomendada. | Ver indicaciones |
| Antes del tour | Tu experiencia comienza en 45 minutos. | Ver punto de encuentro |
| Llegada a Aguas Calientes | Este es tu siguiente paso para continuar tu experiencia. | Ver instrucciones |
| Antes de una actividad | Tienes una actividad disponible hoy. | Ver detalle |
| Oportunidad comercial | Puedes agregar esta experiencia a tu viaje. | Agregar al viaje |
| **NUEVO** Pre check-in pendiente | Completa tu registro antes del viaje. | Completar pre check-in |
| **NUEVO** Reubicación | Tu boarding fue actualizado. | Ver nuevo boarding |
| **NUEVO** A bordo | Faltan pocos minutos para llegar a tu destino. | Ver mapa del recorrido |
| **NUEVO** En Machu Picchu Pueblo | Este es el recorrido hasta el paradero del bus Consettur. | Cómo llegar |

*Los ejemplos nuevos son ilustrativos de la redacción esperada; los
textos definitivos corresponden a Contenido/UX.*

**11. Experiencia a bordo del tren**

**NUEVO** Sección nueva. Recoge las funcionalidades del módulo "Internet
y experiencia a bordo" de la Fase 1 del App.

| **ID** | **Funcionalidad** | **Descripción** | **Clasificación** |
|----|----|----|----|
| D1 | Compra de paquetes de WiFi | A bordo, el internet para mensajería (WhatsApp y mensajes de texto) es gratuito. Para navegar, el pasajero compra desde el app un paquete de navegación, que no incluye aplicativos de streaming. También disponible en la estación de Machu Picchu. Precio y nombre comercial por definir. | **NUEVO** |
| D2 | Mapa del recorrido en tiempo real | Ubicación del tren en la ruta y tiempo restante al destino (ETA). | **NUEVO** |
| D3 | Carta a bordo (consulta) | Catálogo de snacks y bebidas por servicio, solo de consulta. | **NUEVO** |
| D4 | Conoce tu servicio | Página informativa por servicio (One Page desde la web). | **NUEVO** |

**11.1 Interfaz según servicio**

El app identifica el servicio a partir del boarding pass vinculado y
muestra la interfaz de Voyager, 360°, Prime o First Class. A bordo se
complementa con la antena del vagón y la programación.

**11.2 Conectividad a bordo (WiFi / Starlink)**

- El app y la mensajería funcionan sin costo en la red del tren.

- La navegación se habilita al comprar el paquete; el streaming queda
  bloqueado.

- Requiere portal cautivo y firewall, a cargo de TI (Convergia).

- Pendientes: precio del paquete (Comercial), nombre comercial
  (Francisco Torrejón) y si en First Class la navegación va incluida,
  como se acordó en el Comité del 22/09.

**12. Destino e información práctica**

**NUEVO** Sección nueva. Recoge el módulo "Destino e información
práctica" de la Fase 1 del App.

| **ID** | **Funcionalidad** | **Descripción** | **Clasificación** |
|----|----|----|----|
| E1 | Mapa de Machu Picchu Pueblo | Puntos de interés: estación, boleterías IR, paradero Consettur, venta de entradas in situ, servicios que ofrece Inca Rail, SS.HH. y centro de salud. | **AMPLIADO** |
| E2 | Cómo llegar a Machu Picchu | Recorrido paso a paso desde la estación hasta la ciudadela, incluida la ruta al bus Consettur. | **YA CONSIDERADO** |
| E3 | Circuitos de Machu Picchu | Explicación de los circuitos disponibles para orientar al pasajero según su entrada. | **NUEVO** |

**13. Commerce dentro del Travel Hub**

La compra debe ser contextual. El objetivo no es replicar todo el
eCommerce actual dentro del Hub, sino presentar productos relevantes
para el viaje y permitir una compra fluida.

- Recomendaciones por destino: Cusco, Machu Picchu, Aguas Calientes y
  futuros destinos.

- Recomendaciones por fecha: solo mostrar productos que puedan ser
  utilizados durante la estadía.

- Recomendaciones por producto comprado: complementar tren, tour o
  paquete con servicios relacionados.

- Cross-sell de más de una experiencia cuando exista tiempo disponible
  en el itinerario.

- Add-ons durante el funnel post-compra: upgrades, traslados, tours,
  servicios complementarios y experiencias.

- Checkout integrado o seamless, evitando que el usuario sienta que
  abandonó su viaje.

- Confirmación inmediata: la nueva compra debe aparecer dentro de "Mi
  viaje".

**13.1 Productos y reglas incorporadas desde la Fase 1 del App**

| **Elemento** | **Definición en la Fase 1** | **Clasificación** |
|----|----|----|
| Paquetes de WiFi (D1) | Única compra dentro del app definida en la Fase 1. Se vende desde el app y también en la estación de Machu Picchu. | **NUEVO** |
| Carta a bordo (D3) | Solo consulta. La compra de snacks desde el app queda fuera de la primera versión: depende del modelo de comisiones de los SAB y de la logística de entrega en asiento. | **NUEVO** |
| Complementa tu viaje (F1) | Acceso a servicios complementarios derivando a la landing de TFE, sin compra dentro del app. | **DIVERGENCIA** |
| Pagos y comprobantes (T7) | Pasarela de pago y boleta electrónica enviada al correo. | **AMPLIADO** |
| Registro de ventas (T6) | Las ventas se registran en SIR con lógica POS; itinerario, manifiesto y reubicaciones provienen de la fuente oficial. | **AMPLIADO** |

> **DIVERGENCIA Alcance comercial de la Fase 1.** El Travel Hub original
> prevé checkout integrado y confirmación dentro de "Mi viaje" (fase
> Commerce). La Fase 1 del App limita la compra dentro del app a los
> paquetes de WiFi y deriva el resto a la landing de TFE. Ambas posturas
> pueden convivir si la integración de compra se ubica en una fase
> posterior. Ver sección 27.

**14. Modelo de recomendación comercial**

| **Señal** | **Ejemplo** | **Uso** |
|----|----|----|
| Destino | Cusco | Recomendar experiencias disponibles en Cusco. |
| Fecha | Actividad dentro de 48 h | Priorizar productos realmente comprables. |
| Tiempo libre | Ventana de 4 a 6 horas | Buscar experiencias que encajen en esa ventana. |
| Producto comprado | Tren a Machu Picchu | Ofrecer servicios complementarios. |
| Perfil de viaje | Familia / pareja / grupo | Ajustar contenido y oferta. |
| Comportamiento | Consultó una experiencia | Reimpactar dentro del Hub. |
| Etapa | Pre-trip / durante | Cambiar mensaje y tipo de oferta. |
| **NUEVO** Servicio contratado | Voyager, 360°, Prime o First Class | Ajustar interfaz y oferta; definir si el WiFi va incluido (First Class por confirmar). |
| **NUEVO** Ubicación en la ruta | A bordo del tren | Priorizar paquetes de WiFi y carta a bordo. |
| **NUEVO** Idioma | Español / inglés / portugués | Mostrar contenido y ofertas en el idioma del pasajero. |

**15. Comunicación, ayuda y asistencia**

El Travel Hub debe integrar una capa de ayuda que combine autoservicio,
automatización y atención humana. La conversación debe estar vinculada
al contexto del viaje para evitar que el cliente tenga que explicar
nuevamente su reserva.

- FAQ contextual según etapa del viaje.

- Chat digital con contexto de reserva e itinerario.

- Escalamiento a humano cuando el caso lo requiera.

- Compartir automáticamente datos relevantes del viaje con el asesor.

- Historial de conversación asociado al viaje.

**15.1 Comunicación y soporte en la Fase 1 del App**

| **ID** | **Funcionalidad** | **Descripción** | **Clasificación** |
|----|----|----|----|
| C1 | Notificaciones de incidencias | Push de demoras, reubicaciones y cambios operativos. Complementa el aviso que hoy llega por WhatsApp. | **AMPLIADO** |
| C2 | Pulso de experiencia en viaje | Pregunta push "¿cómo va tu viaje?" con caritas. Una mala respuesta en la ida alerta al equipo para actuar antes del retorno. | **NUEVO** |
| C3 | Contacto por WhatsApp | Botón de contacto directo por WhatsApp. | **DIVERGENCIA** |
| C4 | Preguntas frecuentes | FAQ de embarque, equipaje, documentos, buses y conectividad. | **YA CONSIDERADO** |

> **DIVERGENCIA Canal de contacto.** El acta del Comité del 22/09
> menciona un chatbot; el Travel Hub original plantea chat digital con
> contexto y escalamiento a humano. La propuesta de la Fase 1 es botón
> de WhatsApp más preguntas frecuentes. El chat con contexto de reserva
> queda como evolución. Ver sección 27.

**16. Experiencia durante el viaje**

- Información contextual y de fácil lectura con una mano.

- Mapa y puntos de referencia.

- Indicaciones del siguiente paso.

- Notificaciones o recordatorios relevantes.

- Información de horarios y cambios.

- Contenido de destino e historias asociadas a la experiencia.

- Photo spots / contenido compartible cuando sea pertinente.

- Acceso persistente a ayuda.

- **NUEVO** Avisos push de demoras, reubicaciones e incidencias
  operativas.

- **NUEVO** Mapa del recorrido del tren con ETA.

- **NUEVO** Acceso offline a boarding, tickets, itinerario y mapas, para
  zonas sin cobertura.

- **NUEVO** Pulso de experiencia para detectar una mala experiencia
  antes del retorno.

**17. Post-experiencia: Journey → Memory → Advocacy**

El objetivo post-experiencia no debe depender exclusivamente de la
recompra. Para visitantes internacionales, una parte importante del
valor puede estar en convertir una buena experiencia en recomendación.

| **Momento** | **Funcionalidad** | **Resultado esperado** |
|----|----|----|
| Inmediatamente después | Celebración de experiencia completada. | Cierre positivo del viaje. |
| 24 a 48 h | Solicitud de reseña / feedback. | Reputación y aprendizaje. |
| Contenido | Fotos, recuerdos, certificado o contenido de viaje. | Mayor vínculo emocional. |
| Compartir | Compartir experiencia en redes / mensajería. | Advocacy. |
| Referral | Invitar a recomendar Inca Rail. | Nuevos clientes. |
| **NUEVO** Comunidad | Síguenos en redes sociales: botón o links a las redes de Inca Rail (F2). | Vínculo y alcance orgánico. |
| Futuro | Contenido y experiencias relacionadas. | Relación de largo plazo. |

**18. Personalización**

El Travel Hub puede construir progresivamente un perfil de contexto del
viaje:

- Qué compró.

- Cuándo viaja.

- Dónde se encuentra dentro del itinerario.

- Qué productos consultó.

- Qué compró adicionalmente.

- Qué servicios utilizó.

- Qué preguntas realizó.

- Qué feedback dejó.

- **NUEVO** Qué servicio viaja (Voyager, 360°, Prime o First Class) y en
  qué idioma usa el app.

- **NUEVO** Qué respondió en el pulso de experiencia y si compró un
  paquete de WiFi.

Este contexto puede alimentar la Capa de Inteligencia Comercial de Inca
Rail y las herramientas de Marketing, Sales y Service, sin convertir el
Travel Hub en un CRM visible para el cliente.

**19. Requisitos transversales**

**NUEVO** Sección nueva. Son requisitos que no corresponden a una
pantalla, pero que la Fase 1 del App exige desde su primera versión.

| **ID** | **Requisito** | **Descripción** | **Clasificación** |
|----|----|----|----|
| T1 | App nativa descargable | Disponible para descarga en App Store (iOS) y Google Play (Android). No se desarrolla como web app. | **DIVERGENCIA** |
| T2 | Trilingüe ES / EN / PT | Los tres idiomas disponibles desde el lanzamiento. | **NUEVO** |
| T3 | Funciona sin señal | Boarding, tickets, itinerario y mapas disponibles offline. | **NUEVO** |
| T4 | Simple y mobile-first | Registro y vinculación del viaje en pocos pasos; el ingreso complicado fue la principal barrera de uso del InfoTrain. | **YA CONSIDERADO** |
| T5 | Interfaz según servicio | El app identifica el servicio a partir del boarding pass vinculado y muestra la interfaz de Voyager, 360°, Prime o First Class. | **NUEVO** |
| T6 | Integración con SIR y eCommerce | Itinerario, manifiesto y reubicaciones desde la fuente oficial; las ventas se registran en SIR con lógica POS. | **AMPLIADO** |
| T7 | Pagos y comprobantes | Pasarela de pago y boleta electrónica enviada al correo. | **AMPLIADO** |
| T8 | Integración con el WiFi a bordo (Starlink) | El app y la mensajería funcionan sin costo en la red del tren; la navegación se habilita al comprar el paquete y el streaming queda bloqueado. Requiere portal cautivo y firewall (TI, Convergia). | **NUEVO** |
| T9 | Contenido administrable | Gestor de contenidos (CMS) a cargo de Marketing para textos, mapas y contenidos. | **YA CONSIDERADO** |
| T10 | Analítica y reportería | Medición de uso, adopción y ventas; KPIs definidos por cada área antes del kickoff. | **YA CONSIDERADO** |
| T11 | Protección de datos personales | Consentimiento explícito, contraseñas almacenadas de forma segura y uso mínimo de datos sensibles (documento de identidad), conforme a la normativa peruana. | **AMPLIADO** |

**20. Arquitectura conceptual**

| **Capa** | **Responsabilidad** |
|----|----|
| Experience Layer | **AMPLIADO** Aplicación mobile-first, responsive para desktop. Formato web/PWA o app nativa por definir (sección 27). Incluye interfaz por servicio, tres idiomas y modo offline. |
| **NUEVO** Identity / Account | Registro, inicio de sesión, recuperación de contraseña, consentimiento y vinculación de viajes mediante boarding pass. |
| Travel Hub Experience API / BFF | Orquestar datos y adaptar respuestas a la experiencia digital. |
| Journey / Booking Data | **AMPLIADO** Reservas, pasajeros, servicios, horarios y estado del viaje. Integración con SIR: itinerario, manifiesto y reubicaciones desde la fuente oficial. |
| Commerce | **AMPLIADO** Catálogo, disponibilidad, pricing, carrito, checkout y confirmación. Ventas registradas en SIR con lógica POS. |
| **NUEVO** Payments | Pasarela de pago y emisión de boleta electrónica enviada al correo. |
| Content | CMS para contenido de destinos, recomendaciones y componentes; administrado por Marketing. |
| Customer / Service | Contexto de cliente, conversaciones, casos y soporte. Contacto por WhatsApp. |
| **NUEVO** Conectividad a bordo | Red WiFi del tren (Starlink), portal cautivo y firewall (TI, Convergia). Mensajería gratuita; navegación habilitada por compra; streaming bloqueado. |
| Analytics | Eventos de navegación, engagement, commerce y journey. |
| Notifications | **AMPLIADO** Email, WhatsApp, push/web push u otros canales disponibles. Push de demoras, reubicaciones e incidencias, y pulso de experiencia. |

**21. Modelo de datos mínimo**

- Customer: identificador, idioma, país/mercado y preferencias
  disponibles.

- Trip: identificador del viaje, fechas, destino y estado.

- Passenger: pasajeros asociados al viaje.

- Booking: productos/servicios comprados.

- Journey Event: hitos del itinerario y estado.

- Product Availability: productos que pueden ser comprados según
  contexto.

- Interaction: navegación, clics, búsquedas, consultas y compras.

- Support Case: solicitud y resolución.

- Advocacy Event: reseña, compartir, referral u otra acción
  post-experiencia.

**NUEVO** Entidades adicionales derivadas de la Fase 1 del App
(propuesta de este documento):

- Account: correo, credenciales, aceptación de T&C, idioma y
  preferencias de notificación.

- Linked Trip / Boarding Pass: número de boarding pass, servicio
  (Voyager, 360°, Prime o First Class), pasajeros y fecha.

- Relocation Event: cambio de boarding asociado a una reubicación.

- Pre Check-in: foto y documento de identidad del pasajero. Dato
  sensible: uso mínimo y consentimiento explícito.

- WiFi Package: paquete de navegación comprado, estado y vigencia.

- Experience Pulse: respuesta de "¿cómo va tu viaje?" y acción del
  equipo.

- Notification: aviso enviado, canal y estado de entrega.

**22. KPIs de la iniciativa**

| **Objetivo** | **KPI** | **Lectura** |
|----|----|----|
| Adopción | Travel Hub activation rate | Clientes que ingresan / clientes elegibles. |
| Engagement | Active trip users | Usuarios activos durante el viaje. |
| Utilidad | Uso de "¿Qué hago ahora?" | Interacción con la función central. |
| Servicio | Self-service rate | Casos resueltos sin intervención humana. |
| Soporte | Contact rate | Consultas por viaje / cliente. |
| Commerce | Post-purchase conversion | Usuarios que compran desde Hub / usuarios expuestos. |
| Commerce | Attach rate | Servicios adicionales por viaje. |
| Commerce | Incremental revenue | Ingresos adicionales atribuibles al Hub. |
| Customer | CSAT / NPS post-experiencia | Percepción del servicio. |
| Advocacy | Review rate / referral rate | Clientes que dejan reseña o recomiendan. |
| **NUEVO** Registro | Tasa de vinculación de viaje | Cuentas que agregan su viaje con boarding pass / cuentas creadas. |
| **NUEVO** Registro | Tasa de pre check-in | Pasajeros que completan el pre check-in / pasajeros elegibles. |
| **NUEVO** Operación | Alcance de avisos de incidencias | Notificaciones entregadas y abiertas / notificaciones emitidas. |
| **NUEVO** Commerce | Conversión y attach de WiFi | Compras de paquetes / pasajeros a bordo expuestos; paquetes por viaje. |
| **NUEVO** Experiencia | Respuesta al pulso de experiencia | Tasa de respuesta y casos con mala respuesta atendidos antes del retorno. |

*Los KPIs nuevos son propuesta de este documento. La Fase 1 del App
establece que los KPIs los define cada área antes del kickoff.*

**23. Métrica clave: Revenue per Trip**

Una métrica estratégica para Travel Hub puede ser Revenue per Trip:
ingresos totales asociados a un viaje, incluyendo la compra inicial y
compras incrementales realizadas antes o durante la experiencia.

Esto permite medir el impacto comercial más allá del CVR tradicional del
eCommerce y conectar la experiencia digital con el valor total generado
por cada viaje.

**NUEVO** Con la Fase 1 del App, los paquetes de WiFi se suman como
ingreso incremental por viaje. Las ventas derivadas a la landing de TFE
requieren definir cómo se atribuyen al app para incluirlas en la
métrica.

**24. MVP recomendado**

| **Bloque** | **MVP del Travel Hub original** | **Incorporación desde la Fase 1 del App** |
|----|----|----|
| Acceso | Link personalizado / autenticación simple asociada a reserva. | Cuenta con correo y contraseña; vinculación del viaje con boarding pass (A1 a A3). Decisión pendiente, sección 27. |
| Home | Estado del viaje + próxima acción + alertas. | Alertas de incidencias y reubicación; módulo "En el tren". |
| Mi viaje | Timeline completo con servicios comprados. | Boarding pass descargable, actualización por reubicación y pre check-in. |
| Documentos | Tickets y datos esenciales. | Tickets Consettur, INC, almuerzo y tea time; disponibles sin señal. |
| Ayuda | FAQ + contacto/chat con contexto. | Botón de WhatsApp + FAQ; pulso de experiencia. |
| Commerce | Catálogo contextual + compra de productos elegibles. | Paquetes de WiFi; derivación a la landing de TFE para servicios complementarios. |
| Confirmación | Nueva compra integrada al itinerario. | Boleta electrónica al correo; ventas registradas en SIR. |
| Analytics | Tracking de navegación, interacción y compra. | Analítica y reportería con KPIs definidos por área antes del kickoff. |
| **NUEVO** A bordo | No considerado. | Mapa del recorrido con ETA, carta a bordo (consulta) y conoce tu servicio. |
| **NUEVO** Destino | No considerado. | Mapa de Machu Picchu Pueblo, cómo llegar y circuitos. |
| **NUEVO** Transversal | No considerado. | Tres idiomas, funcionamiento offline, interfaz según servicio y protección de datos. |

*El alcance final de la Fase 1 queda sujeto a la estimación de tiempo y
costo del proveedor.*

**25. Evolución por fases**

| **Fase** | **Foco** | **Capacidades** |
|----|----|----|
| 1\. Foundation | Información | Mi viaje, timeline, documentos, estado y analytics. |
| 2\. Companion | Acompañamiento | ¿Qué hago ahora?, alertas, contenido contextual y ayuda. |
| 3\. Commerce | Monetización | Add-ons, cross-sell, checkout e integración al viaje. |
| 4\. Intelligence | Personalización | Recomendaciones basadas en contexto y comportamiento. |
| 5\. Advocacy | Post-viaje | Reviews, contenido, compartir y referral. |
| 6\. Expansion | Escala | Nuevas regiones, nuevos productos y ecosistema digital. |

**25.1 Dónde encaja la Fase 1 del App**

| **Fase del Travel Hub** | **Elementos de la Fase 1 del App** |
|----|----|
| 1\. Foundation | Cuenta y vinculación (A1 a A3), itinerario, boarding, tickets, reubicación y pre check-in (B1 a B5), FAQ (C4); transversales T3, T4, T6, T9, T10, T11. |
| 2\. Companion | Notificaciones de incidencias (C1), pulso de experiencia (C2), contacto por WhatsApp (C3), mapa del recorrido (D2), carta a bordo (D3), conoce tu servicio (D4), destino (E1 a E3); transversales T2 y T5. |
| 3\. Commerce | Paquetes de WiFi (D1), derivación a TFE (F1); transversales T7 y T8. |
| 4\. Intelligence | Sin elementos en la Fase 1. |
| 5\. Advocacy | Redes sociales (F2), de forma parcial. |
| 6\. Expansion | Sin elementos en la Fase 1. |

*Mapeo propuesto por este documento. El transversal T1 (formato nativo)
queda pendiente de decisión.*

**26. Roadmap de 12 meses**

| **Periodo** | **Prioridad** | **Entregables** |
|----|----|----|
| M1 a M2 | Discovery & Foundation | Journey mapping, arquitectura, modelo de datos, UX/UI y definición de KPIs. |
| M3 a M4 | MVP | Home, Mi viaje, timeline, documentos y analytics. |
| M5 a M6 | Companion | ¿Qué hago ahora?, alertas, contenido contextual y ayuda. |
| M7 a M8 | Commerce | Add-ons, cross-sell, disponibilidad y compra dentro del Hub. |
| M9 a M10 | Intelligence | Personalización, recomendaciones y experimentación A/B. |
| M11 | Advocacy | Reviews, compartir, referral y cierre de experiencia. |
| M12 | Scale | Optimización, resultados, nuevas categorías/regiones y siguiente roadmap. |

> **Ajuste pendiente.** La Fase 1 del App no tiene aún cronograma:
> primero se elabora el brief y luego el proveedor entrega la estimación
> de tiempo y costo. Este roadmap debe recalibrarse cuando esa
> estimación esté disponible, en particular la ubicación de los
> elementos de Companion y Commerce que la Fase 1 adelanta (mapa del
> recorrido, incidencias y WiFi).

**27. Decisiones a resolver**

**DIVERGENCIA** Los dos documentos plantean posturas distintas en cuatro
temas. Este documento no resuelve la decisión; la deja identificada para
la Mesa de Producto.

| **Tema** | **Travel Hub original** | **App Fase 1** | **Implicancia** |
|----|----|----|----|
| Formato del producto | Aplicación web mobile-first / PWA, sin descarga obligatoria. | App nativa en App Store y Google Play; no se desarrolla como web app (T1). | Afecta costo de desarrollo, publicación en dos tiendas y estrategia de adopción. El Hub original apostaba a acceso sin descarga desde comunicaciones transaccionales. |
| Acceso | Link personalizado / autenticación simple asociada a reserva. | Cuenta con correo y contraseña; agregar viaje con boarding pass (A1, A2). | Afecta la fricción de ingreso (barrera del InfoTrain) y permite agrupar varios viajes en una cuenta. |
| Alcance de Commerce | Checkout integrado; la compra se confirma dentro de "Mi viaje". | Dentro del app solo paquetes de WiFi; el resto se deriva a la landing de TFE (F1). | Afecta Revenue per Trip y la atribución de ventas realizadas fuera del app. |
| Canal de contacto | Chat digital con contexto de reserva y escalamiento a humano. | Botón de WhatsApp + FAQ (C3, C4). El acta del 22/09 menciona un chatbot. | Con WhatsApp, la transferencia automática del contexto del viaje al asesor debe definirse de forma expresa. |

**27.1 Puntos a validar de la Fase 1 del App**

| **Tema** | **Detalle y propuesta del documento de origen** |
|----|----|
| Carta a bordo vs. compra de snacks | El acta del Comité del 22/09 menciona la venta de snacks desde el app; la lista del 23/09 no la incluye en la primera versión. Propuesta: Fase 1 con carta de consulta (D3), ya que la compra depende del modelo de comisiones de los SAB y de la logística de entrega en asiento. |
| "Reservas integradas" (acta 22/09) | Se interpretó como ver todas las reservas del pasajero en su itinerario (B1). Confirmar si se refería a reservar o comprar desde el app. |
| Precio y nombre del WiFi | Precio del paquete de navegación (Comercial) y nombre comercial (Francisco Torrejón) pendientes; son necesarios para el lanzamiento. Confirmar además si en First Class la navegación va incluida, como se acordó en el Comité del 22/09. |

**28. Experimentos prioritarios**

- A/B de Home tradicional vs. Home centrada en "¿Qué hago ahora?".

- A/B de recomendación comercial genérica vs. recomendación contextual
  por etapa.

- A/B de oferta individual vs. bundle de actividades para una ventana de
  tiempo.

- A/B de CTA de compra dentro del timeline vs. módulo comercial
  independiente.

- Medición de assisted sales generadas después de una interacción con
  soporte.

- Medición de impacto de chat contextual sobre conversión y
  satisfacción.

- **NUEVO** Propuesto: comparar el momento de exposición del paquete de
  WiFi (antes de abordar vs. a bordo) sobre la conversión.

- **NUEVO** Propuesto: medir si atender las malas respuestas del pulso
  de experiencia durante la ida mejora el CSAT del retorno.

- **NUEVO** Propuesto: comparar el flujo de acceso con cuenta y boarding
  pass contra el acceso por link, sobre la tasa de activación.

**29. Gobierno y ownership**

| **Área** | **Responsabilidad principal** |
|----|----|
| Estrategia Digital / eCommerce | Product ownership, funnel, commerce y priorización. |
| Operaciones / TFE | Contenido y reglas del viaje/experiencias. |
| TI | Arquitectura, integraciones, seguridad y performance. |
| Marketing | Contenido, personalización, campañas y advocacy. Administra el CMS. |
| Contact Center / Service | Casos, protocolos y feedback de clientes. |
| Data / Analytics | Tracking, dashboards, experimentación y medición. |
| Producto / UX | Research, UX/UI, usability y evolución de la experiencia. |
| **NUEVO** Transformación Digital | Elaboración y consolidación de la definición de Fase 1 del App (Leonardo Iberico Valdivia). |
| **NUEVO** Mesa / Comité de Producto | Aprobación de la Fase 1 y decisiones de la sección 27. Sponsor: Carolina Saenz Bresciani. |
| **NUEVO** Comercial | Precio del paquete de navegación WiFi. |
| **NUEVO** TI, Convergia | Portal cautivo y firewall para el WiFi a bordo. |
| **NUEVO** Proveedor de desarrollo | Estimación de tiempo y costo de la Fase 1. |

**30. Riesgos y controles**

| **Riesgo** | **Control** |
|----|----|
| Información desactualizada | Fuente única de verdad y sincronización de estado. |
| Demasiadas ofertas | Motor de relevancia y límites de exposición. |
| Experiencia pesada en mobile | Mobile-first, performance budget y pruebas reales. |
| Checkout fragmentado | Integración seamless y confirmación dentro del Hub. |
| Datos sensibles / privacidad | Minimización de datos, controles de acceso y políticas de privacidad. |
| Complejidad operacional | MVP por fases y reglas claras de ownership. |
| Baja adopción | Acceso desde comunicaciones transaccionales y puntos de contacto del viaje. |
| **NUEVO** Barrera de ingreso por cuenta y contraseña | Registro en pocos pasos, vinculación directa con boarding pass, recuperación de contraseña y pruebas de usabilidad. |
| **NUEVO** Integración del WiFi a bordo (Starlink) | Coordinación temprana con TI (Convergia) sobre portal cautivo y firewall; definir alcance antes del kickoff. |
| **NUEVO** Zonas sin cobertura | Boarding, tickets, itinerario y mapas disponibles offline. |
| **NUEVO** Documento de identidad en el pre check-in | Consentimiento explícito, uso mínimo y almacenamiento seguro conforme a la normativa peruana. |
| **NUEVO** Avisos duplicados entre push y WhatsApp | Definir la fuente oficial de cada aviso; el push complementa el aviso actual por WhatsApp. |
| **NUEVO** Decisiones abiertas (formato, acceso, commerce, contacto) | Resolver en la Mesa de Producto antes de elaborar el brief (sección 27). |
| **NUEVO** Dependencia de la estimación del proveedor | Alcance final sujeto a estimación; entrega por fases. |
| **NUEVO** Pendientes comerciales del WiFi | Cerrar precio, nombre comercial y regla para First Class antes del lanzamiento. |

*Los controles de los riesgos nuevos son propuesta de este documento.*

**31. Cómo debería sentirse Travel Hub**

La experiencia debe transmitir estas ideas en segundos:

- "Sé dónde estoy en mi viaje."

- "Sé qué tengo que hacer ahora."

- "Si necesito algo, puedo resolverlo o comprarlo aquí."

- **NUEVO** "Sé dónde va mi tren y cuánto falta para llegar."

**32. Concepto de propuesta de valor**

**TRAVEL HUB**

**"Todo tu viaje. En un solo lugar."**

Travel Hub debe ser entendido como una nueva capa digital de Inca Rail:
no reemplaza el eCommerce, el Contact Center ni los sistemas operativos;
los conecta desde la perspectiva del cliente y convierte el itinerario
en una experiencia viva, transaccional y medible.

**33. Definición ejecutiva para presentar a Gerencia**

> **Travel Hub es una aplicación mobile-first que acompaña al cliente
> durante todo su viaje con Inca Rail. Centraliza su itinerario,
> boarding pass, tickets, horarios, servicios y recomendaciones; le
> indica qué hacer en cada momento; le avisa de incidencias y
> reubicaciones; lo acompaña dentro del tren con el mapa del recorrido,
> el WiFi y la carta a bordo, incluso sin señal; le permite recibir
> asistencia y, desde la misma experiencia, comprar servicios
> adicionales. La iniciativa busca elevar la experiencia del pasajero y,
> al mismo tiempo, transformar el post-compra en un nuevo canal de
> revenue, personalización y advocacy.**

**34. Próximos pasos para convertirlo en proyecto**

1.  Definir el MVP y sus casos de uso prioritarios.

2.  Mapear el journey completo del pasajero y todos los puntos donde hoy
    recibe información.

3.  Inventariar fuentes de datos e integraciones necesarias.

4.  Definir arquitectura y ownership de cada dato.

5.  Diseñar wireframes mobile-first de Home, Mi viaje, Timeline, Detalle
    y Commerce.

6.  Definir catálogo de productos elegibles para venta post-compra.

7.  Definir KPIs, eventos GA4 y modelo de atribución de revenue.

8.  Construir prototipo navegable y validarlo con pasajeros.

9.  Pilotear con un segmento controlado de clientes.

10. Medir adopción, satisfacción, conversión incremental y revenue por
    viaje antes de escalar.

**Pasos de la Fase 1 del App**

11. **NUEVO** Resolver las decisiones abiertas de la sección 27.

12. **NUEVO** Validar esta lista de funcionalidades con las áreas
    involucradas.

13. **NUEVO** Obtener la aprobación de la Fase 1 por la Mesa de Producto
    (por correo).

14. **NUEVO** Elaborar el brief del app con Juan Wong y Aakash Kishnani,
    y actualizar el mockup con lo aprobado.

15. **NUEVO** Solicitar al proveedor la estimación de tiempo y costo de
    desarrollo.

**Anexo A. Matriz de trazabilidad: App Inca Rail Fase 1 vs. Travel Hub**

Cada funcionalidad (A1 a F2) y característica transversal (T1 a T11) de
la Fase 1 del App se compara con lo que definía el Travel Hub original.

| **ID** | **Funcionalidad** | **Origen en el App** | **Clasificación** | **Sección** |
|----|----|----|----|----|
| A1 | Crear cuenta e iniciar sesión | LI | **DIVERGENCIA** | 7 |
| A2 | Agregar mi viaje con el boarding pass | LI | **NUEVO** | 7 |
| A3 | Mi perfil y mis viajes | LI · JW | **AMPLIADO** | 7 |
| B1 | Itinerario del viaje | CS · R · JW | **YA CONSIDERADO** | 9 |
| B2 | Boarding pass descargable | CS · R | **AMPLIADO** | 9 |
| B3 | Actualización por reubicación | CS · R | **NUEVO** | 9 |
| B4 | Tickets de servicios adicionales | CS · R | **AMPLIADO** | 9 |
| B5 | Pre check-in con escaneo de documento | CS · R | **NUEVO** | 9 |
| C1 | Notificaciones de incidencias | CS · R | **AMPLIADO** | 15.1 |
| C2 | Pulso de experiencia en viaje | CS · R | **NUEVO** | 15.1 |
| C3 | Contacto con Inca Rail por WhatsApp | CS · R | **DIVERGENCIA** | 15.1 y 27 |
| C4 | Preguntas frecuentes | JW | **YA CONSIDERADO** | 15.1 |
| D1 | Compra de paquetes de WiFi | MP · CS · R · BR · LI | **NUEVO** | 11 y 13.1 |
| D2 | Mapa del recorrido en tiempo real | BR · JW · EN | **NUEVO** | 11 |
| D3 | Carta a bordo (consulta) | BR · R · JW | **NUEVO** | 11 y 13.1 |
| D4 | Conoce tu servicio | BR | **NUEVO** | 11 |
| E1 | Mapa de Machu Picchu Pueblo | CS · R · FT · JW | **AMPLIADO** | 12 |
| E2 | Cómo llegar a Machu Picchu | FT · R · JW | **YA CONSIDERADO** | 12 |
| E3 | Circuitos de Machu Picchu | FT | **NUEVO** | 12 |
| F1 | Complementa tu viaje (derivación) | R · BR | **DIVERGENCIA** | 13.1 y 27 |
| F2 | Síguenos en redes sociales | FT | **NUEVO** | 17 |
| T1 | App nativa descargable | R · LI | **DIVERGENCIA** | 19 y 27 |
| T2 | Trilingüe ES / EN / PT | BR · JW | **NUEVO** | 19 |
| T3 | Funciona sin señal | JW | **NUEVO** | 19 |
| T4 | Simple y mobile-first | EN · JW | **YA CONSIDERADO** | 19 |
| T5 | Interfaz según servicio | BR | **NUEVO** | 11.1 y 19 |
| T6 | Integración con SIR y eCommerce | BR · JW | **AMPLIADO** | 19 y 20 |
| T7 | Pagos y comprobantes | BR | **AMPLIADO** | 19 y 20 |
| T8 | Integración con el WiFi a bordo (Starlink) | BR · LI | **NUEVO** | 11.2 y 19 |
| T9 | Contenido administrable | BR · JW | **YA CONSIDERADO** | 19 |
| T10 | Analítica y reportería | BR · JW | **YA CONSIDERADO** | 19 y 22 |
| T11 | Protección de datos personales | JW | **AMPLIADO** | 19 y 21 |

**Leyenda de orígenes (según el documento del App)**

| **Código** | **Fuente**                                  |
|------------|---------------------------------------------|
| MP         | Comité de Producto, 22/09                   |
| CS         | Lista de Carolina Saenz, 22 y 23/09         |
| R          | Reunión de revisión del app, 23/09          |
| FT         | Propuesta de Francisco Torrejón             |
| JW         | Travel Hub (Juan Wong)                      |
| BR         | Brief App a Bordo v2                        |
| EN         | Encuesta a pasajeros, jul-2026              |
| LI         | Definición de Transformación Digital, 24/09 |

**Anexo B. Documentos utilizados**

| **Documento** | **Uso en esta versión** |
|----|----|
| Inca Rail Travel Hub: Documento Detallado | Documento base. Se conserva su estructura y contenido; se ajustan o amplían los apartados afectados. |
| App Inca Rail: Funcionalidades y características de la Fase 1, v4.0 (24 de septiembre de 2026) | Fuente de lo nuevo, ampliado y divergente. Elaborado por Leonardo Iberico Valdivia (Transformación Digital), dirigido a Carolina Saenz Bresciani (sponsor) y al equipo de requerimientos del app. |
