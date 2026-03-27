import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ============================================================
// ORDERFLOW MX — Final Build
// All Modules + CFDI Parser + File Downloads
// ============================================================

// ── CFDI Parser ──────────────────────────────
const CFDIParse = (xml) => {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return { error: "XML inválido" };
  const ns = "http://www.sat.gob.mx/cfd/4", tns = "http://www.sat.gob.mx/TimbreFiscalDigital";
  const comp = doc.getElementsByTagNameNS(ns, "Comprobante")[0] || doc.querySelector("Comprobante") || doc.documentElement;
  if (!comp) return { error: "Sin Comprobante" };
  const g = (el, a) => el?.getAttribute(a) || "";
  const qe = (p, u, t) => p?.getElementsByTagNameNS(u, t)[0] || p?.querySelector(t);
  const em = qe(comp, ns, "Emisor"), re = qe(comp, ns, "Receptor") || doc.querySelectorAll("[Rfc]")[1];
  const ti = qe(doc, tns, "TimbreFiscalDigital") || doc.querySelector("TimbreFiscalDigital");
  const cn = qe(comp, ns, "Conceptos") || comp.querySelector("Conceptos");
  const im = qe(comp, ns, "Impuestos") || comp.querySelector("Impuestos");
  const conceptos = [];
  const ce = cn ? (cn.getElementsByTagNameNS(ns, "Concepto").length ? cn.getElementsByTagNameNS(ns, "Concepto") : cn.querySelectorAll("Concepto")) : [];
  for (let i = 0; i < ce.length; i++) {
    const c = ce[i];
    conceptos.push({ cprod: g(c, "ClaveProdServ"), noid: g(c, "NoIdentificacion"), cant: parseFloat(g(c, "Cantidad")) || 0, unidad: g(c, "Unidad"), descripcion: g(c, "Descripcion"), vu: parseFloat(g(c, "ValorUnitario")) || 0, importe: parseFloat(g(c, "Importe")) || 0, descuento: parseFloat(g(c, "Descuento")) || 0 });
  }
  const traslados = []; const te = im?.querySelectorAll("Traslado") || [];
  for (let i = 0; i < te.length; i++) traslados.push({ impuesto: g(te[i], "Impuesto"), tasa: g(te[i], "TasaOCuota"), importe: parseFloat(g(te[i], "Importe")) || 0 });
  const totalImp = parseFloat(im?.getAttribute("TotalImpuestosTrasladados")) || traslados.reduce((s, t) => s + t.importe, 0);
  const fp = { "01": "Efectivo", "02": "Cheque", "03": "Transferencia", "04": "Tarjeta crédito", "99": "Por definir" };
  const mp = { PUE: "Pago en una exhibición", PPD: "Pago en parcialidades" };
  const tp = { I: "Ingreso (Factura)", E: "Egreso (Nota de crédito)", P: "Pago", T: "Traslado" };
  return { version: g(comp, "Version"), serie: g(comp, "Serie"), folio: g(comp, "Folio"), fecha: g(comp, "Fecha"), formaPagoL: fp[g(comp, "FormaPago")] || g(comp, "FormaPago"), metodoPagoL: mp[g(comp, "MetodoPago")] || g(comp, "MetodoPago"), subTotal: parseFloat(g(comp, "SubTotal")) || 0, descuento: parseFloat(g(comp, "Descuento")) || 0, moneda: g(comp, "Moneda") || "MXN", total: parseFloat(g(comp, "Total")) || 0, tipoL: tp[g(comp, "TipoDeComprobante")] || g(comp, "TipoDeComprobante"), emisor: { rfc: g(em, "Rfc"), nombre: g(em, "Nombre") }, receptor: { rfc: g(re, "Rfc"), nombre: g(re, "Nombre"), uso: g(re, "UsoCFDI") }, conceptos, impuestos: { traslados, total: totalImp }, timbre: ti ? { uuid: g(ti, "UUID"), fecha: g(ti, "FechaTimbrado") } : null, descLineas: conceptos.reduce((s, c) => s + c.descuento, 0) };
};

const CFDIDemo = (order) => {
  const uuid = crypto.randomUUID?.()?.toUpperCase() || "A1B2C3D4-5678-90AB-CDEF-1234567890AB";
  const now = new Date().toISOString().replace("Z", "");
  const ls = order.lines.map(l => { const q = l.deliveredQty || l.quantity; const i = q * l.unitPrice; return `<cfdi:Concepto ClaveProdServ="50000000" NoIdentificacion="${l.sku}" Cantidad="${q}" ClaveUnidad="H87" Unidad="${l.unit}" Descripcion="${l.description}" ValorUnitario="${l.unitPrice.toFixed(2)}" Importe="${i.toFixed(2)}" Descuento="${(l.discount || 0).toFixed(2)}" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="${i.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${(i * 0.16).toFixed(2)}"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`; }).join("");
  const sub = order.lines.reduce((s, l) => s + ((l.deliveredQty || l.quantity) * l.unitPrice), 0);
  const desc = order.lines.reduce((s, l) => s + (l.discount || 0), 0);
  const iva = (sub - desc) * 0.16; const tot = sub - desc + iva;
  return `<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="${Math.floor(10000 + Math.random() * 90000)}" Fecha="${now}" FormaPago="03" MetodoPago="PUE" SubTotal="${sub.toFixed(2)}" Descuento="${desc.toFixed(2)}" Moneda="MXN" Total="${tot.toFixed(2)}" TipoDeComprobante="I" LugarExpedicion="00000"><cfdi:Emisor Rfc="XAXX010101000" Nombre="[Tu Empresa]" RegimenFiscal="601"/><cfdi:Receptor Rfc="XAXX010101000" Nombre="${order.chain || "[Cadena]"}" UsoCFDI="G03" RegimenFiscalReceptor="601"/><cfdi:Conceptos>${ls}</cfdi:Conceptos><cfdi:Impuestos TotalImpuestosTrasladados="${iva.toFixed(2)}"><cfdi:Traslados><cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/></cfdi:Traslados></cfdi:Impuestos><cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${now}" RfcProvCertif="SPR190613I52" SelloCFD="..." SelloSAT="..." NoCertificadoSAT="00000000000000000000"/></cfdi:Complemento></cfdi:Comprobante>`;
};

// ── File Download Helper ──
function downloadFile(fileObj) {
  if (fileObj.dataUrl) {
    const a = document.createElement("a"); a.href = fileObj.dataUrl; a.download = fileObj.name; a.click();
  } else {
    const blob = new Blob([`[Archivo demo] ${fileObj.name}\nTipo: ${fileObj.type || "desconocido"}\nTamaño: ${fileObj.size || "N/A"}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = fileObj.name; a.click(); URL.revokeObjectURL(url);
  }
}

// --- CATÁLOGOS — Vacíos, tú los alimentas ---
const MASTER_PRODUCTS = [];
const MASTER_CHAINS = [];
const MASTER_CARRIERS = [];
const SKU_ALIASES = [];

// --- STATUSES ---
const STATUSES = {
  UPLOADED: { label: "Cargado", color: "#64748b", bg: "#f1f5f9" },
  PROCESSING: { label: "Procesando", color: "#8b5cf6", bg: "#ede9fe" },
  EXTRACTED: { label: "Extraído", color: "#3b82f6", bg: "#dbeafe" },
  PENDING_REVIEW: { label: "Pendiente revisión", color: "#f97316", bg: "#ffedd5" },
  VALIDATED: { label: "Validado", color: "#0ea5e9", bg: "#e0f2fe" },
  SCHEDULED: { label: "Cita programada", color: "#8b5cf6", bg: "#ede9fe" },
  IN_TRANSIT: { label: "En tránsito", color: "#f59e0b", bg: "#fef3c7" },
  DELIVERED: { label: "Entregado", color: "#10b981", bg: "#d1fae5" },
  PARTIAL_DELIVERY: { label: "Entrega parcial", color: "#f97316", bg: "#ffedd5" },
  REJECTED: { label: "Rechazado", color: "#ef4444", bg: "#fee2e2" },
  INVOICED: { label: "Facturado", color: "#06b6d4", bg: "#cffafe" },
  RECONCILED: { label: "Conciliado", color: "#10b981", bg: "#d1fae5" },
  ERROR: { label: "Con error", color: "#ef4444", bg: "#fee2e2" },
  DUPLICATE: { label: "Duplicado", color: "#f97316", bg: "#ffedd5" },
  ARCHIVED: { label: "Archivado", color: "#9ca3af", bg: "#f9fafb" },
};

const DELIVERY_STATUSES = {
  PENDING: { label: "Sin cita", color: "#94a3b8", bg: "#f1f5f9" },
  SCHEDULED: { label: "Programada", color: "#8b5cf6", bg: "#ede9fe" },
  IN_TRANSIT: { label: "En camino", color: "#f59e0b", bg: "#fef3c7" },
  DELIVERED: { label: "Entregado", color: "#10b981", bg: "#d1fae5" },
  PARTIAL: { label: "Parcial", color: "#f97316", bg: "#ffedd5" },
  REJECTED: { label: "Rechazado", color: "#ef4444", bg: "#fee2e2" },
};

const CEDIS_LIST = [];
const DESTINATIONS = [];
const TIME_SLOTS = ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00"];
const CARRIERS_NAMES = MASTER_CARRIERS.map(c => c.name);
const REJECTION_REASONS = [];

// --- UTILS ---
const fmt = d => { if (!d) return "—"; return new Date(d+"T12:00:00").toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})};
const fmtLong = d => { if (!d) return "—"; return new Date(d+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"})};
const fmtCurrency = n => n!=null?`$${n.toLocaleString("es-MX",{minimumFractionDigits:2})}`:"—";
const daysUntil = d => { if(!d) return Infinity; return Math.ceil((new Date(d+"T12:00:00")-new Date())/86400000)};
const urgencyColor = d => { if(d<0)return"#ef4444";if(d<=2)return"#f97316";if(d<=5)return"#f59e0b";return"#10b981"};
const today = () => new Date().toISOString().split("T")[0];
const nowTime = () => {const n=new Date();return`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`};
const randomBetween = (a,b) => a + Math.random()*(b-a);
const rndInt = (a,b) => Math.floor(randomBetween(a,b));
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
const uid = () => `${Date.now()}-${Math.random().toString(36).substr(2,6)}`;

// --- Sin datos demo — todo se alimenta desde la app ---
const BACKUPS = [];

// --- ICONS ---
const I={
  search:<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  upload:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  orders:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>,
  alert:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  check:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  x:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  edit:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  download:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  back:<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  file:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  truck:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  calendar:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  clock:<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  filter:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  plus:<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  chart:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  database:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  shield:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  copy:<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  receipt:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 10h8M8 14h4"/></svg>,
  settings:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  box:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  layers:<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
};

// --- CSS ---
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');
:root{--bg:#fafbfc;--bg-card:#ffffff;--bg-sidebar:#0f1419;--bg-sidebar-hover:#1a2332;--bg-sidebar-active:#1e2d3d;--border:#e2e8f0;--border-light:#f1f5f9;--text-primary:#0f172a;--text-secondary:#475569;--text-tertiary:#94a3b8;--text-sidebar:#94a3b8;--text-sidebar-active:#f8fafc;--accent:#2563eb;--accent-light:#dbeafe;--accent-dark:#1d4ed8;--success:#10b981;--warning:#f59e0b;--danger:#ef4444;--orange:#f97316;--purple:#8b5cf6;--cyan:#06b6d4;--shadow-sm:0 1px 2px rgba(0,0,0,0.04);--shadow-md:0 4px 12px rgba(0,0,0,0.06);--shadow-lg:0 8px 30px rgba(0,0,0,0.08);--radius:8px;--radius-lg:12px;--font:'DM Sans',-apple-system,sans-serif;--font-mono:'JetBrains Mono',monospace}
*{margin:0;padding:0;box-sizing:border-box}
.app{display:flex;height:100vh;overflow:hidden;font-family:var(--font);color:var(--text-primary);background:var(--bg)}
.sidebar{width:240px;min-width:240px;background:var(--bg-sidebar);display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto}
.sidebar-brand{padding:20px 16px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.06)}
.sidebar-brand-icon{width:32px;height:32px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:12px}
.sidebar-brand-text{font-size:16px;font-weight:700;color:#f8fafc;letter-spacing:-.3px}
.sidebar-brand-badge{font-size:9px;background:rgba(37,99,235,.2);color:#60a5fa;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:auto;letter-spacing:.5px;text-transform:uppercase}
.sidebar-nav{flex:1;padding:8px 6px;display:flex;flex-direction:column;gap:1px}
.sidebar-section{padding:16px 10px 4px;font-size:9.5px;font-weight:700;color:#3e5068;text-transform:uppercase;letter-spacing:1px}
.sidebar-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;cursor:pointer;color:var(--text-sidebar);font-size:13px;font-weight:500;transition:all .15s}
.sidebar-item:hover{background:var(--bg-sidebar-hover);color:#b8c9dd}
.sidebar-item.active{background:var(--bg-sidebar-active);color:var(--text-sidebar-active)}
.sidebar-item .badge{margin-left:auto;font-size:10px;font-weight:700;background:rgba(239,68,68,.2);color:#f87171;padding:1px 6px;border-radius:10px;min-width:18px;text-align:center}
.sidebar-item .badge-purple{background:rgba(139,92,246,.2);color:#a78bfa}
.sidebar-item .badge-cyan{background:rgba(6,182,212,.2);color:#22d3ee}
.sidebar-footer{padding:12px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px}
.sidebar-avatar{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff}
.sidebar-user-name{font-size:12px;font-weight:600;color:#e2e8f0}.sidebar-user-role{font-size:10px;color:#506780}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{height:52px;min-height:52px;background:var(--bg-card);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:10px}
.topbar-search{display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:0 10px;height:34px;flex:1;max-width:360px}
.topbar-search input{border:none;background:transparent;outline:none;font-size:12.5px;color:var(--text-primary);font-family:var(--font);width:100%}
.topbar-search input::placeholder{color:var(--text-tertiary)}
.topbar-search svg{color:var(--text-tertiary);flex-shrink:0}
.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
.content{flex:1;overflow-y:auto;padding:20px}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:var(--radius);font-size:12.5px;font-weight:600;font-family:var(--font);border:none;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent-dark)}
.btn-secondary{background:var(--bg);border:1px solid var(--border);color:var(--text-primary)}.btn-secondary:hover{background:#f1f5f9}
.btn-ghost{background:transparent;color:var(--text-secondary);padding:5px 8px}.btn-ghost:hover{background:#f1f5f9}
.btn-sm{padding:4px 8px;font-size:11.5px}
.btn-success{background:#ecfdf5;border:1px solid #a7f3d0;color:#059669}.btn-success:hover{background:#d1fae5}
.btn-purple{background:#f5f3ff;border:1px solid #c4b5fd;color:#7c3aed}.btn-purple:hover{background:#ede9fe}
.btn-warning{background:#fffbeb;border:1px solid #fde68a;color:#b45309}
.btn-danger{background:#fef2f2;border:1px solid #fecaca;color:#dc2626}
.btn-cyan{background:#ecfeff;border:1px solid #a5f3fc;color:#0891b2}
.card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;box-shadow:var(--shadow-sm)}
.stat-label{font-size:10.5px;color:var(--text-tertiary);font-weight:600;margin-bottom:3px;text-transform:uppercase;letter-spacing:.4px}
.stat-value{font-size:24px;font-weight:700;letter-spacing:-.8px}
.stat-sub{font-size:10.5px;color:var(--text-tertiary);margin-top:2px;display:flex;align-items:center;gap:3px}
.stat-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:2px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead th{text-align:left;padding:9px 10px;font-weight:600;color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);background:#fafbfd;white-space:nowrap;cursor:pointer;user-select:none}
thead th:hover{color:var(--text-secondary)}
tbody td{padding:9px 10px;border-bottom:1px solid var(--border-light);vertical-align:middle}
tbody tr{transition:background .1s}tbody tr:hover{background:#f8fafc}tbody tr.clickable{cursor:pointer}
.status-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:600}
.status-dot{width:5px;height:5px;border-radius:50%}
.confidence-bar{display:flex;align-items:center;gap:6px}
.confidence-track{flex:1;height:3px;background:#e2e8f0;border-radius:2px;overflow:hidden;max-width:40px}
.confidence-fill{height:100%;border-radius:2px}
.confidence-label{font-size:10.5px;font-weight:600;font-family:var(--font-mono)}
.filter-select{padding:5px 26px 5px 8px;border:1px solid var(--border);border-radius:6px;font-size:11.5px;font-family:var(--font);color:var(--text-primary);background:#fff url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 8px center;appearance:none;cursor:pointer;min-width:110px}
.filter-select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.08)}
.active-filter{background-color:var(--accent-light);border-color:var(--accent);color:var(--accent)}
.page-header{margin-bottom:20px}.page-header h1{font-size:20px;font-weight:700;letter-spacing:-.4px}.page-header p{font-size:13px;color:var(--text-secondary);margin-top:2px}
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px}
.tab{padding:8px 14px;font-size:12.5px;font-weight:600;color:var(--text-tertiary);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;margin-bottom:-1px}
.tab:hover{color:var(--text-secondary)}.tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab .tab-count{margin-left:4px;font-size:10px;font-weight:700;background:#f1f5f9;padding:1px 5px;border-radius:8px}
.tab.active .tab-count{background:var(--accent-light);color:var(--accent)}
.detail-section-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-tertiary);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border-light)}
.detail-field{margin-bottom:8px}.detail-field-label{font-size:10.5px;color:var(--text-tertiary);font-weight:500;margin-bottom:1px}.detail-field-value{font-size:13px;font-weight:500}
.form-group{margin-bottom:14px}.form-label{display:block;font-size:11.5px;font-weight:600;color:var(--text-secondary);margin-bottom:4px}
.form-input,.form-select,.form-textarea{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:12.5px;font-family:var(--font);color:var(--text-primary);background:#fff}
.form-input:focus,.form-select:focus,.form-textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.08)}
.form-textarea{resize:vertical;min-height:50px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.modal{background:#fff;border-radius:var(--radius-lg);max-width:560px;width:92%;box-shadow:var(--shadow-lg);overflow:hidden;max-height:90vh;display:flex;flex-direction:column}
.modal-header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.modal-header h3{font-size:16px;font-weight:700}.modal-body{padding:20px;overflow-y:auto;flex:1}.modal-footer{padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:6px;background:#fafbfd}
.empty-state{text-align:center;padding:48px 20px;color:var(--text-tertiary)}
.empty-state-icon{font-size:36px;margin-bottom:10px;opacity:.4}.empty-state h3{font-size:15px;font-weight:600;color:var(--text-secondary);margin-bottom:4px}.empty-state p{font-size:12.5px}
.validation-item{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;font-size:11.5px;font-weight:500;margin-bottom:3px}
.validation-item.error{background:#fef2f2;color:#b91c1c}.validation-item.warning{background:#fffbeb;color:#92400e}.validation-item.info{background:#f0f9ff;color:#0369a1}
.timeline{display:flex;flex-direction:column}.timeline-item{display:flex;gap:10px;padding:8px 0;position:relative}
.timeline-dot{width:26px;height:26px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;position:relative;z-index:1;border:2px solid var(--border)}
.timeline-item:not(:last-child)::before{content:'';position:absolute;left:12px;top:34px;bottom:-2px;width:1.5px;background:var(--border)}
.timeline-action{font-size:12.5px;font-weight:500}.timeline-meta{font-size:10.5px;color:var(--text-tertiary);margin-top:1px}
.toast{position:fixed;bottom:20px;right:20px;background:#0f172a;color:#fff;padding:10px 18px;border-radius:var(--radius);font-size:12.5px;font-weight:500;box-shadow:var(--shadow-lg);z-index:1000;display:flex;align-items:center;gap:6px;animation:slideUp .3s ease}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border)}
.cal-header{background:#fafbfd;padding:8px;text-align:center;font-size:10.5px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase}
.cal-day{background:#fff;min-height:90px;padding:6px;position:relative}
.cal-day.other-month{background:#fafbfd;opacity:.5}
.cal-day.today{box-shadow:inset 0 0 0 2px var(--accent)}
.cal-day-num{font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px}
.cal-event{font-size:9.5px;padding:2px 4px;border-radius:3px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;font-weight:600}
.cal-event:hover{opacity:.8}
.metric-bar{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.metric-bar-label{font-size:11.5px;font-weight:500;min-width:80px;color:var(--text-secondary)}
.metric-bar-track{flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden}
.metric-bar-fill{height:100%;border-radius:4px;transition:width .5s}
.metric-bar-value{font-size:11.5px;font-weight:700;font-family:var(--font-mono);min-width:40px;text-align:right}
.recon-row{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:start;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px}
.recon-col{font-size:12px}.recon-col-header{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:4px;letter-spacing:.3px}
.recon-vs{display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--text-tertiary);padding-top:18px}
.recon-match{border-left:3px solid var(--success)}.recon-mismatch{border-left:3px solid var(--danger)}
.dup-card{border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:8px;border-left:3px solid var(--orange)}
.backup-status{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px}
.backup-ok{background:#d1fae5;color:#059669}.backup-fail{background:#fee2e2;color:#dc2626}
.upload-zone{border:2px dashed var(--border);border-radius:var(--radius-lg);padding:40px 20px;text-align:center;cursor:pointer;transition:all .2s;background:var(--bg)}
.upload-zone:hover{border-color:var(--accent);background:#f0f5ff}
.format-tag{font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px}
.progress-bar{height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden}.progress-fill{height:100%;background:linear-gradient(90deg,var(--accent),#7c3aed);border-radius:3px;transition:width .5s}
.processing-step{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-tertiary);padding:3px 0}.processing-step.active{color:var(--accent);font-weight:600}.processing-step.done{color:var(--success)}
@keyframes spin{to{transform:rotate(360deg)}}.spinner{width:12px;height:12px;border:2px solid #e2e8f0;border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@media(max-width:768px){.sidebar{display:none}.stats-grid{grid-template-columns:1fr 1fr}}
`;

// --- SHARED COMPONENTS ---
function StatusBadge({status}) {
  const s = STATUSES[status] || STATUSES.UPLOADED;
  return (
    <span className="status-badge" style={{background:s.bg,color:s.color}}>
      <span className="status-dot" style={{background:s.color}}/>{s.label}
    </span>
  );
}

function DeliveryBadge({status}) {
  const s = DELIVERY_STATUSES[status] || DELIVERY_STATUSES.PENDING;
  return (
    <span className="status-badge" style={{background:s.bg,color:s.color}}>
      <span className="status-dot" style={{background:s.color}}/>{s.label}
    </span>
  );
}

function ConfidenceIndicator({value}) {
  const p = Math.round(value * 100);
  const c = p >= 85 ? "#10b981" : p >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="confidence-bar">
      <div className="confidence-track">
        <div className="confidence-fill" style={{width:`${p}%`,background:c}}/>
      </div>
      <span className="confidence-label" style={{color:c}}>{p}%</span>
    </div>
  );
}

function Toast({message, onClose}) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="toast">
      <span style={{color:"#10b981"}}>{I.check}</span>{message}
    </div>
  );
}

function MetricBar({label, value, max, color}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="metric-bar">
      <span className="metric-bar-label">{label}</span>
      <div className="metric-bar-track">
        <div className="metric-bar-fill" style={{width:`${pct}%`,background:color||"var(--accent)"}}/>
      </div>
      <span className="metric-bar-value" style={{color:color||"var(--text-primary)"}}>{typeof value === "number" ? value.toLocaleString() : value}</span>
    </div>
  );
}

