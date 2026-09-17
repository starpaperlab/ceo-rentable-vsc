import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Search, TrendingUp } from 'lucide-react';
import BlogSeo from '@/components/blog/BlogSeo';
import { blogCategories, blogPosts } from '@/data/blogPosts';

const BRAND_PINK = '#c45c8c';

export default function Blog() {
  const [category, setCategory] = useState('Todos');
  const [query, setQuery] = useState('');

  const filteredPosts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return blogPosts.filter((post) => {
      const categoryMatch = category === 'Todos' || post.category === category;
      const textMatch = !normalized || [post.title, post.excerpt, post.category, ...post.keywords]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
      return categoryMatch && textMatch;
    });
  }, [category, query]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog de CEO Rentable',
    url: 'https://ceorentable.com/blog',
    description: 'Consejos prácticos sobre precios, rentabilidad, finanzas, cobros y gestión para emprendedoras y pequeños negocios.',
    publisher: {
      '@type': 'Organization',
      name: 'CEO Rentable',
      url: 'https://ceorentable.com',
    },
  };

  return (
    <div className="min-h-screen bg-[#fbf8fa] text-slate-900">
      <BlogSeo
        title="Blog para emprendedoras y pequeños negocios | CEO Rentable"
        description="Aprende a calcular precios, controlar costos, mejorar tu rentabilidad y organizar las finanzas de tu negocio con guías prácticas de CEO Rentable."
        canonical="https://ceorentable.com/blog"
        keywords={['finanzas para emprendedoras', 'rentabilidad negocio', 'precios', 'cuentas por cobrar', 'pequeños negocios']}
        schema={schema}
      />

      <header className="border-b border-rose-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/blog" className="flex items-center gap-3" aria-label="CEO Rentable Blog">
            <img src="/brand/isotipo.png" alt="CEO Rentable" className="h-11 w-11 rounded-full object-contain" />
            <div>
              <div className="text-lg font-bold leading-tight">CEO Rentable</div>
              <div className="text-xs text-slate-500">Blog para negocios con números claros</div>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex">
              Iniciar sesión
            </Link>
            <Link to="/diagnostico" className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm" style={{ backgroundColor: BRAND_PINK }}>
              Diagnóstico gratis
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-rose-100 bg-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-rose-100/60 blur-3xl" />
          <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-100/60 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700">
                <TrendingUp className="h-4 w-4" />
                Finanzas simples para negocios reales
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Aprende a vender, cobrar y ganar con más claridad
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                Guías prácticas para emprendedoras y pequeños negocios que quieren dejar de adivinar sus números y tomar mejores decisiones.
              </p>
            </div>

            <div className="mt-9 max-w-2xl">
              <label className="relative block">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar sobre precios, costos, cobros, rentabilidad..."
                  className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-base shadow-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="mb-8 flex flex-wrap gap-2">
            {blogCategories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${category === item ? 'text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-700'}`}
                style={category === item ? { backgroundColor: BRAND_PINK } : undefined}
              >
                {item}
              </button>
            ))}
          </div>

          {filteredPosts.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredPosts.map((post) => (
                <article key={post.slug} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex min-h-36 items-end bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50 p-6">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-rose-700 shadow-sm">{post.category}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-400">
                      <BookOpen className="h-4 w-4" />
                      {post.readTime}
                    </div>
                    <h2 className="text-xl font-extrabold leading-snug text-slate-900 group-hover:text-rose-700">{post.title}</h2>
                    <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{post.excerpt}</p>
                    <Link to={`/blog/${post.slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-rose-700">
                      Leer artículo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-lg font-semibold text-slate-700">No encontramos artículos con esa búsqueda.</p>
              <button onClick={() => { setQuery(''); setCategory('Todos'); }} className="mt-3 text-sm font-bold text-rose-700">Ver todos los artículos</button>
            </div>
          )}
        </section>

        <section className="border-t border-rose-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <div className="rounded-3xl bg-slate-950 px-6 py-10 text-white sm:px-10">
              <div className="max-w-3xl">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-rose-300">CEO Rentable</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">¿Lees tus números o todavía los adivinas?</h2>
                <p className="mt-4 text-base leading-7 text-slate-300">Haz el diagnóstico y descubre qué parte de tu negocio necesita atención primero.</p>
                <Link to="/diagnostico" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">
                  Hacer diagnóstico gratis <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-[#fbf8fa]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 CEO Rentable OS™</span>
          <div className="flex gap-4">
            <Link to="/privacidad" className="hover:text-slate-900">Privacidad</Link>
            <Link to="/terminos" className="hover:text-slate-900">Términos</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
