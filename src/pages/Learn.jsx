import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Calculator, BarChart2, DollarSign, Calendar, Star, BookOpen } from 'lucide-react';
import PageTour from '@/components/shared/PageTour';
import { useAuth } from '@/lib/AuthContext';
import { fetchOwnedRows } from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Módulo de Aprendizaje 📚', description: 'Aquí encuentras guías prácticas para tomar mejores decisiones financieras en tu negocio.' },
  { title: 'Insights personalizados 💡', description: 'La sección "Para ti ahora mismo" analiza tus datos reales y te da recomendaciones específicas según tu situación actual.' },
  { title: 'Guías accionables ✅', description: 'Cada guía termina con una acción concreta que puedes hacer inmediatamente en el sistema. No teoría — pasos reales.' },
];
import { motion } from 'framer-motion';

const GUIDES = [
  {
    icon: Calculator,
    title: '¿Cómo calcular el precio correcto de tu producto?',
    description: 'Aprende a incluir todos tus costos para nunca vender a pérdida.',
    content: `## ¿Cómo calcular el precio correcto de tu producto?

**El error más común:** fijar el precio "según lo que cobra la competencia" o "lo que suena razonable", sin saber si cubre tus costos.

---

### Los 4 componentes de tu precio real:

**1. Costo de materiales**
Todo lo que se consume para producir una unidad: materia prima, empaque, insumos directos.

**2. Costo de tiempo**
Tu hora tiene valor. Calcula: *Horas invertidas × Tu valor hora = Costo de mano de obra*

**3. Costos ocultos (overhead)**
Plataformas, herramientas, electricidad, internet, transporte. Divídelos entre el número de unidades mensuales.

**4. Margen de ganancia**
Decide cuánto quieres ganar encima de todos los costos. Mínimo recomendado: 40%.

---

### Fórmula:

> **Precio mínimo = (Materiales + Tiempo + Overhead) ÷ (1 - Margen%)**

### Ejemplo práctico:
- Materiales: $15
- Tiempo (2h × $10): $20
- Overhead: $5
- **Total costos: $40**
- Margen deseado: 50%
- **Precio mínimo: $40 ÷ 0.50 = $80**

---

### ✅ Acción inmediata:
Entra a **Rentabilidad → Nuevo Producto** y registra todos tus costos. El sistema calculará tu precio sugerido automáticamente.`,
  },
  {
    icon: BarChart2,
    title: '¿Qué es el CEO Score™ y cómo mejorarlo?',
    description: 'Entiende tu número de salud financiera y qué acciones lo mueven.',
    content: `## ¿Qué es el CEO Score™?

El **CEO Score™** es tu indicador de salud financiera en una sola cifra del 0 al 100. Es como el "pulso" de tu negocio.

---

### ¿Cómo se calcula?

El score evalúa 4 dimensiones:

| Dimensión | Peso |
|---|---|
| Margen de ganancia promedio | 30% |
| Cumplimiento de meta trimestral | 25% |
| Consistencia de ingresos | 25% |
| Control de costos | 20% |

---

### Escala de interpretación:

- 🔴 **0–39**: Zona crítica — el negocio está en riesgo
- 🟡 **40–69**: En desarrollo — hay áreas de mejora urgente
- 🟢 **70–100**: Zona saludable — negocio rentable y sostenible

---

### ¿Cómo mejorar tu score?

**Sube el margen:**
→ Revisa precios bajos en la sección de Rentabilidad

**Cumple tu meta trimestral:**
→ Define una meta realista en Configuración

**Registra todos los meses:**
→ Usa Control Mensual para no dejar meses vacíos

**Reduce costos ocultos:**
→ Audita tus gastos fijos cada mes

---

### ✅ Acción inmediata:
Ve al **Dashboard** y mira tu CEO Score™ actual. Haz clic en él para ver qué está afectando más tu puntuación.`,
  },
  {
    icon: DollarSign,
    title: '¿Cuál es la diferencia entre ingreso y ganancia?',
    description: 'El error más común de las emprendedoras y cómo evitarlo.',
    content: `## Ingreso vs. Ganancia: el error que destruye negocios

Este es el malentendido financiero #1 entre emprendedoras. Entenderlo puede cambiar completamente tu negocio.

---

### Definiciones claras:

**📥 Ingreso (ventas brutas)**
Es todo el dinero que entra a tu negocio antes de descontar nada. Si vendiste $5,000 este mes, ese es tu ingreso.

**💰 Ganancia neta**
Es lo que **realmente te queda** después de restar todos los costos:
> Ganancia = Ingresos − Costos totales

---

### Ejemplo que lo ilustra todo:

Una emprendedora vende pasteles y facturó **$3,000** en el mes.

| Concepto | Monto |
|---|---|
| Ingredientes | -$800 |
| Cajas y empaques | -$200 |
| Gas y electricidad | -$150 |
| Plataformas de pago | -$90 |
| Su tiempo (40h × $10) | -$400 |
| **Ganancia real** | **$1,360** |

**Ingreso: $3,000 — Ganancia real: $1,360 (45%)**

---

### El error más común:
Celebrar los $3,000 sin saber que solo son $1,360. Peor aún: si no registra su tiempo, cree que ganó $1,760 cuando en realidad se está "pagando" $10/hora.

---

### ✅ Acción inmediata:
Abre **Control Mensual** y registra tus ingresos y gastos del mes actual. El sistema te mostrará tu ganancia real al instante.`,
  },
  {
    icon: Calendar,
    title: '¿Cómo hacer tu cierre mensual?',
    description: 'Paso a paso para registrar tu mes y saber si fuiste rentable.',
    content: `## Cómo hacer tu cierre mensual en CEO Rentable OS™

El cierre mensual es tu "reunión de directorio" contigo misma. 30 minutos al mes que pueden transformar tu negocio.

---

### ¿Cuándo hacerlo?
Los últimos 2–3 días del mes o los primeros 2 del mes siguiente.

---

### Paso a paso:

**Paso 1: Recopila tus números**
- Total de ventas del mes (revisa tu método de cobro)
- Todos los gastos: fijos + variables + plataformas + compras

**Paso 2: Entra a Control Mensual**
- Haz clic en el mes actual
- Ingresa tus **Ingresos totales**
- Ingresa tus **Gastos totales**
- El sistema calcula automáticamente tu ganancia y margen

**Paso 3: Analiza los resultados**
- ¿Tu margen está por encima de tu meta?
- ¿Qué producto/servicio generó más ganancia?
- ¿Hubo gastos inesperados que puedes evitar el próximo mes?

**Paso 4: Escribe una nota**
- Usa el campo de notas para registrar: qué funcionó, qué no, y tu intención para el próximo mes.

**Paso 5: Cierra el mes**
- Marca el mes como "cerrado" para proteger los datos

---

### 🎯 Meta mensual recomendada:
Que tu margen neto esté siempre por encima del 40%.

---

### ✅ Acción inmediata:
Ve a **Control Mensual** y registra el mes actual ahora mismo.`,
  },
  {
    icon: Star,
    title: '¿Cómo identificar tu producto más rentable?',
    description: 'No el que más vendes — el que más te deja.',
    content: `## Cómo identificar tu producto más rentable

Muchas emprendedoras trabajan más para ganar menos porque se enfocan en sus productos más populares, no en los más rentables.

---

### La diferencia clave:

| | Producto A | Producto B |
|---|---|---|
| Precio de venta | $50 | $30 |
| Costo total | $40 | $10 |
| **Ganancia** | **$10 (20%)** | **$20 (67%)** |

**Producto B es 3× más rentable aunque "cuesta" menos.**

---

### Cómo verlo en CEO Rentable OS™:

1. Ve a la sección **Productos**
2. Ordena por columna **"Margen %"** de mayor a menor
3. Los primeros de la lista son tus productos estrella

---

### Qué hacer con esta información:

**🌟 Productos con margen >50%:**
→ Promociónalos más, crea bundles, hazlos tu oferta principal

**⚠️ Productos con margen <20%:**
→ Sube el precio, reduce costos o elimínalos

**💡 Regla de oro:**
> 20% de tus productos generan 80% de tu ganancia real

---

### Señales de que estás priorizando mal:
- Estás muy ocupada pero con poco dinero en cuenta
- Tus productos más vendidos no se reflejan en ganancias
- Sientes que trabajas "gratis" algunos días

---

### ✅ Acción inmediata:
Ve a **Rentabilidad → Análisis por Producto** y ordena por margen. Identifica tu Top 3 y decide cómo potenciarlos esta semana.`,
  },
];