// ==========================================
// CATALOGS VIEW
// ==========================================
function CatalogsView({toast:setToast}){
  const [tab,setTab]=useState("products");
  const [products]=useState(MASTER_PRODUCTS);
  const [chains]=useState(MASTER_CHAINS);
  const [carriers]=useState(MASTER_CARRIERS);
  const [aliases]=useState(SKU_ALIASES);
  const [search,setSearch]=useState("");

  return(<div>
    <div className="page-header"><h1>Catálogos Maestros</h1><p>Productos, cadenas, transportistas y equivalencias de SKU</p></div>
    <div className="tabs">
      {[["products",`Productos (${products.length})`],["chains",`Cadenas (${chains.length})`],["carriers",`Transportistas (${carriers.length})`],["aliases",`Equivalencias SKU (${aliases.length})`]].map(([k,l])=>
        <div key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{l}</div>)}
    </div>
    <div style={{marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
      <div className="topbar-search" style={{maxWidth:260,height:32}}>{I.search}<input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <button className="btn btn-primary btn-sm" onClick={()=>setToast("Función disponible en producción")}>{I.plus} Agregar</button>
      <button className="btn btn-secondary btn-sm" onClick={()=>setToast("Exportado")}>{I.download} Exportar</button>
    </div>

    {tab==="products"&&<div className="card" style={{overflow:"hidden"}}><table><thead><tr><th>SKU</th><th>Descripción</th><th>Categoría</th><th>Presentación</th><th>Unidad</th><th>Precio base</th><th>EAN</th><th>Estado</th></tr></thead>
      <tbody>{products.filter(p=>!search||p.description.toLowerCase().includes(search.toLowerCase())||p.id.toLowerCase().includes(search.toLowerCase())).map(p=><tr key={p.id}>
        <td style={{fontFamily:"var(--font-mono)",fontWeight:600,fontSize:12}}>{p.id}</td><td style={{fontWeight:500}}>{p.description}</td><td><span className="format-tag">{p.category}</span></td>
        <td>{p.presentation}</td><td>{p.unit}</td><td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtCurrency(p.basePrice)}</td>
        <td style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-tertiary)"}}>{p.ean}</td>
        <td><span className="status-badge" style={{background:p.active?"#d1fae5":"#fee2e2",color:p.active?"#059669":"#dc2626"}}>{p.active?"Activo":"Inactivo"}</span></td>
      </tr>)}</tbody></table></div>}

    {tab==="chains"&&<div className="card" style={{overflow:"hidden"}}><table><thead><tr><th>Código</th><th>Cadena</th><th>CEDIS</th><th>Días pago</th><th>Contacto</th><th>Estado</th></tr></thead>
      <tbody>{chains.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase())).map(c=><tr key={c.id}>
        <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{c.code}</td><td style={{fontWeight:600}}>{c.name}</td>
        <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{c.cedis.map(d=><span key={d} className="format-tag" style={{fontSize:9}}>{d.replace("CEDIS ","")}</span>)}</div></td>
        <td style={{fontWeight:600}}>{c.paymentDays}d</td><td style={{fontSize:11.5,color:"var(--text-secondary)"}}>{c.contact}</td>
        <td><span className="status-badge" style={{background:"#d1fae5",color:"#059669"}}>Activo</span></td>
      </tr>)}</tbody></table></div>}

    {tab==="carriers"&&<div className="card" style={{overflow:"hidden"}}><table><thead><tr><th>Código</th><th>Transportista</th><th>Vehículos propios</th><th>Contacto</th><th>Estado</th></tr></thead>
      <tbody>{carriers.map(c=><tr key={c.id}>
        <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{c.code}</td><td style={{fontWeight:600}}>{c.name}</td>
        <td>{c.vehicles>0?c.vehicles:"Externo"}</td><td style={{fontSize:11.5}}>{c.contact}</td>
        <td><span className="status-badge" style={{background:"#d1fae5",color:"#059669"}}>Activo</span></td>
      </tr>)}</tbody></table></div>}

    {tab==="aliases"&&<div className="card" style={{overflow:"hidden"}}><table><thead><tr><th>Cadena</th><th>SKU cadena</th><th>SKU interno</th><th>Producto</th></tr></thead>
      <tbody>{aliases.filter(a=>!search||a.description.toLowerCase().includes(search.toLowerCase())||a.chainSku.toLowerCase().includes(search.toLowerCase())).map((a,i)=><tr key={i}>
        <td><span className="format-tag">{a.chainCode}</span></td>
        <td style={{fontFamily:"var(--font-mono)",fontWeight:500,fontSize:12}}>{a.chainSku}</td>
        <td style={{fontFamily:"var(--font-mono)",fontWeight:600,fontSize:12,color:"var(--accent)"}}>{a.internalSku}</td>
        <td>{a.description}</td>
      </tr>)}</tbody></table></div>}
  </div>);
}

