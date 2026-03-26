# OrderFlow MX

Plataforma inteligente de gestión de pedidos para cadenas de autoservicio en México.

## Módulos

- **Pedidos** — Dashboard con filtros, búsqueda, estatus, confianza de extracción
- **Entregas** — Citas de entrega, confirmación, entregas parciales, rechazos
- **Calendario** — Vista mensual de citas programadas
- **CFDI / Facturas** — Parser de XML del SAT, extracción automática de UUID, RFC, conceptos, descuentos, IVA
- **Catálogos** — Productos, cadenas, transportistas, equivalencias de SKU
- **Reportes** — Ventas por cadena, cumplimiento a tiempo, fill rate
- **Conciliación** — Pedido vs factura, detección de discrepancias
- **Duplicados** — Detección automática de pedidos repetidos
- **Backups** — Gestión de respaldos y recuperación

## Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173

## Deploy en Netlify

1. Sube este repo a GitHub
2. En Netlify: "Import an existing project" → selecciona el repo
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

## Stack

- React 18
- Vite 5
- DM Sans + JetBrains Mono
- CFDI 4.0 Parser (XML nativo del browser)
