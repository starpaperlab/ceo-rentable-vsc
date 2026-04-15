import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle } from 'lucide-react';

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[0, 1, 2].map(i => (
        <React.Fragment key={i}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            i < current ? 'bg-primary text-white' : i === current ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-muted text-muted-foreground'
          }`}>
            {i < current ? <CheckCircle className="h-4 w-4" /> : i + 1}
          </div>
          {i < 2 && <div className={`h-0.5 w-12 ${i < current ? 'bg-primary' : 'bg-muted'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function OnboardingFlow({ user, onComplete }) {
  const [step, setStep] = useState(0);

  const [biz, setBiz] = useState({ name: '', type: 'fisico' });
  const [product, setProduct] = useState({ name: '', price: '', cost: '' });
  const [sale, setSale] = useState({ quantity: 1 });
  const [result, setResult] = useState(null);

  const margin = product.price && product.cost
    ? ((parseFloat(product.price) - parseFloat(product.cost)) / parseFloat(product.price)) * 100
    : null;

  const handleStep1 = () => {
    if (!biz.name.trim()) return;
    localStorage.setItem("businessData", JSON.stringify(biz));
    setStep(1);
  };

  const handleStep2 = () => {
    if (!product.name || !product.price || !product.cost) return;
    localStorage.setItem("productData", JSON.stringify(product));
    setStep(2);
  };

  const handleStep3 = () => {
    if (!sale.quantity || sale.quantity < 1) return;

    const price = parseFloat(product.price);
    const cost = parseFloat(product.cost);
    const qty = parseInt(sale.quantity);

    const marginPct = ((price - cost) / price) * 100;
    const netProfit = price - cost;

    // guardar producto
    const products = JSON.parse(localStorage.getItem("products") || "[]");
    products.push({
      id: Date.now(),
      name: product.name,
      status: 'active',
      margin_pct: marginPct,
      price,
      cost
    });
    localStorage.setItem("products", JSON.stringify(products));

    // guardar factura
    const invoices = JSON.parse(localStorage.getItem("paidInvoices") || "[]");
    invoices.push({
      id: Date.now(),
      total_ingresos: price * qty,
      total_costos: cost * qty
    });
    localStorage.setItem("paidInvoices", JSON.stringify(invoices));

    const scoreVal = Math.min(Math.round(Math.max(marginPct * 1.5, 0)), 100);

    setResult({
      marginPct,
      netProfit,
      scoreVal,
      qty,
      total: price * qty,
      productName: product.name
    });

    setStep(3);
  };

  const handleFinish = () => {
    if (user?.email) {
      localStorage.setItem(`ceo_onboarding_${user.email}`, 'true');
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white p-6 rounded-xl shadow">

        {step < 3 && <StepIndicator current={step} />}

        {step === 0 && (
          <div>
            <h2>Tu negocio</h2>
            <Input placeholder="Nombre negocio" value={biz.name} onChange={e => setBiz(p => ({ ...p, name: e.target.value }))} />
            <Button onClick={handleStep1}>Continuar</Button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2>Producto</h2>
            <Input placeholder="Nombre" value={product.name} onChange={e => setProduct(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Precio" value={product.price} onChange={e => setProduct(p => ({ ...p, price: e.target.value }))} />
            <Input placeholder="Costo" value={product.cost} onChange={e => setProduct(p => ({ ...p, cost: e.target.value }))} />
            <Button onClick={handleStep2}>Continuar</Button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2>Venta</h2>
            <Input type="number" value={sale.quantity} onChange={e => setSale({ quantity: parseInt(e.target.value) || 1 })} />
            <Button onClick={handleStep3}>Calcular</Button>
          </div>
        )}

        {step === 3 && result && (
          <div>
            <h2>Resultado</h2>
            <p>Margen: {result.marginPct.toFixed(1)}%</p>
            <p>Ganancia: {result.netProfit}</p>
            <Button onClick={handleFinish}>Ir al dashboard</Button>
          </div>
        )}

      </div>
    </div>
  );
}