// ==========================================
// REPORTS VIEW
// ==========================================
function ReportsView({orders}){
  const [period,setPeriod]=useState("month");

  const metrics=useMemo(()=>{
    const delivered=orders.filter(o=>["DELIVERED","PARTIAL_DELIVERY","INVOICED","RECONCILED"].includes(o.status));
    const totalRevenue=delivered.reduce((s,o)=>s+o.total,0);
    const byChain={};
    orders.forEach(o=>{if(!byChain[o.chain])byChain[o.chain]={orders:0,revenue:0,delivered:0,onTime:0,rejected:0,fillRate:[]};byChain[o.chain].orders++;
      if(["DELIVERED","PARTIAL_DELIVERY","INVOICED","RECONCILED"].includes(o.status)){byChain[o.chain].delivered++;byChain[o.chain].revenue+=o.total;
        if(o.delivery?.actualDeliveryDate&&o.delivery?.appointmentDate&&o.delivery.actualDeliveryDate<=o.delivery.appointmentDate)byChain[o.chain].onTime++;
        o.lines.forEach(l=>{if(l.quantity>0)byChain[o.chain].fillRate.push((l.deliveredQty||0)/l.quantity)});
      }
      if(o.status==="REJECTED")byChain[o.chain].rejected++;
    });
    const chainMetrics=Object.entries(byChain).map(([name,d])=>({name,...d,onTimeRate:d.delivered>0?Math.round((d.onTime/d.delivered)*100):0,avgFillRate:d.fillRate.length>0?Math.round((d.fillRate.reduce((a,b)=>a+b,0)/d.fillRate.length)*100):0})).sort((a,b)=>b.revenue-a.revenue);
    const totalDelivered=delivered.length;
    const onTime=delivered.filter(o=>o.delivery?.actualDeliveryDate&&o.delivery?.appointmentDate&&o.delivery.actualDeliveryDate<=o.delivery.appointmentDate).length;
    const rejected=orders.filter(o=>o.status==="REJECTED").length;
    const partial=orders.filter(o=>o.status==="PARTIAL_DELIVERY").length;
    const avgConf=orders.length>0?Math.round((orders.reduce((s,o)=>s+o.confidence,0)/orders.length)*100):0;
    const allFillRates=[];delivered.forEach(o=>o.lines.forEach(l=>{if(l.quantity>0)allFillRates.push((l.deliveredQty||0)/l.quantity)}));
    const avgFillRate=allFillRates.length>0?Math.round((allFillRates.reduce((a,b)=>a+b,0)/allFillRates.length)*100):0;
    return{totalRevenue,totalOrders:orders.length,totalDelivered,onTime,onTimeRate:totalDelivered>0?Math.round((onTime/totalDelivered)*100):0,rejected,partial,avgConf,avgFillRate,chainMetrics};
  },[orders]);

  const maxRevenue=Math.max(...metrics.chainMetrics.map(c=>c.revenue),1);

  return(<div>
    <div className="page-header"><h1>Reportes y Métricas</h1><p>Análisis operativo y de negocio</p></div>
    <div className="stats-grid" style={{gridTemplateColumns:"repeat(6,1fr)"}}>
      <div className="stat-card"><div className="stat-label">Ventas totales</div><div className="stat-value" style={{fontSize:20}}>{fmtCurrency(metrics.totalRevenue)}</div></div>
      <div className="stat-card"><div className="stat-label">Pedidos</div><div className="stat-value">{metrics.totalOrders}</div></div>
      <div className="stat-card"><div className="stat-label">Entregados</div><div className="stat-value" style={{color:"var(--success)"}}>{metrics.totalDelivered}</div></div>
      <div className="stat-card"><div className="stat-label">Cumplimiento a tiempo</div><div className="stat-value" style={{color:metrics.onTimeRate>=80?"var(--success)":"var(--danger)"}}>{metrics.onTimeRate}%</div></div>
      <div className="stat-card"><div className="stat-label">Fill rate</div><div className="stat-value" style={{color:metrics.avgFillRate>=90?"var(--success)":"var(--warning)"}}>{metrics.avgFillRate}%</div></div>
      <div className="stat-card"><div className="stat-label">Rechazos</div><div className="stat-value" style={{color:"var(--danger)"}}>{metrics.rejected}</div></div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
      <div className="card" style={{padding:16}}>
        <div className="detail-section-title">Ventas por cadena</div>
        {metrics.chainMetrics.map(c=><MetricBar key={c.name} label={c.name} value={c.revenue} max={maxRevenue} color="var(--accent)"/>)}
      </div>
      <div className="card" style={{padding:16}}>
        <div className="detail-section-title">Cumplimiento a tiempo por cadena</div>
        {metrics.chainMetrics.map(c=><MetricBar key={c.name} label={c.name} value={c.onTimeRate} max={100} color={c.onTimeRate>=80?"var(--success)":c.onTimeRate>=60?"var(--warning)":"var(--danger)"}/>)}
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div className="card" style={{padding:16}}>
        <div className="detail-section-title">Fill rate por cadena</div>
        {metrics.chainMetrics.map(c=><MetricBar key={c.name} label={c.name} value={c.avgFillRate} max={100} color={c.avgFillRate>=90?"var(--success)":c.avgFillRate>=75?"var(--warning)":"var(--danger)"}/>)}
      </div>
      <div className="card" style={{padding:16}}>
        <div className="detail-section-title">Volumen de pedidos por cadena</div>
        {metrics.chainMetrics.map(c=><MetricBar key={c.name} label={c.name} value={c.orders} max={Math.max(...metrics.chainMetrics.map(x=>x.orders),1)} color="var(--purple)"/>)}
      </div>
    </div>
  </div>);
}

// ==========================================
// CALENDAR VIEW
// ==========================================
function CalendarView({orders,onSelectOrder}){
  const [monthOffset,setMonthOffset]=useState(0);
  const baseDate=useMemo(()=>{const d=new Date();d.setMonth(d.getMonth()+monthOffset);return d},[monthOffset]);
  const year=baseDate.getFullYear();const month=baseDate.getMonth();
  const monthName=baseDate.toLocaleDateString("es-MX",{month:"long",year:"numeric"});

  const calDays=useMemo(()=>{
    const first=new Date(year,month,1);const startDay=first.getDay();
    const daysInMonth=new Date(year,month+1,0).getDate();
    const daysInPrev=new Date(year,month,0).getDate();
    const days=[];
    for(let i=startDay-1;i>=0;i--)days.push({day:daysInPrev-i,current:false,date:null});
    for(let i=1;i<=daysInMonth;i++){const d=`${year}-${String(month+1).padStart(2,"0")}-${String(i).padStart(2,"0")}`;days.push({day:i,current:true,date:d,isToday:d===today()})}
    const remaining=42-days.length;for(let i=1;i<=remaining;i++)days.push({day:i,current:false,date:null});
    return days;
  },[year,month]);

  const eventsByDate=useMemo(()=>{
    const map={};
    orders.forEach(o=>{
      const d=o.delivery?.appointmentDate;
      if(d){if(!map[d])map[d]=[];map[d].push(o)}
    });
    return map;
  },[orders]);

  const colorMap={SCHEDULED:"#8b5cf6",IN_TRANSIT:"#f59e0b",DELIVERED:"#10b981",PARTIAL:"#f97316",REJECTED:"#ef4444",PENDING:"#94a3b8"};

  return(<div>
    <div className="page-header"><h1>Calendario de Entregas</h1><p>Vista mensual de citas programadas</p></div>
    <div className="card" style={{overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>setMonthOffset(m=>m-1)}>← Anterior</button>
        <span style={{fontWeight:700,fontSize:15,textTransform:"capitalize"}}>{monthName}</span>
        <div style={{display:"flex",gap:6}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setMonthOffset(0)}>Hoy</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setMonthOffset(m=>m+1)}>Siguiente →</button>
        </div>
      </div>
      <div className="cal-grid">
        {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d=><div key={d} className="cal-header">{d}</div>)}
        {calDays.map((d,i)=>(
          <div key={i} className={`cal-day ${!d.current?"other-month":""} ${d.isToday?"today":""}`}>
            <div className="cal-day-num">{d.day}</div>
            {d.date&&eventsByDate[d.date]?.slice(0,3).map((o,j)=>(
              <div key={j} className="cal-event" style={{background:colorMap[o.delivery?.status]||"#94a3b8",color:"#fff"}} onClick={()=>onSelectOrder(o)} title={`${o.orderNumber} — ${o.chain} ${o.delivery?.appointmentTime||""}`}>
                {o.delivery?.appointmentTime} {o.chain.substring(0,3)}
              </div>
            ))}
            {d.date&&(eventsByDate[d.date]?.length||0)>3&&<div style={{fontSize:9,color:"var(--text-tertiary)",textAlign:"center"}}>+{eventsByDate[d.date].length-3} más</div>}
          </div>
        ))}
      </div>
    </div>
    <div style={{marginTop:12,display:"flex",gap:12,flexWrap:"wrap"}}>
      {Object.entries(colorMap).map(([k,c])=><div key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}><span style={{width:10,height:10,borderRadius:3,background:c,display:"inline-block"}}/>{DELIVERY_STATUSES[k]?.label||k}</div>)}
    </div>
  </div>);
}