export default function Learn() {
  const [openGuide, setOpenGuide] = useState(null);
  const { user, userProfile, isAdmin } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;

  const { data: products = [] } = useQuery({
    queryKey: ['learn-products', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'products', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['learn-invoices', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({
      table: 'invoices',
      ownerId,
      ownerEmail,
      adminMode,
      filters: [{ column: 'status', value: 'pending' }],
    }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const avgMargin = products.length
    ? products.reduce((s, p) => s + (p.margin_pct || 0), 0) / products.length
    : null;

  const insights = [];
  if (avgMargin !== null && avgMargin < 20) insights.push({ type: 'warning', msg: `Tu margen promedio es ${avgMargin.toFixed(1)}% — revisa tus costos y precios urgente.` });
  if (invoices.length > 0) insights.push({ type: 'info', msg: `Tienes ${invoices.length} factura(s) pendiente(s). Haz seguimiento para cobrar a tiempo.` });
  if (products.length === 0) insights.push({ type: 'tip', msg: 'Agrega tus productos para saber cuál te deja más dinero.' });
  if (avgMargin !== null && avgMargin >= 40) insights.push({ type: 'ok', msg: `¡Excelente! Tu margen es ${avgMargin.toFixed(1)}%. Sigue escalando tu producto más rentable.` });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageTour pageName="Learn" userEmail={ownerEmail} steps={TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Aprende</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">Guías prácticas para tomar mejores decisiones financieras.</p>
      </motion.div>

      {/* Dynamic insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Para ti ahora mismo</p>
          {insights.map((ins, i) => {
            const cfg = {
              warning: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-amber-700',
              info:    'bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-blue-700',
              tip:     'bg-purple-50 dark:bg-purple-950/20 border-purple-200 text-purple-700',
              ok:      'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700',
            }[ins.type];
            const emoji = { warning: '⚠️', info: '📋', tip: '💡', ok: '✅' }[ins.type];
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${cfg}`}>
                <span>{emoji}</span>
                <span>{ins.msg}</span>
              </div>
            );
          })}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {GUIDES.map((guide, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <Card className="p-5 hover:shadow-md transition-shadow h-full flex flex-col">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <guide.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm leading-snug text-foreground mb-1">{guide.title}</h3>
                  <p className="text-xs text-muted-foreground">{guide.description}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setOpenGuide(guide)}
                >
                  Ver guía →
                </Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Sheet open={!!openGuide} onOpenChange={() => setOpenGuide(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {openGuide && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <openGuide.icon className="h-5 w-5 text-primary" />
                  </div>
                  <SheetTitle className="text-base leading-snug text-left">{openGuide.title}</SheetTitle>
                </div>
              </SheetHeader>
              <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-table:text-sm">
                {openGuide.content.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-0 mb-3">{line.slice(3)}</h2>;
                  if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold mt-5 mb-2">{line.slice(4)}</h3>;
                  if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-foreground my-1">{line.slice(2, -2)}</p>;
                  if (line.startsWith('> ')) return <blockquote key={i} className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-3">{line.slice(2)}</blockquote>;
                  if (line.startsWith('- ') || line.startsWith('→ ')) return <p key={i} className="text-sm text-muted-foreground pl-2 my-0.5">{line}</p>;
                  if (line.startsWith('| ') && line.includes('|')) {
                    if (line.includes('---')) return null;
                    const cells = line.split('|').filter(c => c.trim());
                    return <div key={i} className="flex gap-4 text-sm border-b border-border py-1.5">{cells.map((c, j) => <span key={j} className="flex-1 text-muted-foreground" dangerouslySetInnerHTML={{ __html: c.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />)}</div>;
                  }
                  if (line === '---') return <hr key={i} className="my-4 border-border" />;
                  if (line.trim() === '') return <div key={i} className="h-2" />;
                  return <p key={i} className="text-sm text-muted-foreground my-1" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />;
                })}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
