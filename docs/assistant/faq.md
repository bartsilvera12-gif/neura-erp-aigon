# Preguntas Frecuentes (transversales)

> Q&A general del ERP. Las preguntas específicas de cada módulo están en su documento.

## Acceso y sesión

**¿Cómo entro al sistema?**
En `/login`, con el email y contraseña que le creó el administrador de su empresa.

**Me dice "Credenciales incorrectas".**
Verificá email y contraseña. Si persiste, el administrador puede resetear tu contraseña desde
Usuarios.

**Me dice "Tu cuenta está desactivada".**
Tu usuario fue suspendido; contactá al administrador de tu empresa.

**¿Por qué no veo un módulo que mi compañero sí ve?**
El acceso es doble: la **empresa** debe tener el módulo habilitado (lo gestiona el proveedor /
super admin) y tu **usuario** debe tenerlo asignado (lo gestiona tu administrador en Usuarios).

**Entré a una URL y me devolvió al Dashboard.**
Es el comportamiento estándar cuando tu usuario no tiene el módulo de esa pantalla.

## Datos y seguridad

**¿Otra empresa puede ver mis datos?**
No. Cada empresa está aislada (Row Level Security y/o esquema de datos dedicado por tenant).

**¿Quién puede crear usuarios?**
El administrador de la empresa, desde `/usuarios/nuevo` (define rol y módulos visibles).

**¿Qué roles existen?**
Super admin (proveedor), administrador (empresa), supervisor y usuarios operativos con módulos
asignados.

## Operación diaria

**¿En qué moneda trabaja el sistema?**
Guaraníes (GS) por defecto; ventas y facturas soportan USD con tipo de cambio.

**¿Cómo registro un cobro?**
En `Pagos`, eligiendo la factura pendiente y registrando monto, fecha, método y referencia.
El saldo de la factura se actualiza automáticamente.

**¿Cómo emito una factura electrónica?**
Ver `facturas.md`: generar XML → firmar → enviar a SET → consultar lote. Requiere SIFEN
configurado (certificado y timbrado vigentes).

**¿Cómo corrijo una factura ya aprobada?**
Con una **nota de crédito** desde el detalle de la factura (bloque Corrección fiscal).

**¿Por qué WhatsApp no me deja escribirle a un cliente?**
Si pasaron más de 24 h desde su último mensaje, solo se pueden enviar **plantillas aprobadas**
(campañas). Ver `whatsapp.md`.

**¿Las comisiones cuándo se calculan?**
Por período (típicamente mensual), según la política configurada: por pago registrado, factura
emitida o factura pagada, aplicando escalas por tramos.

## Soporte

**Encontré un error en el sistema, ¿qué hago?**
Tomá una captura de pantalla con el mensaje de error, anotá qué estabas haciendo (pantalla y
acción) y reportalo a tu administrador o al soporte del proveedor.

**¿El sistema guarda lo que hago?**
Las acciones importantes (pagos, cambios de clientes, eventos SIFEN, movimientos de stock,
cambios de proyectos) quedan auditadas con usuario y fecha.