// ==========================================
// RECONCILIATION VIEW — with Invoice Upload + Discounts
// ==========================================
function ReconciliationView({orders, onUpdate, setToast, onUploadInvoice}) {
  const [tab, setTab] = useState("pending");
  const deliveredNoInvoice = useMemo(() => orders.filter(o => ["DELIVERED","PARTIAL_DELIVERY"].includes(o.status) && !o.invoice), [orders]);
  const invoicedOrders = useMemo(() => orders.filter(o => o.invoice), [orders]);
  const allRecon = useMemo(() => [...deliveredNoInvoice, ...invoicedOrders], [deliveredNoInvoice, invoicedOrders]);

  const shown = useMemo(() => {
    if (tab === "pending") return deliveredNoInvoice;
    if (tab === "invoiced") return invoicedOrders.filter(o => !o.invoice?.reconciled);
    if (tab === "reconciled") return invoicedOrders.filter(o => o.invoice?.reconciled);
    if (tab === "discrepancies") return invoicedOrders.filter(o => o.invoice?.discrepancies?.length > 0);
    return allRecon;
  }, [tab, deliveredNoInvoice, invoicedOrders, allRecon]);

  const reconcile = (order) => {
    const updated = {...order, status: "RECONCILED", invoice: {...order.invoice, reconciled: true},
      history: [...order.history, {date: new Date().toISOString(), action: "Pedido conciliado con factura", user: "", icon: "✅"}]};
    onUpdate(updated);
    setToast("Pedido conciliado");
  };

  return (
    <div>
      <div className="page-header">
        <h1>Conciliación Pedido vs Factura</h1>
        <p>Sube facturas, registra descuentos y concilia pedidos</p>
      </div>

      <div className="stats-grid" style={{gridTemplateColumns: "repeat(5, 1fr)"}}>
        <div className="stat-card"><div className="stat-label">Sin factura</div><div className="stat-value" style={{color: "var(--warning)"}}>{deliveredNoInvoice.length}</div><div className="stat-sub"><span className="stat-dot" style={{background: "var(--warning)"}} />Entregados sin facturar</div></div>
        <div className="stat-card"><div className="stat-label">Facturados</div><div className="stat-value" style={{color: "var(--cyan)"}}>{invoicedOrders.filter(o => !o.invoice?.reconciled).length}</div></div>
        <div className="stat-card"><div className="stat-label">Conciliados</div><div className="stat-value" style={{color: "var(--success)"}}>{invoicedOrders.filter(o => o.invoice?.reconciled).length}</div></div>
        <div className="stat-card"><div className="stat-label">Con discrepancia</div><div className="stat-value" style={{color: "var(--danger)"}}>{invoicedOrders.filter(o => o.invoice?.discrepancies?.length > 0).length}</div></div>
        <div className="stat-card"><div className="stat-label">Total facturado</div><div className="stat-value" style={{fontSize: 18}}>{fmtCurrency(invoicedOrders.reduce((s, o) => s + (o.invoice?.invoiceTotal || 0), 0))}</div></div>
      </div>

      <div className="tabs">
        {[["pending", `Sin factura (${deliveredNoInvoice.length})`], ["invoiced", `Por conciliar (${invoicedOrders.filter(o => !o.invoice?.reconciled).length})`], ["reconciled", "Conciliados"], ["discrepancies", "Con discrepancia"]].map(([k, l]) => (
          <div key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</div>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card" style={{padding: 20}}><div className="empty-state"><div className="empty-state-icon">🧾</div><h3>Sin registros en esta vista</h3></div></div>
      ) : (
        <div>{shown.map(o => {
          const inv = o.invoice;
          const totalOrdered = o.total;
          const totalDelivered = o.lines.reduce((s, l) => s + (l.deliveredQty || 0) * l.unitPrice, 0);
          const totalDiscounts = (inv?.discounts || []).reduce((s, d) => s + (d.amount || 0), 0);
          const totalInvoiced = inv?.invoiceTotal || 0;
          const matchDelivery = inv ? Math.abs(totalDelivered - totalInvoiced) < 1 : false;

          if (!inv) {
            return (
              <div key={o.id} style={{border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 10, borderLeft: "3px solid var(--warning)", background: "#fff"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 4}}>
                      <span style={{fontWeight: 700, fontSize: 14}}>{o.orderNumber}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <div style={{fontSize: 12, color: "var(--text-secondary)"}}>
                      {o.chain} · {o.destination} · Entregado: {fmt(o.delivery?.actualDeliveryDate)} · {fmtCurrency(totalOrdered)}
                    </div>
                    <div style={{fontSize: 11, color: "var(--text-tertiary)", marginTop: 2}}>
                      Total entregado: {fmtCurrency(totalDelivered)} · {o.lines.length} líneas
                    </div>
                  </div>
                  <button className="btn btn-cyan" onClick={() => onUploadInvoice(o)}>
                    {I.upload} Subir factura
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={o.id} className={`recon-row ${matchDelivery ? "recon-match" : "recon-mismatch"}`}>
              <div className="recon-col">
                <div className="recon-col-header">Pedido / Entrega</div>
                <div style={{fontWeight: 600, marginBottom: 2}}>{o.orderNumber}</div>
                <div style={{fontSize: 11, color: "var(--text-tertiary)"}}>{o.chain} · {fmt(o.emissionDate)}</div>
                <div style={{fontFamily: "var(--font-mono)", fontWeight: 700, marginTop: 4}}>Pedido: {fmtCurrency(totalOrdered)}</div>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)"}}>Entregado: {fmtCurrency(totalDelivered)}</div>
                {totalDiscounts > 0 && (
                  <div style={{fontSize: 11, color: "var(--danger)", marginTop: 2}}>Descuentos: -{fmtCurrency(totalDiscounts)}</div>
                )}
              </div>
              <div className="recon-vs">
                <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 4}}>
                  <div style={{fontSize: 16}}>⟷</div>
                  <div style={{fontSize: 10.5, fontWeight: 600, color: matchDelivery ? "var(--success)" : "var(--danger)"}}>{matchDelivery ? "Coincide" : "Diferencia"}</div>
                  {!matchDelivery && <div style={{fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--danger)"}}>{fmtCurrency(Math.abs(totalDelivered - totalInvoiced))}</div>}
                </div>
              </div>
              <div className="recon-col">
                <div className="recon-col-header">Factura</div>
                <div style={{fontWeight: 600, marginBottom: 2}}>{inv.invoiceNumber}</div>
                <div style={{fontSize: 11, color: "var(--text-tertiary)"}}>{fmt(inv.invoiceDate)} · Vence: {fmt(inv.paymentDueDate)}</div>
                <div style={{fontFamily: "var(--font-mono)", fontWeight: 700, marginTop: 4}}>{fmtCurrency(totalInvoiced)}</div>
                {inv.invoiceFile && <div style={{fontSize: 10.5, color: "var(--accent)", marginTop: 2, display: "flex", alignItems: "center", gap: 4}}>{I.file} {inv.invoiceFile}</div>}
                {inv.discounts?.length > 0 && (
                  <div style={{marginTop: 4}}>{inv.discounts.map((d, i) => (
                    <div key={i} style={{fontSize: 10.5, background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, marginTop: 2}}>
                      {d.concept}: -{fmtCurrency(d.amount)}
                    </div>
                  ))}</div>
                )}
                {inv.discrepancies?.length > 0 && (
                  <div style={{marginTop: 4}}>{inv.discrepancies.map((d, i) => (
                    <div key={i} style={{fontSize: 10.5, color: "var(--danger)", background: "#fef2f2", padding: "2px 6px", borderRadius: 4, marginTop: 2}}>
                      {d.reason}: {fmtCurrency(d.difference)}
                    </div>
                  ))}</div>
                )}
                <div style={{display: "flex", gap: 4, marginTop: 8}}>
                  {inv.reconciled ? (
                    <span className="status-badge" style={{background: "#d1fae5", color: "#059669"}}>Conciliado</span>
                  ) : (
                    <>
                      <button className="btn btn-success btn-sm" onClick={() => reconcile(o)}>{I.check} Conciliar</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => onUploadInvoice(o)}>{I.edit} Editar</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}</div>
      )}
    </div>
  );
}

// ==========================================
// INVOICE UPLOAD MODAL — with Discounts
// ==========================================
const DISCOUNT_TYPES = [];

function InvoiceUploadModal({order, onSave, onClose}) {
  const existing = order.invoice || {};
  const [form, setForm] = useState({
    invoiceNumber: existing.invoiceNumber || "",
    invoiceDate: existing.invoiceDate || today(),
    invoiceFile: existing.invoiceFile || "",
    paymentDueDate: existing.paymentDueDate || "",
    notes: existing.notes || "",
  });
  const [lines, setLines] = useState(order.lines.map(l => ({
    id: l.id, sku: l.sku, description: l.description,
    orderedQty: l.quantity, deliveredQty: l.deliveredQty || l.quantity,
    invoicedQty: existing.invoiceNumber ? (l.invoicedQty || l.deliveredQty || l.quantity) : (l.deliveredQty || l.quantity),
    unitPrice: l.unitPrice,
    invoicedPrice: existing.invoiceNumber ? (l.invoicedPrice || l.unitPrice) : l.unitPrice,
  })));
  const [discounts, setDiscounts] = useState(existing.discounts || []);
  const [fileSelected, setFileSelected] = useState(!!existing.invoiceFile);
  const fileRef = useRef();

  const u = (k, v) => setForm({...form, [k]: v});
  const updLine = (id, field, val) => setLines(prev => prev.map(l => l.id === id ? {...l, [field]: val} : l));
  const addDiscount = () => setDiscounts(prev => [...prev, {id: uid(), concept: "", type: DISCOUNT_TYPES[0], amount: 0, notes: ""}]);
  const updDiscount = (id, field, val) => setDiscounts(prev => prev.map(d => d.id === id ? {...d, [field]: val} : d));
  const removeDiscount = (id) => setDiscounts(prev => prev.filter(d => d.id !== id));

  const subtotal = lines.reduce((s, l) => s + (l.invoicedQty * l.invoicedPrice), 0);
  const totalDiscounts = discounts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const invoiceTotal = subtotal - totalDiscounts;

  const handleSave = () => {
    if (!form.invoiceNumber || !form.invoiceDate) return;
    onSave({
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      invoiceFile: form.invoiceFile || `factura_${form.invoiceNumber}.pdf`,
      invoiceTotal: +invoiceTotal.toFixed(2),
      paymentDueDate: form.paymentDueDate || null,
      notes: form.notes,
      reconciled: false,
      discounts: discounts.filter(d => d.amount > 0),
      discrepancies: Math.abs(invoiceTotal - order.total) > 1 ? [{
        field: "total", orderValue: order.total, invoiceValue: +invoiceTotal.toFixed(2),
        difference: +(order.total - invoiceTotal).toFixed(2),
        reason: totalDiscounts > 0 ? `Incluye descuentos por ${fmtCurrency(totalDiscounts)}` : "Diferencia entre pedido y factura"
      }] : [],
    }, lines);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 680, maxHeight: "92vh"}}>
        <div className="modal-header">
          <h3>🧾 {existing.invoiceNumber ? "Editar" : "Registrar"} factura</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body" style={{overflowY: "auto"}}>
          <div style={{background: "#f8fafc", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12.5}}>
            <strong>{order.orderNumber}</strong> · {order.chain} · {order.destination} · Pedido: {fmtCurrency(order.total)}
          </div>

          {/* Invoice header */}
          <div style={{marginBottom: 16}}>
            <div className="detail-section-title">Datos de la factura</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Número de factura *</label>
                <input className="form-input" placeholder="FAC-00001" value={form.invoiceNumber} onChange={e => u("invoiceNumber", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de factura *</label>
                <input type="date" className="form-input" value={form.invoiceDate} onChange={e => u("invoiceDate", e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha de vencimiento de pago</label>
                <input type="date" className="form-input" value={form.paymentDueDate} onChange={e => u("paymentDueDate", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Archivo de factura (PDF/XML)</label>
                <div style={{display: "flex", gap: 6}}>
                  <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} style={{flex: 1}}>
                    {I.upload} {fileSelected ? "Cambiar archivo" : "Seleccionar archivo"}
                  </button>
                  {fileSelected && <span style={{fontSize: 11, color: "var(--success)", display: "flex", alignItems: "center", gap: 3}}>{I.check} Archivo listo</span>}
                </div>
                <input ref={fileRef} type="file" hidden accept=".pdf,.xml" onChange={e => {
                  if (e.target.files[0]) { u("invoiceFile", e.target.files[0].name); setFileSelected(true); }
                }} />
              </div>
            </div>
          </div>

          {/* Invoice lines */}
          <div style={{marginBottom: 16}}>
            <div className="detail-section-title">Líneas facturadas</div>
            <div style={{overflowX: "auto"}}>
              <table style={{fontSize: 11.5}}>
                <thead><tr>
                  <th>SKU</th><th>Producto</th><th>Pedido</th><th>Entregado</th><th>Facturado</th><th>Precio fact.</th><th>Importe</th>
                </tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td style={{fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 11}}>{l.sku}</td>
                      <td style={{fontSize: 11.5}}>{l.description}</td>
                      <td style={{fontFamily: "var(--font-mono)", color: "var(--text-tertiary)"}}>{l.orderedQty}</td>
                      <td style={{fontFamily: "var(--font-mono)", color: "var(--text-secondary)"}}>{l.deliveredQty}</td>
                      <td>
                        <input type="number" min={0} style={{width: 60, padding: "3px 5px", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600}}
                          value={l.invoicedQty} onChange={e => updLine(l.id, "invoicedQty", parseInt(e.target.value) || 0)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min={0} style={{width: 70, padding: "3px 5px", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11.5}}
                          value={l.invoicedPrice} onChange={e => updLine(l.id, "invoicedPrice", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td style={{fontFamily: "var(--font-mono)", fontWeight: 600}}>{fmtCurrency(l.invoicedQty * l.invoicedPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop: "2px solid var(--border)"}}>
                    <td colSpan={6} style={{textAlign: "right", fontWeight: 700, fontSize: 12}}>Subtotal:</td>
                    <td style={{fontFamily: "var(--font-mono)", fontWeight: 700}}>{fmtCurrency(subtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Discounts / Deductions */}
          <div style={{marginBottom: 16}}>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8}}>
              <div className="detail-section-title" style={{marginBottom: 0, paddingBottom: 0, borderBottom: "none"}}>Descuentos y deducciones</div>
              <button className="btn btn-secondary btn-sm" onClick={addDiscount}>{I.plus} Agregar descuento</button>
            </div>
            {discounts.length === 0 ? (
              <div style={{padding: "16px 12px", background: "#f8fafc", borderRadius: 8, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)"}}>
                Sin descuentos. Haz clic en "Agregar descuento" para registrar uno.
              </div>
            ) : (
              <div>{discounts.map(d => (
                <div key={d.id} style={{display: "grid", gridTemplateColumns: "1fr 140px 100px auto", gap: 8, marginBottom: 6, alignItems: "end"}}>
                  <div className="form-group" style={{marginBottom: 0}}>
                    <label className="form-label">Concepto</label>
                    <select className="form-select" value={d.type} onChange={e => updDiscount(d.id, "type", e.target.value)} style={{fontSize: 11.5, padding: "6px 26px 6px 8px"}}>
                      {DISCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{marginBottom: 0}}>
                    <label className="form-label">Descripción</label>
                    <input className="form-input" placeholder="Detalle..." value={d.concept} onChange={e => updDiscount(d.id, "concept", e.target.value)} style={{fontSize: 11.5, padding: "6px 8px"}} />
                  </div>
                  <div className="form-group" style={{marginBottom: 0}}>
                    <label className="form-label">Monto</label>
                    <input type="number" step="0.01" min={0} className="form-input" value={d.amount} onChange={e => updDiscount(d.id, "amount", parseFloat(e.target.value) || 0)} style={{fontSize: 11.5, padding: "6px 8px", fontFamily: "var(--font-mono)"}} />
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeDiscount(d.id)} style={{color: "var(--danger)", marginBottom: 1}}>{I.x}</button>
                </div>
              ))}</div>
            )}
          </div>

          {/* Totals summary */}
          <div style={{background: "#f8fafc", borderRadius: 8, padding: "12px 16px"}}>
            <div style={{display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12.5}}>
              <span>Subtotal facturado:</span>
              <span style={{fontFamily: "var(--font-mono)", fontWeight: 600}}>{fmtCurrency(subtotal)}</span>
            </div>
            {totalDiscounts > 0 && (
              <div style={{display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12.5, color: "var(--danger)"}}>
                <span>Descuentos ({discounts.filter(d => d.amount > 0).length}):</span>
                <span style={{fontFamily: "var(--font-mono)", fontWeight: 600}}>-{fmtCurrency(totalDiscounts)}</span>
              </div>
            )}
            <div style={{display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: 14, fontWeight: 700}}>
              <span>Total factura:</span>
              <span style={{fontFamily: "var(--font-mono)"}}>{fmtCurrency(invoiceTotal)}</span>
            </div>
            {Math.abs(invoiceTotal - order.total) > 1 && (
              <div style={{marginTop: 6, fontSize: 11, color: "var(--danger)", display: "flex", alignItems: "center", gap: 4}}>
                ⚠️ Diferencia con pedido original: {fmtCurrency(Math.abs(invoiceTotal - order.total))}
              </div>
            )}
          </div>

          <div className="form-group" style={{marginTop: 12}}>
            <label className="form-label">Notas de facturación</label>
            <textarea className="form-textarea" placeholder="Observaciones..." value={form.notes} onChange={e => u("notes", e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {I.receipt} {existing.invoiceNumber ? "Actualizar factura" : "Registrar factura"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// DUPLICATES VIEW
// ==========================================
function DuplicatesView({orders,onUpdate,setToast}){
  const duplicates=useMemo(()=>{
    const numMap={};
    orders.forEach(o=>{if(!numMap[o.orderNumber])numMap[o.orderNumber]=[];numMap[o.orderNumber].push(o)});
    return Object.entries(numMap).filter(([_,arr])=>arr.length>1).map(([num,arr])=>({orderNumber:num,orders:arr}));
  },[orders]);

  const markNotDuplicate=(order)=>{
    const updated={...order,status:order.status==="DUPLICATE"?"PENDING_REVIEW":order.status,duplicateOf:null,validations:order.validations.filter(v=>!v.message.includes("Posible duplicado")),history:[...order.history,{date:new Date().toISOString(),action:"Marcado como NO duplicado",user:"",icon:"✅"}]};
    onUpdate(updated);setToast("Marcado como no duplicado");
  };

  const archiveDuplicate=(order)=>{
    const updated={...order,status:"ARCHIVED",history:[...order.history,{date:new Date().toISOString(),action:"Archivado como duplicado",user:"",icon:"📦"}]};
    onUpdate(updated);setToast("Duplicado archivado");
  };

  return(<div>
    <div className="page-header"><h1>Detección de Duplicados</h1><p>Pedidos con el mismo número de orden detectados automáticamente</p></div>
    <div className="stats-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
      <div className="stat-card"><div className="stat-label">Grupos duplicados</div><div className="stat-value" style={{color:"var(--orange)"}}>{duplicates.length}</div></div>
      <div className="stat-card"><div className="stat-label">Pedidos afectados</div><div className="stat-value">{duplicates.reduce((s,d)=>s+d.orders.length,0)}</div></div>
      <div className="stat-card"><div className="stat-label">Pedidos marcados</div><div className="stat-value">{orders.filter(o=>o.status==="DUPLICATE").length}</div></div>
    </div>

    {duplicates.length===0?<div className="card" style={{padding:20}}><div className="empty-state"><div className="empty-state-icon">✅</div><h3>Sin duplicados detectados</h3><p>Todos los números de pedido son únicos</p></div></div>:
    <div>{duplicates.map(({orderNumber,orders:dups})=>(
      <div key={orderNumber} className="card" style={{padding:16,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:18}}>⚠️</span>
          <div><div style={{fontWeight:700,fontSize:14}}>Pedido #{orderNumber}</div><div style={{fontSize:12,color:"var(--text-tertiary)"}}>{dups.length} registros con el mismo número</div></div>
        </div>
        {dups.map(o=>(
          <div key={o.id} className="dup-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{fontWeight:600}}>{o.id}</span><StatusBadge status={o.status}/>
                </div>
                <div style={{fontSize:12,color:"var(--text-secondary)"}}>
                  {o.chain} · {o.destination} · {fmt(o.emissionDate)} · {fmtCurrency(o.total)} · Archivo: {o.fileName}
                </div>
                <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:2}}>Cargado: {fmt(o.uploadDate)} por {o.uploadedBy}</div>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button className="btn btn-success btn-sm" onClick={()=>markNotDuplicate(o)}>No es duplicado</button>
                <button className="btn btn-danger btn-sm" onClick={()=>archiveDuplicate(o)}>Archivar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    ))}</div>}
  </div>);
}

// ==========================================
// BACKUP VIEW
// ==========================================
function BackupView({setToast}){
  const [backups]=useState(BACKUPS);
  const [config]=useState({frequency:"Diario",time:"02:00 AM",retention:"30 días",storage:"AWS S3 (us-east-1)",encryption:"AES-256",compression:"GZIP",lastSuccess:BACKUPS.find(b=>b.status==="completed")?.date});

  return(<div>
    <div className="page-header"><h1>Backup y Recuperación</h1><p>Respaldos automáticos y restauración de datos</p></div>
    <div className="stats-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
      <div className="stat-card"><div className="stat-label">Último backup exitoso</div><div className="stat-value" style={{fontSize:14}}>{fmt(config.lastSuccess)}</div><div className="stat-sub"><span className="stat-dot" style={{background:"var(--success)"}}/>Hace {Math.max(0,daysUntil(config.lastSuccess?.split("T")[0])*-1)} días</div></div>
      <div className="stat-card"><div className="stat-label">Frecuencia</div><div className="stat-value" style={{fontSize:18}}>{config.frequency}</div><div className="stat-sub">{config.time}</div></div>
      <div className="stat-card"><div className="stat-label">Retención</div><div className="stat-value" style={{fontSize:18}}>{config.retention}</div></div>
      <div className="stat-card"><div className="stat-label">Almacenamiento</div><div className="stat-value" style={{fontSize:14}}>{config.storage}</div><div className="stat-sub">{config.encryption}</div></div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
      <div className="card" style={{padding:16}}>
        <div className="detail-section-title">Configuración de respaldos</div>
        {[["Frecuencia",config.frequency],["Hora programada",config.time],["Retención",config.retention],["Almacenamiento",config.storage],["Encriptación",config.encryption],["Compresión",config.compression]].map(([k,v])=>
          <div key={k} className="detail-field"><span className="detail-field-label">{k}</span><span className="detail-field-value">{v}</span></div>
        )}
        <div style={{marginTop:12,display:"flex",gap:6}}>
          <button className="btn btn-primary btn-sm" onClick={()=>setToast("Backup manual iniciado — estimado 3 minutos")}>{I.database} Backup manual ahora</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setToast("Configuración en producción")}>{I.settings} Editar config</button>
        </div>
      </div>
      <div className="card" style={{padding:16}}>
        <div className="detail-section-title">Qué se respalda</div>
        {[["Base de datos completa","PostgreSQL — todos los pedidos, líneas, documentos, historial, usuarios"],["Archivos y documentos","PDFs, Excel, imágenes originales subidos al sistema"],["Configuración","Templates por cadena, catálogos, reglas de validación"],["Audit log","Bitácora completa de cambios y acciones"]].map(([t,d],i)=>
          <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10}}>
            <span style={{color:"var(--success)",marginTop:2}}>{I.check}</span>
            <div><div style={{fontWeight:600,fontSize:12.5}}>{t}</div><div style={{fontSize:11,color:"var(--text-tertiary)"}}>{d}</div></div>
          </div>
        )}
      </div>
    </div>

    <div className="card" style={{overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontWeight:700,fontSize:13}}>Historial de respaldos</span>
      </div>
      <table><thead><tr><th>ID</th><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Tamaño</th><th>Registros</th><th>Duración</th><th>Acciones</th></tr></thead>
        <tbody>{backups.map(b=><tr key={b.id}>
          <td style={{fontFamily:"var(--font-mono)",fontSize:11,fontWeight:500}}>{b.id}</td>
          <td>{new Date(b.date).toLocaleString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
          <td><span className="format-tag">{b.type}</span></td>
          <td><span className={`backup-status ${b.status==="completed"?"backup-ok":"backup-fail"}`}>{b.status==="completed"?"Exitoso":"Fallido"}</span></td>
          <td style={{fontFamily:"var(--font-mono)",fontSize:12}}>{b.size}</td>
          <td style={{fontFamily:"var(--font-mono)",fontSize:12}}>{b.records>0?b.records.toLocaleString():"—"}</td>
          <td style={{fontSize:12,color:"var(--text-tertiary)"}}>{b.duration}</td>
          <td>
            <div style={{display:"flex",gap:4}}>
              {b.status==="completed"&&<button className="btn btn-secondary btn-sm" onClick={()=>setToast("Descargando backup...")}>{I.download}</button>}
              {b.status==="completed"&&<button className="btn btn-warning btn-sm" onClick={()=>setToast("Restauración requiere confirmación de admin")}>Restaurar</button>}
              {b.status==="failed"&&<button className="btn btn-danger btn-sm" onClick={()=>setToast("Reintentando backup...")} >Reintentar</button>}
            </div>
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>);
}

// ==========================================
// SIMPLE VIEWS (Dashboard, Upload, Alerts, Deliveries, Detail)
// ==========================================
function DashboardView({orders,onSelectOrder}){
  const [chainF,setChainF]=useState("");const [statusF,setStatusF]=useState("");const [search,setSearch]=useState("");
  const [sortF,setSortF]=useState("deliveryDate");const [sortD,setSortD]=useState("asc");
  const chains=[...new Set(orders.map(o=>o.chain))].sort();
  const filtered=useMemo(()=>{let r=[...orders];if(chainF)r=r.filter(o=>o.chain===chainF);if(statusF)r=r.filter(o=>o.status===statusF);
    if(search){const q=search.toLowerCase();r=r.filter(o=>o.orderNumber.toLowerCase().includes(q)||o.chain.toLowerCase().includes(q)||o.destination.toLowerCase().includes(q)||o.lines.some(l=>l.sku.toLowerCase().includes(q)));}
    r.sort((a,b)=>{let av=a[sortF]||"",bv=b[sortF]||"";if(typeof av==="string")av=av.toLowerCase();if(typeof bv==="string")bv=bv.toLowerCase();return sortD==="asc"?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0)});return r},[orders,chainF,statusF,search,sortF,sortD]);
  const handleSort=f=>{if(sortF===f)setSortD(d=>d==="asc"?"desc":"asc");else{setSortF(f);setSortD("asc")}};
  const stats=useMemo(()=>({total:orders.length,pending:orders.filter(o=>o.status==="PENDING_REVIEW").length,delivered:orders.filter(o=>["DELIVERED","PARTIAL_DELIVERY","INVOICED","RECONCILED"].includes(o.status)).length,errors:orders.filter(o=>o.status==="ERROR"||o.status==="DUPLICATE").length}),[orders]);
  const S=({field})=><span style={{marginLeft:3,opacity:sortF===field?1:.3,fontSize:9}}>{sortF===field&&sortD==="desc"?"▼":"▲"}</span>;
  return(<div><div className="page-header"><h1>Pedidos</h1><p>Gestión centralizada</p></div>
    <div className="stats-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
      <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{stats.total}</div></div>
      <div className="stat-card"><div className="stat-label">Pendientes</div><div className="stat-value" style={{color:"var(--orange)"}}>{stats.pending}</div></div>
      <div className="stat-card"><div className="stat-label">Entregados</div><div className="stat-value" style={{color:"var(--success)"}}>{stats.delivered}</div></div>
      <div className="stat-card"><div className="stat-label">Errores/Dup</div><div className="stat-value" style={{color:"var(--danger)"}}>{stats.errors}</div></div>
    </div>
    <div className="card" style={{overflow:"hidden"}}>
      <div style={{padding:"10px 12px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{display:"flex",alignItems:"center",gap:4,color:"var(--text-tertiary)",fontSize:11,fontWeight:600}}>{I.filter}</span>
        <select className={`filter-select ${chainF?"active-filter":""}`} value={chainF} onChange={e=>setChainF(e.target.value)}><option value="">Cadena</option>{chains.map(c=><option key={c}>{c}</option>)}</select>
        <select className={`filter-select ${statusF?"active-filter":""}`} value={statusF} onChange={e=>setStatusF(e.target.value)}><option value="">Estatus</option>{Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <div className="topbar-search" style={{maxWidth:180,height:30}}>{I.search}<input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        {(chainF||statusF||search)&&<button className="btn btn-ghost btn-sm" onClick={()=>{setChainF("");setStatusF("");setSearch("")}}>Limpiar</button>}
        <span style={{marginLeft:"auto",fontSize:10.5,color:"var(--text-tertiary)"}}>{filtered.length}</span>
      </div>
      <table><thead><tr><th onClick={()=>handleSort("orderNumber")}>Pedido<S field="orderNumber"/></th><th onClick={()=>handleSort("chain")}>Cadena<S field="chain"/></th><th onClick={()=>handleSort("status")}>Estatus<S field="status"/></th><th onClick={()=>handleSort("destination")}>Destino<S field="destination"/></th><th onClick={()=>handleSort("deliveryDate")}>Entrega<S field="deliveryDate"/></th><th onClick={()=>handleSort("total")}>Total<S field="total"/></th><th>Confianza</th></tr></thead>
        <tbody>{filtered.length===0?<tr><td colSpan={7}><div className="empty-state"><h3>Sin resultados</h3></div></td></tr>:
          filtered.map(o=><tr key={o.id} className="clickable" onClick={()=>onSelectOrder(o)}>
            <td><div style={{fontWeight:600,fontSize:12.5}}>{o.orderNumber}</div><div style={{fontSize:10.5,color:"var(--text-tertiary)"}}>{o.id}</div></td>
            <td style={{fontWeight:500}}>{o.chain}</td><td><StatusBadge status={o.status}/></td>
            <td><div style={{fontSize:12.5}}>{o.destination}</div><div style={{fontSize:10.5,color:"var(--text-tertiary)"}}>{o.cedis}</div></td>
            <td style={{fontSize:12.5}}>{fmt(o.deliveryDate)}</td>
            <td style={{fontWeight:600,fontFamily:"var(--font-mono)",fontSize:12.5}}>{fmtCurrency(o.total)}</td>
            <td><ConfidenceIndicator value={o.confidence}/></td>
          </tr>)}</tbody></table>
    </div>
  </div>);
}

function DeliveriesView({orders,onSelectOrder,onSchedule,onConfirm,onTransit}){
  const [tab,setTab]=useState("all");
  const filtered=useMemo(()=>{let l=orders.filter(o=>["VALIDATED","SCHEDULED","IN_TRANSIT","DELIVERED","PARTIAL_DELIVERY","REJECTED","INVOICED","RECONCILED"].includes(o.status));
    if(tab==="pending")l=l.filter(o=>o.status==="VALIDATED"&&!o.delivery?.appointmentDate);if(tab==="scheduled")l=l.filter(o=>["SCHEDULED"].includes(o.delivery?.status));
    if(tab==="transit")l=l.filter(o=>o.delivery?.status==="IN_TRANSIT");if(tab==="delivered")l=l.filter(o=>["DELIVERED","PARTIAL"].includes(o.delivery?.status));
    return l.sort((a,b)=>(a.delivery?.appointmentDate||a.deliveryDate||"").localeCompare(b.delivery?.appointmentDate||b.deliveryDate||""))},[orders,tab]);
  return(<div><div className="page-header"><h1>Entregas</h1><p>Programa, rastrea y confirma</p></div>
    <div className="tabs">{[["all","Todos"],["pending","Sin cita"],["scheduled","Programadas"],["transit","En tránsito"],["delivered","Entregados"]].map(([k,l])=>
      <div key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{l}</div>)}</div>
    <div className="card" style={{overflow:"hidden"}}><table><thead><tr><th>Pedido</th><th>Cadena</th><th>Destino</th><th>Entrega</th><th>Cita</th><th>Transportista</th><th>Acciones</th></tr></thead>
      <tbody>{filtered.length===0?<tr><td colSpan={7}><div className="empty-state"><h3>Sin entregas</h3></div></td></tr>:
        filtered.map(o=><tr key={o.id} className="clickable">
          <td onClick={()=>onSelectOrder(o)}><div style={{fontWeight:600,fontSize:12.5}}>{o.orderNumber}</div></td>
          <td onClick={()=>onSelectOrder(o)}>{o.chain}</td><td onClick={()=>onSelectOrder(o)}>{o.destination}</td>
          <td onClick={()=>onSelectOrder(o)}><DeliveryBadge status={o.delivery?.status||"PENDING"}/></td>
          <td onClick={()=>onSelectOrder(o)}>{o.delivery?.appointmentDate?<span>{fmt(o.delivery.appointmentDate)} {o.delivery.appointmentTime}</span>:"—"}</td>
          <td onClick={()=>onSelectOrder(o)}>{o.delivery?.carrier||"—"}</td>
          <td><div style={{display:"flex",gap:3}}>
            {(!o.delivery?.appointmentDate||o.delivery?.status==="REJECTED")&&<button className="btn btn-purple btn-sm" onClick={e=>{e.stopPropagation();onSchedule(o)}}>Cita</button>}
            {o.delivery?.status==="SCHEDULED"&&<button className="btn btn-warning btn-sm" onClick={e=>{e.stopPropagation();onTransit(o)}}>Tránsito</button>}
            {(o.delivery?.status==="SCHEDULED"||o.delivery?.status==="IN_TRANSIT")&&<button className="btn btn-success btn-sm" onClick={e=>{e.stopPropagation();onConfirm(o)}}>Entrega</button>}
          </div></td>
        </tr>)}</tbody></table></div>
  </div>);
}

function UploadView({onProcess}){
  const [files,setFiles]=useState([]);const ref=useRef();
  const addFiles = (fileList) => {
    Array.from(fileList).forEach(f => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFiles(prev => [...prev, { name: f.name, size: f.size, type: f.type, dataUrl: e.target.result, raw: f }]);
      };
      reader.readAsDataURL(f);
    });
  };
  return (
    <div>
      <div className="page-header"><h1>Cargar Pedidos</h1><p>Sube documentos en cualquier formato — el sistema los procesará automáticamente</p></div>
      <div className="card" style={{padding:24,marginBottom:20}}>
        <div className="upload-zone" onClick={()=>ref.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files)}}>
          <div style={{transform:"scale(1.8)",marginBottom:16,color:"var(--text-tertiary)"}}>{I.upload}</div>
          <h3 style={{fontSize:15,fontWeight:600,marginBottom:4}}>Arrastra archivos aquí o haz clic para seleccionar</h3>
          <p style={{fontSize:13,color:"var(--text-tertiary)"}}>Sube uno o varios pedidos al mismo tiempo</p>
          <div style={{marginTop:12,display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>{["PDF","XLSX","XLS","CSV","XML","PNG","JPG"].map(f=>(
            <span key={f} className="format-tag">{f}</span>
          ))}</div>
          <input ref={ref} type="file" multiple hidden accept=".pdf,.xlsx,.xls,.csv,.xml,.png,.jpg,.jpeg" onChange={e=>addFiles(e.target.files)}/>
        </div>
      </div>
      {files.length>0&&(
        <div className="card" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <h3 style={{fontSize:14,fontWeight:700}}>{files.length} archivo{files.length!==1?"s":""} listo{files.length!==1?"s":""}</h3>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-secondary btn-sm" onClick={()=>setFiles([])}>Limpiar</button>
              <button className="btn btn-primary btn-sm" onClick={()=>onProcess(files)}>{I.upload} Procesar archivos</button>
            </div>
          </div>
          {files.map((f,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:"1px solid var(--border-light)",borderRadius:"var(--radius)",marginBottom:6}}>
              <span style={{color:"var(--accent)"}}>{I.file}</span>
              <span style={{fontWeight:500,flex:1}}>{f.name}</span>
              <span style={{fontSize:11,color:"var(--text-tertiary)"}}>{(f.size/1024).toFixed(1)} KB</span>
              <span className="format-tag">{f.name.split(".").pop().toUpperCase()}</span>
              <button className="btn btn-ghost btn-sm" title="Descargar" onClick={()=>downloadFile(f)}>{I.download}</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{color:"var(--danger)"}}>{I.x}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertsView({orders,onSelectOrder}){
  const alerts=useMemo(()=>{const l=[];orders.forEach(o=>{const d=daysUntil(o.deliveryDate);
    if(d>=0&&d<=2)l.push({o,type:"error",msg:`Entrega en ${d}d: ${o.orderNumber} — ${o.chain}`});
    if(o.status==="PENDING_REVIEW")l.push({o,type:"warning",msg:`Pendiente: ${o.orderNumber}`});
    if(o.status==="ERROR")l.push({o,type:"error",msg:`Error: ${o.orderNumber}`});
    if(o.status==="DUPLICATE")l.push({o,type:"warning",msg:`Duplicado: ${o.orderNumber}`});
    if(o.delivery?.status==="REJECTED")l.push({o,type:"error",msg:`Rechazado: ${o.orderNumber}`});
  });l.sort((a,b)=>({error:0,warning:1,info:2})[a.type]-({error:0,warning:1,info:2})[b.type]);return l},[orders]);
  return(<div><div className="page-header"><h1>Alertas</h1><p>{alerts.length} activas</p></div>
    <div className="card" style={{padding:16}}>{alerts.length===0?<div className="empty-state"><h3>Sin alertas</h3></div>:
      alerts.map((a,i)=><div key={i} className={`validation-item ${a.type}`} style={{cursor:"pointer"}} onClick={()=>onSelectOrder(a.o)}>{a.type==="error"?"🔴":"🟡"}<span style={{flex:1}}>{a.msg}</span><span style={{fontSize:10,opacity:.5}}>Ver →</span></div>)}</div>
  </div>);
}

function OrderDetailView({order,onBack,onUpdate,onToast,onSchedule,onConfirm,onTransit,onUploadInvoice}){
  const [tab,setTab]=useState("general");const [ef,setEf]=useState(null);const [ev,setEv]=useState("");
  const startEdit=(f,v)=>{setEf(f);setEv(v||"")};const saveEdit=f=>{if(ev!==order[f]){const u={...order,[f]:ev,history:[...order.history,{date:new Date().toISOString(),action:`"${f}" editado`,user:"",icon:"✏️"}]};onUpdate(u);onToast(`Actualizado: ${f}`)};setEf(null)};
  const validate=()=>{const u={...order,status:"VALIDATED",reviewed:true,history:[...order.history,{date:new Date().toISOString(),action:"Validado",user:"",icon:"✅"}]};onUpdate(u);onToast("Validado")};
  const FV=({field,value})=>{
    if(ef===field) return (
      <div className="inline-edit" style={{display:"flex",alignItems:"center",gap:3}}>
        <input value={ev} onChange={e=>setEv(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEdit(field)} autoFocus style={{fontFamily:"var(--font)",fontSize:12.5,padding:"3px 6px",border:"1px solid var(--accent)",borderRadius:4,outline:"none",minWidth:80}}/>
        <button onClick={()=>saveEdit(field)} style={{background:"var(--success)",color:"#fff",border:"none",borderRadius:3,width:20,height:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.check}</button>
        <button onClick={()=>setEf(null)} style={{background:"#f1f5f9",border:"none",borderRadius:3,width:20,height:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.x}</button>
      </div>
    );
    return (
      <div style={{display:"flex",alignItems:"center",gap:3}}>
        <span className="detail-field-value">{value||"—"}</span>
        <button className="btn btn-ghost" style={{padding:2,opacity:.3}} onClick={()=>startEdit(field,value)}>{I.edit}</button>
      </div>
    );
  };
  const d=order.delivery||{};
  return(<div>
    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:20}}>
      <button className="detail-back" style={{padding:7,border:"1px solid var(--border)",background:"#fff",borderRadius:7,cursor:"pointer",display:"flex"}} onClick={onBack}>{I.back}</button>
      <div style={{flex:1}}><div style={{fontSize:18,fontWeight:700,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>{order.orderNumber}<StatusBadge status={order.status}/></div>
        <div style={{fontSize:12.5,color:"var(--text-tertiary)",marginTop:1}}>{order.chain} · {order.destination} · {fmt(order.emissionDate)}</div></div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button className="btn btn-secondary btn-sm">{I.download} Exportar</button>
        {order.status==="VALIDATED"&&<button className="btn btn-purple btn-sm" onClick={()=>onSchedule(order)}>Cita</button>}
        {(d.status==="SCHEDULED"||d.status==="IN_TRANSIT")&&<button className="btn btn-success btn-sm" onClick={()=>onConfirm(order)}>Confirmar</button>}
        {["DELIVERED","PARTIAL_DELIVERY"].includes(order.status)&&!order.invoice&&<button className="btn btn-cyan" onClick={()=>onUploadInvoice(order)}>{I.receipt} Factura manual</button>}
        {["DELIVERED","PARTIAL_DELIVERY"].includes(order.status)&&!order.invoice&&<button className="btn btn-primary btn-sm" onClick={()=>{const xml=CFDIDemo(order);const p=CFDIParse(xml);if(!p.error){onUpdate({...order,status:"INVOICED",invoice:{invoiceNumber:`${p.serie||""}${p.folio||""}`,invoiceDate:p.fecha?.substring(0,10),invoiceTotal:p.total,invoiceFile:`${p.serie||""}${p.folio||""}.xml`,reconciled:false,cfdiData:p,discounts:p.conceptos.filter(c=>c.descuento>0).map(c=>({type:"Desc. línea",concept:c.descripcion,amount:c.descuento})),discrepancies:[]},lines:order.lines.map(l=>{const m=p.conceptos.find(c=>c.noid===l.sku);return m?{...l,invoicedQty:m.cant,invoicedPrice:m.vu}:l}),history:[...order.history,{date:new Date().toISOString(),action:`CFDI demo registrado — UUID: ${p.timbre?.uuid?.substring(0,8)||"N/A"}`,user:"",icon:"🧾"}]});onToast("CFDI demo registrado")}}}>🧾 CFDI Demo</button>}
        {!["VALIDATED","SCHEDULED","IN_TRANSIT","DELIVERED","INVOICED","RECONCILED"].includes(order.status)&&<button className="btn btn-success btn-sm" onClick={validate}>Validar</button>}
      </div>
    </div>
    {/* Uploaded files with download */}
    {order.uploadedFiles?.length>0&&(
      <div className="card" style={{padding:16,marginBottom:16}}>
        <div className="detail-section-title">Archivos del pedido</div>
        {order.uploadedFiles.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:"1px solid var(--border-light)",borderRadius:"var(--radius)",marginBottom:6}}>
            <span style={{color:"var(--accent)"}}>{I.file}</span>
            <span style={{fontWeight:500,flex:1}}>{f.name}</span>
            <span style={{fontSize:11,color:"var(--text-tertiary)"}}>{f.size}</span>
            <span className="format-tag">{(f.type||f.name?.split(".").pop()||"").toUpperCase()}</span>
            <button className="btn btn-secondary btn-sm" onClick={()=>downloadFile(f)}>{I.download} Descargar</button>
          </div>
        ))}
      </div>
    )}
    {order.validations?.length>0&&<div style={{marginBottom:12}}>{order.validations.map((v,i)=><div key={i} className={`validation-item ${v.type}`}>{v.type==="error"?"⚠️":"⚡"} {v.message}</div>)}</div>}
    <div className="tabs">{[["general","General"],["lines",`Líneas (${order.lines.length})`],["delivery","Entrega"],["invoice","🧾 Facturación"],["history","Historial"]].map(([k,l])=>
      <div key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{l}</div>)}</div>
    {tab==="general"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div className="card" style={{padding:16}}><div className="detail-section-title">Pedido</div>
        {[["chain","Cadena"],["orderNumber","No. Pedido"],["emissionDate","Emisión"],["deliveryDate","Entrega"],["expiryDate","Vencimiento"],["currency","Moneda"],["paymentTerms","Pago"]].map(([f,l])=>
          <div key={f} className="detail-field"><span className="detail-field-label">{l}</span><FV field={f} value={order[f]}/></div>)}</div>
      <div className="card" style={{padding:16}}><div className="detail-section-title">Destino</div>
        {[["destination","Destino"],["cedis","CEDIS"],["branch","Sucursal"],["deliveryAddress","Dirección"],["buyer","Comprador"]].map(([f,l])=>
          <div key={f} className="detail-field"><span className="detail-field-label">{l}</span><FV field={f} value={order[f]}/></div>)}</div>
    </div>}
    {tab==="lines"&&<div className="card" style={{overflow:"hidden"}}><table style={{fontSize:12}}><thead><tr><th>SKU</th><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Importe</th><th>Confianza</th></tr></thead>
      <tbody>{order.lines.map(l=><tr key={l.id}><td style={{fontFamily:"var(--font-mono)",fontWeight:500,fontSize:11.5}}>{l.sku}</td><td>{l.description}</td>
        <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{l.quantity} {l.unit}</td><td style={{fontFamily:"var(--font-mono)"}}>{fmtCurrency(l.unitPrice)}</td>
        <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtCurrency(l.lineTotal)}</td><td><ConfidenceIndicator value={l.confidence}/></td></tr>)}</tbody></table></div>}
    {tab==="delivery"&&<div className="card" style={{padding:16}}>
      {d.appointmentDate?<div><div className="detail-section-title">Cita de entrega</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          {[["Fecha",fmt(d.appointmentDate)],["Horario",`${d.appointmentTime||"—"} — ${d.appointmentEndTime||""}`],["Andén",d.dockNumber||"—"],["Transportista",d.carrier||"—"],["Chofer",d.driverName||"—"],["Placas",d.vehiclePlates||"—"]].map(([k,v])=>
            <div key={k}><span className="detail-field-label">{k}</span><span className="detail-field-value">{v}</span></div>)}
        </div>
        {d.actualDeliveryDate&&<div style={{marginTop:16}}><div className="detail-section-title">{d.status==="REJECTED"?"Rechazo":"Confirmación de entrega"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            {[["Fecha real",fmt(d.actualDeliveryDate)],["Hora real",d.actualDeliveryTime||"—"],["Recibió",d.receivedBy||"—"],d.proofOfDelivery?["Comprobante",d.proofOfDelivery]:null,d.rejectionReason?["Motivo rechazo",d.rejectionReason]:null].filter(Boolean).map(([k,v])=>
              <div key={k}><span className="detail-field-label">{k}</span><span className="detail-field-value">{v}</span></div>)}
          </div></div>}
      </div>:<div className="empty-state"><div className="empty-state-icon">📅</div><h3>Sin cita</h3><button className="btn btn-primary" onClick={()=>onSchedule(order)}>Programar cita</button></div>}
    </div>}
    {tab==="invoice"&&<div>
      {order.invoice ? (
        <div className="card" style={{padding: 16}}>
          <div className="detail-section-title">Datos de la factura</div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16}}>
            <div><span className="detail-field-label">No. Factura</span><span className="detail-field-value" style={{fontWeight: 700}}>{order.invoice.invoiceNumber}</span></div>
            <div><span className="detail-field-label">Fecha</span><span className="detail-field-value">{fmt(order.invoice.invoiceDate)}</span></div>
            <div><span className="detail-field-label">Vencimiento pago</span><span className="detail-field-value">{fmt(order.invoice.paymentDueDate)}</span></div>
            <div><span className="detail-field-label">Total facturado</span><span className="detail-field-value" style={{fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15}}>{fmtCurrency(order.invoice.invoiceTotal)}</span></div>
            <div><span className="detail-field-label">Archivo</span><span className="detail-field-value" style={{color: "var(--accent)", display: "flex", alignItems: "center", gap: 4}}>{I.file} {order.invoice.invoiceFile || "—"}</span></div>
            <div><span className="detail-field-label">Estado</span>{order.invoice.reconciled ? <span className="status-badge" style={{background: "#d1fae5", color: "#059669"}}>Conciliado</span> : <span className="status-badge" style={{background: "#e0f2fe", color: "#0891b2"}}>Facturado</span>}</div>
          </div>
          {order.invoice.discounts?.length > 0 && (
            <div style={{marginBottom: 16}}>
              <div className="detail-section-title">Descuentos y deducciones</div>
              <table style={{fontSize: 12}}>
                <thead><tr><th>Tipo</th><th>Concepto</th><th>Monto</th></tr></thead>
                <tbody>{order.invoice.discounts.map((disc, i) => (
                  <tr key={i}>
                    <td><span className="format-tag">{disc.type}</span></td>
                    <td>{disc.concept || disc.type}</td>
                    <td style={{fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--danger)"}}>-{fmtCurrency(disc.amount)}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr style={{borderTop: "2px solid var(--border)"}}>
                  <td colSpan={2} style={{textAlign: "right", fontWeight: 700}}>Total descuentos:</td>
                  <td style={{fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--danger)"}}>-{fmtCurrency(order.invoice.discounts.reduce((s, d) => s + (d.amount || 0), 0))}</td>
                </tr></tfoot>
              </table>
            </div>
          )}
          {order.invoice.discrepancies?.length > 0 && (
            <div>{order.invoice.discrepancies.map((disc, i) => (
              <div key={i} className="validation-item warning">{disc.reason}: {fmtCurrency(disc.difference)}</div>
            ))}</div>
          )}
          <div style={{marginTop: 12, display: "flex", gap: 6}}>
            <button className="btn btn-secondary btn-sm" onClick={() => onUploadInvoice(order)}>{I.edit} Editar factura</button>
          </div>
          {/* CFDI Data from SAT */}
          {order.invoice.cfdiData && (
            <div style={{marginTop: 20}}>
              <div className="detail-section-title">Datos del CFDI (SAT)</div>
              {order.invoice.cfdiData.timbre?.uuid && (
                <div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"4px 12px",borderRadius:20,background:"#d1fae5",color:"#059669",marginBottom:12}}>
                  ✓ Timbrado — UUID: <span style={{fontFamily:"var(--font-mono)"}}>{order.invoice.cfdiData.timbre.uuid}</span>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                {[
                  ["Emisor",`${order.invoice.cfdiData.emisor?.nombre||"—"} (${order.invoice.cfdiData.emisor?.rfc||"—"})`],
                  ["Receptor",`${order.invoice.cfdiData.receptor?.nombre||"—"} (${order.invoice.cfdiData.receptor?.rfc||"—"})`],
                  ["Tipo",order.invoice.cfdiData.tipoL||"—"],
                  ["Forma de pago",order.invoice.cfdiData.formaPagoL||"—"],
                  ["Método de pago",order.invoice.cfdiData.metodoPagoL||"—"],
                  ["Moneda",order.invoice.cfdiData.moneda||"MXN"],
                ].map(([k,v])=>(
                  <div key={k}><span className="detail-field-label">{k}</span><span className="detail-field-value">{v}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{padding: 20}}>
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <h3>Sin factura registrada</h3>
            <p style={{marginBottom: 14}}>Sube la factura para iniciar la conciliación</p>
            <button className="btn btn-primary" onClick={() => onUploadInvoice(order)}>{I.upload} Subir factura</button>
          </div>
        </div>
      )}
    </div>}
    {tab==="history"&&<div className="card" style={{padding:16}}><div className="timeline">{[...order.history].reverse().map((h,i)=>
      <div key={i} className="timeline-item"><div className="timeline-dot">{h.icon||"📝"}</div><div><div className="timeline-action">{h.action}</div><div className="timeline-meta">{new Date(h.date).toLocaleString("es-MX")} · {h.user}</div></div></div>)}</div></div>}
  </div>);
}

// ==========================================
// SCHEDULE & CONFIRM MODALS
// ==========================================
function ScheduleModal({order,onSave,onClose}){
  const d=order.delivery||{};
  const [form,setForm]=useState({appointmentDate:d.appointmentDate||order.deliveryDate||"",appointmentTime:d.appointmentTime||"09:00",appointmentEndTime:d.appointmentEndTime||"11:00",carrier:d.carrier||"",driverName:d.driverName||"",driverPhone:d.driverPhone||"",vehiclePlates:d.vehiclePlates||"",dockNumber:d.dockNumber||""});
  const u=(k,v)=>setForm({...form,[k]:v});const isR=d.status&&d.status!=="PENDING";
  return(<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
    <div className="modal-header"><h3>📅 {isR?"Reprogramar":"Programar"} cita</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>{I.x}</button></div>
    <div className="modal-body">
      <div className="form-row"><div className="form-group"><label className="form-label">Fecha *</label><input type="date" className="form-input" value={form.appointmentDate} onChange={e=>u("appointmentDate",e.target.value)}/></div>
        <div className="form-row" style={{gap:6}}><div className="form-group"><label className="form-label">Inicio *</label><select className="form-select" value={form.appointmentTime} onChange={e=>u("appointmentTime",e.target.value)}>{TIME_SLOTS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Fin</label><select className="form-select" value={form.appointmentEndTime} onChange={e=>u("appointmentEndTime",e.target.value)}>{TIME_SLOTS.map(t=><option key={t}>{t}</option>)}</select></div></div></div>
      <div className="form-row"><div className="form-group"><label className="form-label">Transportista</label><select className="form-select" value={form.carrier} onChange={e=>u("carrier",e.target.value)}><option value="">Seleccionar...</option>{CARRIERS_NAMES.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Andén</label><input className="form-input" value={form.dockNumber} onChange={e=>u("dockNumber",e.target.value)}/></div></div>
      <div className="form-row"><div className="form-group"><label className="form-label">Chofer</label><input className="form-input" value={form.driverName} onChange={e=>u("driverName",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Placas</label><input className="form-input" value={form.vehiclePlates} onChange={e=>u("vehiclePlates",e.target.value)}/></div></div>
    </div>
    <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={()=>{if(!form.appointmentDate)return;onSave({...form,status:"SCHEDULED"},isR);onClose()}}>{isR?"Reprogramar":"Confirmar cita"}</button></div>
  </div></div>);
}

function ConfirmDeliveryModal({order,onSave,onClose}){
  const [form,setForm]=useState({type:"full",actualDeliveryDate:today(),actualDeliveryTime:nowTime(),receivedBy:"",proofOfDelivery:"",rejectionReason:""});
  const [lineQtys]=useState(order.lines.map(l=>({id:l.id,deliveredQty:l.quantity})));
  const u=(k,v)=>setForm({...form,[k]:v});
  const colors={full:"var(--success)",partial:"var(--orange)",rejected:"var(--danger)"};
  return(<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:540}}>
    <div className="modal-header"><h3>📦 Confirmar entrega</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>{I.x}</button></div>
    <div className="modal-body">
      <div className="form-group"><label className="form-label">Resultado *</label><div style={{display:"flex",gap:6}}>
        {[["full","✅ Completa"],["partial","⚠️ Parcial"],["rejected","❌ Rechazado"]].map(([v,l])=>
          <button key={v} className={`btn btn-sm ${form.type===v?"":"btn-secondary"}`} style={form.type===v?{background:colors[v],color:"#fff",border:"none"}:{}} onClick={()=>u("type",v)}>{l}</button>)}
      </div></div>
      {form.type!=="rejected"&&<><div className="form-row"><div className="form-group"><label className="form-label">Fecha real *</label><input type="date" className="form-input" value={form.actualDeliveryDate} onChange={e=>u("actualDeliveryDate",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Hora</label><input type="time" className="form-input" value={form.actualDeliveryTime} onChange={e=>u("actualDeliveryTime",e.target.value)}/></div></div>
        <div className="form-row"><div className="form-group"><label className="form-label">Recibió *</label><input className="form-input" value={form.receivedBy} onChange={e=>u("receivedBy",e.target.value)}/></div>
          <div className="form-group"><label className="form-label">Comprobante</label><input className="form-input" value={form.proofOfDelivery} onChange={e=>u("proofOfDelivery",e.target.value)}/></div></div></>}
      {form.type==="rejected"&&<div className="form-group"><label className="form-label">Motivo *</label><select className="form-select" value={form.rejectionReason} onChange={e=>u("rejectionReason",e.target.value)}><option value="">Seleccionar...</option>{REJECTION_REASONS.map(r=><option key={r}>{r}</option>)}</select></div>}
    </div>
    <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
      <button className="btn" style={{background:colors[form.type],color:"#fff",border:"none"}} onClick={()=>{onSave(form,lineQtys);onClose()}}>Confirmar</button></div>
  </div></div>);
}

function ProcessingModal({files,onComplete}){
  const [progress,setProgress]=useState(0);const [step,setStep]=useState(0);
  const steps=["Leyendo...","Identificando cadena...","Extrayendo...","Validando...","Detectando duplicados...","Normalizando..."];
  useEffect(()=>{let s=0;const iv=setInterval(()=>{s++;setStep(s);setProgress((s/steps.length)*100);if(s>=steps.length){clearInterval(iv);setTimeout(onComplete,400)}},600);return()=>clearInterval(iv)},[]);
  return(<div className="modal-overlay"><div className="modal" style={{padding:28,textAlign:"center",maxWidth:400}}>
    <h3 style={{fontSize:16,fontWeight:700,marginBottom:6}}>Procesando</h3><p style={{fontSize:12.5,color:"var(--text-secondary)",marginBottom:16}}>{files?.length||1} documento(s)</p>
    <div className="progress-bar" style={{marginBottom:12}}><div className="progress-fill" style={{width:`${progress}%`}}/></div>
    <div style={{textAlign:"left"}}>{steps.map((s,i)=><div key={i} className={`processing-step ${i<step?"done":i===step?"active":""}`}>
      <span style={{width:16,height:16,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,flexShrink:0,...(i<step?{background:"var(--success)",color:"#fff"}:i===step?{border:"2px solid var(--accent)",background:"var(--accent-light)"}:{border:"2px solid #e2e8f0"})}}>{i<step?"✓":i===step?<div className="spinner"/>:""}</span>{s}
    </div>)}</div>
  </div></div>);
}

// ============================================================
// MAIN APP
// ============================================================
export default function App(){
  const [view,setView]=useState("dashboard");
  const [orders,setOrders]=useState([]);
  const [selected,setSelected]=useState(null);
  const [processing,setProcessing]=useState(false);const [procFiles,setProcFiles]=useState(null);
  const [toast,setToast]=useState(null);
  const [scheduleM,setScheduleM]=useState(null);const [confirmM,setConfirmM]=useState(null);
  const [invoiceM,setInvoiceM]=useState(null);
  const [cfdiModal,setCfdiModal]=useState(null); // "upload" | "result" | null
  const [cfdiOrder,setCfdiOrder]=useState(null);
  const [cfdiData,setCfdiData]=useState(null);

  const handleCFDIRegister=()=>{
    if(!cfdiOrder||!cfdiData)return;
    const order=cfdiOrder;const cfdi=cfdiData;
    const totalDesc=cfdi.descuento+cfdi.descLineas;
    const discounts=[];
    if(cfdi.descuento>0)discounts.push({type:"Descuento global CFDI",concept:"Comprobante",amount:cfdi.descuento});
    cfdi.conceptos.forEach(c=>{if(c.descuento>0)discounts.push({type:"Descuento línea",concept:`${c.descripcion} (${c.noid})`,amount:c.descuento})});
    const diff=Math.abs(cfdi.total-order.total);
    const invoice={invoiceNumber:`${cfdi.serie||""}${cfdi.folio||""}`||`CFDI-${Date.now()}`,invoiceDate:cfdi.fecha?.substring(0,10)||today(),invoiceTotal:cfdi.total,invoiceFile:`${cfdi.serie||"CFDI"}${cfdi.folio||""}.xml`,reconciled:false,cfdiData:cfdi,discounts,discrepancies:diff>1?[{reason:totalDesc>0?`Descuentos + IVA`:"Incluye IVA",difference:+(cfdi.total-order.total).toFixed(2)}]:[]};
    const updatedLines=order.lines.map(l=>{const m=cfdi.conceptos.find(c=>c.noid===l.sku||c.descripcion?.includes(l.description?.split(" ")[0]));return m?{...l,invoicedQty:m.cant,invoicedPrice:m.vu}:l});
    updateOrder({...order,status:"INVOICED",invoice,lines:updatedLines,history:[...order.history,{date:new Date().toISOString(),action:`CFDI ${invoice.invoiceNumber} registrado — UUID: ${cfdi.timbre?.uuid?.substring(0,8)||"N/A"}...`,user:"",icon:"🧾"}]});
    setCfdiModal(null);setCfdiOrder(null);setCfdiData(null);
    setToast(`CFDI ${invoice.invoiceNumber} registrado con ${cfdi.conceptos.length} conceptos`);
    setView("cfdi");
  };

  const updateOrder=u=>{setOrders(p=>p.map(o=>o.id===u.id?u:o));if(selected?.id===u.id)setSelected(u)};
  const handleScheduleSave=(data,isR)=>{const o=scheduleM;updateOrder({...o,status:"SCHEDULED",delivery:{...o.delivery,...data},history:[...o.history,{date:new Date().toISOString(),action:isR?`Reprogramada: ${data.appointmentDate}`:`Cita: ${data.appointmentDate} ${data.appointmentTime}`,user:"",icon:"📅"}]});setToast(isR?"Reprogramada":"Cita programada")};
  const handleTransit=o=>{updateOrder({...o,status:"IN_TRANSIT",delivery:{...o.delivery,status:"IN_TRANSIT"},history:[...o.history,{date:new Date().toISOString(),action:"En tránsito",user:"",icon:"🚚"}]});setToast("En tránsito")};
  const handleConfirmSave=(form,lineQtys)=>{const o=confirmM;let ns,ds,txt;
    if(form.type==="full"){ns="DELIVERED";ds="DELIVERED";txt=`Entrega completa — ${form.receivedBy}`}else if(form.type==="partial"){ns="PARTIAL_DELIVERY";ds="PARTIAL";txt=`Entrega parcial — ${form.receivedBy}`}else{ns="REJECTED";ds="REJECTED";txt=`Rechazado: ${form.rejectionReason}`}
    updateOrder({...o,status:ns,delivery:{...o.delivery,status:ds,actualDeliveryDate:form.actualDeliveryDate,actualDeliveryTime:form.actualDeliveryTime,receivedBy:form.receivedBy,proofOfDelivery:form.proofOfDelivery,rejectionReason:form.rejectionReason},
      history:[...o.history,{date:new Date().toISOString(),action:txt,user:"",icon:form.type==="full"?"✅":form.type==="partial"?"⚠️":"❌"}]});setToast(form.type==="rejected"?"Rechazo registrado":"Entrega confirmada")};
  const handleInvoiceSave=(invoiceData, invoiceLines)=>{
    const o=invoiceM;
    const updatedLines=o.lines.map(l=>{const il=invoiceLines.find(x=>x.id===l.id);return il?{...l,invoicedQty:il.invoicedQty,invoicedPrice:il.invoicedPrice}:l});
    const updated={...o,status:"INVOICED",lines:updatedLines,invoice:invoiceData,
      history:[...o.history,{date:new Date().toISOString(),action:`Factura ${invoiceData.invoiceNumber} registrada${invoiceData.discounts?.length>0?` (${invoiceData.discounts.length} descuento${invoiceData.discounts.length>1?"s":""})`:""}`,user:"",icon:"🧾"}]};
    updateOrder(updated);setToast(`Factura ${invoiceData.invoiceNumber} registrada`);
  };
  const handleProcess=f=>{setProcFiles(f);setProcessing(true)};
  const handleProcessDone=()=>{const nw=(procFiles||[{name:"archivo.pdf"}]).map((f,i)=>{
    return{id:`ORD-${uid()}`,chain:"",chainCode:"",orderNumber:`PO-${rndInt(10000,99999)}`,emissionDate:today(),deliveryDate:"",expiryDate:"",
      destination:"",cedis:"",branch:"",deliveryAddress:"",buyer:"",notes:"",currency:"MXN",paymentTerms:"",
      lines:[],total:0,fileType:f.name?.split(".").pop()?.toUpperCase()||"PDF",fileName:f.name||"archivo",uploadDate:new Date().toISOString(),uploadedBy:"",confidence:0,status:"PENDING_REVIEW",
      validations:[{type:"warning",field:"general",message:"Nuevo — completar datos"}],history:[{date:new Date().toISOString(),action:"Archivo cargado",user:"",icon:"📥"}],reviewed:false,
      delivery:{status:"PENDING",appointmentDate:null,appointmentTime:null,appointmentEndTime:null,carrier:null,driverName:null,driverPhone:null,vehiclePlates:null,dockNumber:null,actualDeliveryDate:null,actualDeliveryTime:null,receivedBy:null,proofOfDelivery:null,rejectionReason:null},invoice:null,duplicateOf:null,
      uploadedFiles:[{name:f.name||"archivo",size:f.size?`${(f.size/1024).toFixed(1)} KB`:"N/A",type:f.name?.split(".").pop()||"pdf",dataUrl:f.dataUrl||null}]}});
    setOrders(p=>[...nw,...p]);setProcessing(false);setProcFiles(null);setView("dashboard");setToast(`${nw.length} procesado(s)`)};
  const go=o=>{setSelected(o);setView("detail")};

  const counts=useMemo(()=>({
    pending:orders.filter(o=>o.status==="PENDING_REVIEW").length,
    alerts:orders.filter(o=>daysUntil(o.deliveryDate)<=3&&daysUntil(o.deliveryDate)>=0||o.status==="ERROR"||o.status==="DUPLICATE"||o.delivery?.status==="REJECTED").length,
    deliveries:orders.filter(o=>["VALIDATED","SCHEDULED","IN_TRANSIT"].includes(o.status)).length,
    invoiced:orders.filter(o=>o.invoice&&!o.invoice.reconciled).length,
    noInvoice:orders.filter(o=>["DELIVERED","PARTIAL_DELIVERY"].includes(o.status)&&!o.invoice).length,
    duplicates:Object.values(orders.reduce((m,o)=>{m[o.orderNumber]=(m[o.orderNumber]||0)+1;return m},{})).filter(c=>c>1).length,
  }),[orders]);

  const nav=[
    {id:"dashboard",label:"Pedidos",icon:I.orders,badge:counts.pending||null},
    {id:"deliveries",label:"Entregas",icon:I.truck,badge:counts.deliveries||null,bc:"badge-purple"},
    {id:"calendar",label:"Calendario",icon:I.calendar},
    {id:"upload",label:"Cargar pedidos",icon:I.upload},
    {id:"alerts",label:"Alertas",icon:I.alert,badge:counts.alerts||null},
    "sep",
    {id:"cfdi",label:"CFDI / Facturas",icon:I.receipt,badge:counts.noInvoice||null,bc:"badge-cyan"},
    {id:"catalogs",label:"Catálogos",icon:I.layers},
    {id:"reports",label:"Reportes",icon:I.chart},
    {id:"reconciliation",label:"Conciliación",icon:I.receipt,badge:counts.invoiced||null,bc:"badge-cyan"},
    {id:"duplicates",label:"Duplicados",icon:I.copy,badge:counts.duplicates||null},
    "sep2",
    {id:"backups",label:"Backups",icon:I.shield},
  ];

  return(<><style>{CSS}</style>
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="sidebar-brand-icon">OF</div><span className="sidebar-brand-text">OrderFlow</span><span className="sidebar-brand-badge">MX</span></div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">Operación</div>
          {nav.map((item,i)=>{
            if(typeof item==="string") return (<div key={item} className="sidebar-section" style={{marginTop:4}}>{item==="sep"?"Gestión":"Sistema"}</div>);
            return (
              <div key={item.id} className={`sidebar-item ${view===item.id||(view==="detail"&&item.id==="dashboard")?"active":""}`}
                onClick={()=>{setView(item.id);setSelected(null)}}>
                {item.icon}{item.label}
                {item.badge&&<span className={`badge ${item.bc||""}`}>{item.badge}</span>}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer"><div className="sidebar-avatar">AD</div><div><div className="sidebar-user-name">Admin</div><div className="sidebar-user-role">Administrador</div></div></div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="topbar-search">{I.search}<input placeholder="Buscar pedidos, SKUs, cadenas..."/></div>
          <div className="topbar-actions"><button className="btn btn-primary btn-sm" onClick={()=>setView("upload")}>{I.plus} Nuevo</button></div></header>
        <div className="content">
          {view==="dashboard"&&<DashboardView orders={orders} onSelectOrder={go}/>}
          {view==="deliveries"&&<DeliveriesView orders={orders} onSelectOrder={go} onSchedule={setScheduleM} onConfirm={setConfirmM} onTransit={handleTransit}/>}
          {view==="calendar"&&<CalendarView orders={orders} onSelectOrder={go}/>}
          {view==="upload"&&<UploadView onProcess={handleProcess}/>}
          {view==="alerts"&&<AlertsView orders={orders} onSelectOrder={go}/>}
          {view==="cfdi"&&<CFDIView orders={orders} onSelectOrder={go} onUploadCFDI={(o)=>{setCfdiOrder(o);setCfdiModal("upload")}} onDemoCFDI={(o)=>{const xml=CFDIDemo(o);const p=CFDIParse(xml);if(!p.error){setCfdiOrder(o);setCfdiData(p);setCfdiModal("result")}}} />}
          {view==="catalogs"&&<CatalogsView toast={setToast}/>}
          {view==="reports"&&<ReportsView orders={orders}/>}
          {view==="reconciliation"&&<ReconciliationView orders={orders} onUpdate={updateOrder} setToast={setToast} onUploadInvoice={setInvoiceM}/>}
          {view==="duplicates"&&<DuplicatesView orders={orders} onUpdate={updateOrder} setToast={setToast}/>}
          {view==="backups"&&<BackupView setToast={setToast}/>}
          {view==="detail"&&selected&&<OrderDetailView order={selected} onBack={()=>{setView("dashboard");setSelected(null)}} onUpdate={updateOrder} onToast={setToast} onSchedule={setScheduleM} onConfirm={setConfirmM} onTransit={handleTransit} onUploadInvoice={setInvoiceM}/>}
        </div>
      </main>

      {processing&&<ProcessingModal files={procFiles} onComplete={handleProcessDone}/>}
      {scheduleM&&<ScheduleModal order={scheduleM} onSave={handleScheduleSave} onClose={()=>setScheduleM(null)}/>}
      {confirmM&&<ConfirmDeliveryModal order={confirmM} onSave={handleConfirmSave} onClose={()=>setConfirmM(null)}/>}
      {invoiceM&&<InvoiceUploadModal order={invoiceM} onSave={handleInvoiceSave} onClose={()=>setInvoiceM(null)}/>}
      {cfdiModal==="upload"&&cfdiOrder&&<CFDIUploadModalView order={cfdiOrder} onClose={()=>{setCfdiModal(null);setCfdiOrder(null)}} onDemo={()=>{const xml=CFDIDemo(cfdiOrder);const p=CFDIParse(xml);if(!p.error){setCfdiData(p);setCfdiModal("result")}}} onFile={(xmlStr)=>{const p=CFDIParse(xmlStr);if(p.error){setToast("Error XML: "+p.error);return}setCfdiData(p);setCfdiModal("result")}} />}
      {cfdiModal==="result"&&cfdiOrder&&cfdiData&&<CFDIResultModalView order={cfdiOrder} cfdi={cfdiData} onClose={()=>{setCfdiModal(null);setCfdiData(null)}} onSave={handleCFDIRegister} />}
      {toast&&<Toast message={toast} onClose={()=>setToast(null)}/>}
    </div>
  </>);
}

// ==========================================
// CFDI VIEW — Pedidos sin factura + Facturas registradas
// ==========================================
function CFDIView({orders, onSelectOrder, onUploadCFDI, onDemoCFDI}) {
  const noInv = useMemo(() => orders.filter(o => ["DELIVERED","PARTIAL_DELIVERY"].includes(o.status) && !o.invoice), [orders]);
  const withInv = useMemo(() => orders.filter(o => o.invoice), [orders]);

  return (
    <div>
      <div className="page-header"><h1>CFDI / Facturas</h1><p>Sube archivos XML del SAT — extracción automática de UUID, RFC, conceptos, descuentos e impuestos</p></div>
      <div className="stats-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
        <div className="stat-card"><div className="stat-label">Sin factura</div><div className="stat-value" style={{color:"var(--warning)"}}>{noInv.length}</div><div className="stat-sub">Entregados sin CFDI</div></div>
        <div className="stat-card"><div className="stat-label">Facturados</div><div className="stat-value" style={{color:"var(--cyan)"}}>{withInv.filter(x=>!x.invoice.reconciled).length}</div></div>
        <div className="stat-card"><div className="stat-label">Conciliados</div><div className="stat-value" style={{color:"var(--success)"}}>{withInv.filter(x=>x.invoice.reconciled).length}</div></div>
        <div className="stat-card"><div className="stat-label">Total facturado</div><div className="stat-value" style={{fontSize:20}}>{fmtCurrency(withInv.reduce((s,x)=>s+(x.invoice.invoiceTotal||0),0))}</div></div>
      </div>

      <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>Pedidos entregados sin factura</h3>
      {noInv.length===0 ? (
        <div className="card" style={{padding:24,marginBottom:28}}><div className="empty-state"><h3>Todos los pedidos tienen factura</h3></div></div>
      ) : (
        <div className="card" style={{overflow:"hidden",marginBottom:28}}>
          <table><thead><tr><th>Pedido</th><th>Cadena</th><th>Destino</th><th>Entregado</th><th>Total</th><th>Acciones</th></tr></thead>
            <tbody>{noInv.map(o => (
              <tr key={o.id}>
                <td style={{fontWeight:600}}>{o.orderNumber}</td>
                <td>{o.chain}</td><td>{o.destination}</td>
                <td>{fmt(o.delivery?.actualDeliveryDate)}</td>
                <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtCurrency(o.total)}</td>
                <td>
                  <button className="btn btn-cyan btn-sm" onClick={()=>onUploadCFDI(o)}>🧾 Subir CFDI</button>{" "}
                  <button className="btn btn-secondary btn-sm" onClick={()=>onDemoCFDI(o)}>Demo XML</button>
                </td>
              </tr>
            ))}</tbody></table>
        </div>
      )}

      <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>Facturas registradas</h3>
      {withInv.length===0 ? (
        <div className="card" style={{padding:24}}><div className="empty-state"><h3>Sin facturas registradas</h3></div></div>
      ) : (
        <div className="card" style={{overflow:"hidden"}}>
          <table><thead><tr><th>Pedido</th><th>Factura</th><th>Cadena</th><th>Total</th><th>Fecha</th><th>CFDI SAT</th><th>Estatus</th></tr></thead>
            <tbody>{withInv.map(o => (
              <tr key={o.id} className="clickable" onClick={()=>onSelectOrder(o)}>
                <td style={{fontWeight:600}}>{o.orderNumber}</td>
                <td>{o.invoice.invoiceNumber}</td><td>{o.chain}</td>
                <td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtCurrency(o.invoice.invoiceTotal)}</td>
                <td>{fmt(o.invoice.invoiceDate)}</td>
                <td>{o.invoice.cfdiData?.timbre?.uuid ? <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#d1fae5",color:"#059669"}}>✓ Timbrado</span> : <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#fee2e2",color:"#dc2626"}}>Sin CFDI</span>}</td>
                <td><StatusBadge status={o.invoice.reconciled?"RECONCILED":"INVOICED"}/></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// CFDI UPLOAD MODAL
// ==========================================
function CFDIUploadModalView({order, onClose, onDemo, onFile}) {
  const fileRef = useRef();
  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => onFile(e.target.result);
    reader.readAsText(file);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>🧾 Subir CFDI (XML del SAT)</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div style={{background:"#f8fafc",borderRadius:8,padding:"12px 16px",marginBottom:20,fontSize:13}}>
            <strong>{order.orderNumber}</strong> · {order.chain} · {order.destination} · Total: <strong>{fmtCurrency(order.total)}</strong>
          </div>
          <div className="upload-zone" onClick={()=>fileRef.current?.click()}
            onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0])}}>
            <div style={{fontSize:36,marginBottom:10,opacity:.4}}>🧾</div>
            <h3 style={{fontSize:15,fontWeight:600,marginBottom:4}}>Arrastra tu archivo XML aquí</h3>
            <p style={{fontSize:13,color:"var(--text-tertiary)"}}>CFDI 4.0 del SAT — Archivo .xml</p>
            <div style={{marginTop:12,display:"flex",gap:6,justifyContent:"center"}}><span className="tag">XML</span><span className="tag">CFDI 4.0</span></div>
            <input ref={fileRef} type="file" hidden accept=".xml" onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0])}}/>
          </div>
          <p style={{fontSize:11.5,color:"var(--text-tertiary)",marginTop:14,textAlign:"center"}}>Extracción automática: UUID, RFC emisor/receptor, conceptos, descuentos por línea, IVA, total</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onDemo}>Usar CFDI demo</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// CFDI RESULT MODAL — shows parsed data
// ==========================================
function CFDIResultModalView({order, cfdi, onClose, onSave}) {
  const diff = Math.abs(cfdi.total - order.total);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:720}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>🧾 CFDI Extraído — {cfdi.serie||""}{cfdi.folio||""}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{overflowY:"auto"}}>
          {cfdi.timbre?.uuid ? (
            <div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:20,background:"#d1fae5",color:"#059669",marginBottom:14}}>✓ Timbrado — UUID: <span style={{fontFamily:"var(--font-mono)"}}>{cfdi.timbre.uuid}</span></div>
          ) : (
            <div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"#fee2e2",color:"#dc2626",marginBottom:14}}>Sin timbre fiscal</div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:18}}>
            {[["Tipo",cfdi.tipoL],["Folio",`${cfdi.serie||""}${cfdi.folio||"—"}`],["Fecha",cfdi.fecha?.substring(0,10)||"—"],["Emisor",cfdi.emisor?.nombre||"—"],["Receptor",cfdi.receptor?.nombre||"—"],["Uso CFDI",cfdi.receptor?.uso||"—"],["Forma pago",cfdi.formaPagoL],["Método",cfdi.metodoPagoL],["Moneda",cfdi.moneda]].map(([k,v])=>(
              <div key={k}><div style={{fontSize:10.5,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",letterSpacing:".3px",marginBottom:2}}>{k}</div><div style={{fontSize:13,fontWeight:600}}>{v}</div></div>
            ))}
          </div>
          <div className="section-title">Conceptos ({cfdi.conceptos.length} líneas)</div>
          <div style={{overflowX:"auto",marginBottom:18}}>
            <table style={{fontSize:12}}>
              <thead><tr><th>Clave/ID</th><th>Descripción</th><th>Cant.</th><th>P.U.</th><th>Desc.</th><th>Importe</th></tr></thead>
              <tbody>{cfdi.conceptos.map((c,i)=>(
                <tr key={i}><td style={{fontFamily:"var(--font-mono)",fontSize:11}}>{c.noid||c.cprod}</td><td style={{fontSize:12}}>{c.descripcion}</td><td style={{fontFamily:"var(--font-mono)"}}>{c.cant}</td><td style={{fontFamily:"var(--font-mono)"}}>{fmtCurrency(c.vu)}</td><td style={{fontFamily:"var(--font-mono)",color:"var(--danger)"}}>{c.descuento>0?`-${fmtCurrency(c.descuento)}`:"—"}</td><td style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtCurrency(c.importe)}</td></tr>
              ))}</tbody>
              <tfoot>
                <tr style={{borderTop:"2px solid var(--border)"}}><td colSpan={5} style={{textAlign:"right",fontWeight:700}}>Subtotal:</td><td style={{fontFamily:"var(--font-mono)",fontWeight:700}}>{fmtCurrency(cfdi.subTotal)}</td></tr>
                {cfdi.descuento>0&&<tr><td colSpan={5} style={{textAlign:"right",color:"var(--danger)",fontWeight:600}}>Descuento global:</td><td style={{fontFamily:"var(--font-mono)",color:"var(--danger)"}}>-{fmtCurrency(cfdi.descuento)}</td></tr>}
                {cfdi.descLineas>0&&<tr><td colSpan={5} style={{textAlign:"right",fontSize:11.5,color:"var(--text-tertiary)"}}>Desc. por línea:</td><td style={{fontFamily:"var(--font-mono)",fontSize:11.5,color:"var(--danger)"}}>-{fmtCurrency(cfdi.descLineas)}</td></tr>}
                <tr><td colSpan={5} style={{textAlign:"right",fontWeight:600}}>IVA:</td><td style={{fontFamily:"var(--font-mono)"}}>{fmtCurrency(cfdi.impuestos.total)}</td></tr>
                <tr style={{borderTop:"2px solid var(--border)"}}><td colSpan={5} style={{textAlign:"right",fontWeight:700,fontSize:15}}>Total CFDI:</td><td style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:15}}>{fmtCurrency(cfdi.total)}</td></tr>
              </tfoot>
            </table>
          </div>
          <div style={{background:"#f8fafc",borderRadius:8,padding:"14px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>Total pedido:</span><span style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtCurrency(order.total)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>Total CFDI (con IVA):</span><span style={{fontFamily:"var(--font-mono)",fontWeight:600}}>{fmtCurrency(cfdi.total)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700,paddingTop:6,borderTop:"1px solid var(--border)",color:diff<1?"var(--success)":"var(--warning)"}}><span>Diferencia:</span><span style={{fontFamily:"var(--font-mono)"}}>{fmtCurrency(diff)} {diff<1?"✓":"⚠️ Incluye IVA y descuentos"}</span></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave}>✓ Registrar factura con datos del CFDI</button>
        </div>
      </div>
    </div>
  );
}
