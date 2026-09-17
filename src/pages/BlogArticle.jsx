import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, CheckCircle2 } from 'lucide-react';
import BlogSeo from '@/components/blog/BlogSeo';
import { getBlogPost } from '@/data/blogPosts';

const BRAND_PINK = '#c45c8c';

function formatDate(date) {
  return new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

export default function BlogArticle() {
  const { slug } = useParams();
  const post = getBlogPost(slug);

  if (!post) {
    return (
      <div className="min-h-screen bg-[#fbf8fa] px-5 py-20 text-center">
        <h1 className="text-3xl font-black text-slate-900">Artículo no encontrado</h1>
        <p className="mt-3 text-slate-600">Puede que el enlace haya cambiado.</p>
        <Link to="/blog" className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white" style={{ backgroundColor: BRAND_PINK }}>
          <ArrowLeft className="h-4 w-4" /> Volver al blog
        </Link>
      </div>
    );
  }

  const canonical = `https://ceorentable.com/blog/${post.slug}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    mainEntityOfPage: canonical,
    author: { '@type': 'Organization', name: 'CEO Rentable' },
    publisher: {
      '@type': 'Organization',
      name: 'CEO Rentable',
      url: 'https://ceorentable.com',
      logo: { '@type': 'ImageObject', url: 'https://ceorentable.com/brand/isotipo.png' },
    },
    keywords: post.keywords.join(', '),
    ...(post.faq?.length ? {
      mainEntity: post.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    } : {}),
  };

  const faqSchema = post.faq?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  } : null;

  return (
    <div className="min-h-screen bg-[#fbf8fa] text-slate-900">
      <BlogSeo
        title={`${post.title} | CEO Rentable`}
        description={post.description}
        canonical={canonical}
        keywords={post.keywords}
        type="article"
        publishedTime={post.date}
        schema={faqSchema ? [schema, faqSchema] : schema}
      />

      <header className="border-b border-rose-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/blog" className="flex items-center gap-3" aria-label="CEO Rentable Blog">
            <img src="/brand/isotipo.png" alt="CEO Rentable" className="h-11 w-11 rounded-full object-contain" />
            <div>
              <div className="text-lg font-bold leading-tight">CEO Rentable</div>
              <div className="text-xs text-slate-500">Blog</div>
            </div>
          </Link>
          <Link to="/diagnostico" className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm" style={{ backgroundColor: BRAND_PINK }}>
            Diagnóstico gratis
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-rose-100 bg-white">
          <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
            <Link to="/blog" className="inline-flex items-center gap-2 text-sm font-bold text-rose-700">
              <ArrowLeft className="h-4 w-4" /> Volver al blog
            </Link>
            <div className="mt-7 inline-flex rounded-full bg-rose-50 px-3 py-1.5 text-sm font-bold text-rose-700">{post.category}</div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{post.title}</h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">{post.excerpt}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {formatDate(post.date)}</span>
              <span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4" /> {post.readTime} de lectura</span>
            </div>
          </div>
        </section>

        <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="mb-10 rounded-3xl bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50 px-6 py-10 sm:px-10">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-rose-700">CEO Rentable</p>
            <p className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">{post.hero}</p>
          </div>

          <div className="space-y-12">
            {post.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-4 text-[17px] leading-8 text-slate-700">{paragraph}</p>
                ))}
                {section.bullets?.length ? (
                  <ul className="mt-5 space-y-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 text-[17px] leading-7 text-slate-700">
                        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-rose-600" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {post.faq?.length ? (
            <section className="mt-14 border-t border-slate-200 pt-12">
              <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">Preguntas frecuentes</h2>
              <div className="mt-6 space-y-4">
                {post.faq.map((item) => (
                  <div key={item.q} className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
                    <h3 className="font-bold text-slate-900">{item.q}</h3>
                    <p className="mt-2 leading-7 text-slate-600">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-14 rounded-3xl bg-slate-950 px-6 py-9 text-white sm:px-9">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-rose-300">Llévalo a tus números</p>
            <h2 className="mt-3 text-3xl font-black">Descubre qué está pasando realmente con tu negocio</h2>
            <p className="mt-4 max-w-2xl leading-7 text-slate-300">Haz el diagnóstico de CEO Rentable y encuentra el área que más necesita atención.</p>
            <Link to="/diagnostico" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">
              Hacer diagnóstico gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
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
