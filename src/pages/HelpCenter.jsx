import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, GraduationCap, LayoutDashboard, Package, Receipt, CreditCard,
  Target, Settings, BookOpen, PlayCircle, CheckCircle2, ChevronRight,
  Sparkles, HelpCircle, ArrowLeft, RotateCcw
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

const MODULES = [
  {
    id: 'm1',
    number: 1,
    title: 'Conociendo CEO Rentable',
    description: 'Empieza por aquí y conoce la estructura principal del sistema.',
    lessons: [
      {
        key: 'm1-l1',
        number: 1,
        title: 'Conociendo la interfaz principal',
        youtubeId: 'Ly_UIS-Fe4U',
        description: 'Recorre la interfaz principal de CEO Rentable y ubica las áreas esenciales del sistema.',
      },
      {
        key: 'm1-l2',
        number: 2,
        title: 'Visión 360 y CEO Score™',
        youtubeId: 'x4WWC2jHHTM',
        description: 'Conoce la Visión 360 de tu negocio y aprende a interpretar tu CEO Score™ desde el dashboard.',
      },
    ],
  },
  {
    id: 'm2',
    number: 2,
    title: 'Configura tu negocio',
    description: 'Prepara la información y configuración de tu empresa para trabajar correctamente dentro de CEO Rentable.',
    lessons: [
      {
        key: 'm2-l1',
        number: 1,
        title: 'Configura tu negocio',
        youtubeId: 'OKImPNhzN4o',
        description: 'Configura los datos principales de tu negocio y deja CEO Rentable preparado para tu operación.',
      },
    ],
  },
];

const FINANCE_CONCEPTS = [
  { term:'Rentabilidad', plain:'Te dice si el esfuerzo y el dinero que pones en tu negocio realmente están produciendo una ganancia suficiente.', example:'Si vendes $1,700, no significa que ganaste $1,700. La rentabilidad mira lo que queda después de considerar los costos.' },
  { term:'Ganancia o utilidad', plain:'Es el dinero que queda después de restar a tus ventas todos los costos y gastos que corresponden.', example:'Vendiste $170 y entre producir y operar gastaste $120: tu ganancia es $50.' },
  { term:'Margen de ganancia', plain:'Es qué porcentaje de cada venta termina convirtiéndose en ganancia.', example:'Si vendes algo en $100 y ganas $30, tu margen es 30%.' },
  { term:'Markup', plain:'Es cuánto aumentas el costo para construir el precio de venta. No es lo mismo que margen.', example:'Si algo cuesta $10 y agregas 50% sobre ese costo, el precio sería $15.' },
  { term:'Costos fijos', plain:'Son gastos que normalmente debes pagar aunque vendas poco o no vendas ese mes.', example:'Alquiler, internet, ciertos salarios o suscripciones.' },
  { term:'Costos variables', plain:'Son costos que aumentan o disminuyen según lo que produces o vendes.', example:'Ingredientes, empaques, materiales o comisiones por venta.' },
  { term:'Punto de equilibrio', plain:'Es el nivel de ventas en el que cubres tus costos, pero todavía no has generado ganancia.', example:'Por debajo pierdes dinero; al llegar al punto de equilibrio cubres tus costos; por encima comienzas a generar ganancia.' },
  { term:'Cuentas por cobrar', plain:'Es dinero que tus clientes todavía te deben por ventas que ya realizaste.', example:'Entregaste un pedido de $135 y el cliente pagó $85: quedan $50 por cobrar.' },
  { term:'Flujo de caja', plain:'Muestra el dinero que realmente entra y sale de tu negocio en un período.', example:'Puedes tener ventas registradas y aun así tener poco efectivo disponible si tus clientes todavía no te han pagado.' },
];

const HELP_CATEGORIES = [
  { key:'academy', title:'Academia CEO Rentable', description:'Curso paso a paso para dominar el sistema.', icon:GraduationCap, academy:true },
  { key:'dashboard', title:'Dashboard y CEO Score™', description:'Entiende tus indicadores y la salud de tu negocio.', icon:LayoutDashboard },
  { key:'products', title:'Productos, servicios y rentabilidad', description:'Costos, precios, márgenes y productos rentables.', icon:Package },
  { key:'billing', title:'Cotizaciones y facturas', description:'Crea, envía y gestiona documentos comerciales.', icon:Receipt },
  { key:'receivables', title:'Cuentas por cobrar', description:'Da seguimiento a saldos y pagos pendientes.', icon:CreditCard },
  { key:'pipeline', title:'Pipeline y clientes', description:'Organiza oportunidades y seguimiento comercial.', icon:Target },
  { key:'concepts', title:'Conceptos financieros sin complicaciones', description:'Rentabilidad, margen, punto de equilibrio y otros términos explicados en lenguaje sencillo.', icon:BookOpen, concepts:true },
  { key:'guides', title:'Guías de rentabilidad', description:'Conceptos y acciones para tomar mejores decisiones.', icon:BookOpen, path:'/Learn' },
  { key:'settings', title:'Configuración de tu negocio', description:'Personaliza los datos y preferencias de tu empresa.', icon:Settings },
];

function YouTubeLessonPlayer({ videoId, title, moduleNumber = 1, lessonNumber, onEnded }) {
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    let cancelled = false;
    const create = () => {
      if (cancelled || !mountRef.current || !window.YT?.Player || playerRef.current) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: {
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 1,
          controls: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) setStarted(true);
            if (event.data === window.YT.PlayerState.ENDED) {
              setEnded(true);
              onEndedRef.current?.();
            }
          },
        },
      });
    };

    if (window.YT?.Player) create();
    else {
      const existing = document.querySelector('script[data-ceo-youtube-api]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.ceoYoutubeApi = '1';
        document.head.appendChild(script);
      }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        create();
      };
    }
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
    };
  }, [videoId]);

  const startVideo = () => {
    if (!ready || !playerRef.current) return;
    setEnded(false);
    setStarted(true);
    playerRef.current.playVideo?.();
  };

  const replay = () => {
    setEnded(false);
    setStarted(true);
    playerRef.current?.seekTo?.(0, true);
    playerRef.current?.playVideo?.();
  };

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#171217] shadow-xl">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {!started && !ended ? (
        <button
          type="button"
          onClick={startVideo}
          disabled={!ready}
          className="group absolute inset-0 z-10 block h-full w-full overflow-hidden bg-[#171217] text-left disabled:cursor-wait"
          aria-label={ready ? `Reproducir ${title}` : 'Preparando video'}
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/15 transition group-hover:bg-black/25" />
          <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#B83E70] shadow-sm">
            Academia CEO Rentable
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D45387] text-white shadow-2xl transition group-hover:scale-105">
              <PlayCircle className="h-8 w-8" />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-5 pt-14">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">Módulo {moduleNumber} · Lección {lessonNumber}</p>
            <p className="mt-1 text-base font-bold text-white sm:text-lg">{ready ? title : 'Preparando la lección…'}</p>
          </div>
        </button>
      ) : null}

      {ended ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#171217] p-6 text-center">
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#D45387]/15">
              <CheckCircle2 className="h-7 w-7 text-[#D45387]" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-white">Lección completada</h3>
            <p className="mt-2 text-sm text-white/65">Continúa tu aprendizaje dentro de CEO Rentable.</p>
            <Button onClick={replay} variant="outline" className="mt-5 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <RotateCcw className="mr-2 h-4 w-4" /> Ver de nuevo
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function HelpCenter() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('home');
  const [activeLesson, setActiveLesson] = useState(null);

  const lessonsWithModule = useMemo(
    () => MODULES.flatMap(module => module.lessons.map(lesson => ({ ...lesson, moduleNumber: module.number }))),
    []
  );

  useEffect(() => {
    const section = searchParams.get('seccion');
    const isAcademy = section === 'academia';
    const lessonKey = searchParams.get('leccion');
    if (section === 'conceptos') {
      setView('concepts');
      setActiveLesson(null);
      return;
    }
    if (!isAcademy) {
      setView('home');
      setActiveLesson(null);
      return;
    }
    setView('academy');
    setActiveLesson(lessonKey ? lessonsWithModule.find(lesson => lesson.key === lessonKey) || null : null);
  }, [searchParams, lessonsWithModule]);

  const openAcademy = () => {
    setView('academy');
    setActiveLesson(null);
    setSearchParams({ seccion: 'academia' });
  };

  const openLesson = (lesson, moduleNumber) => {
    const selected = { ...lesson, moduleNumber };
    setView('academy');
    setActiveLesson(selected);
    setSearchParams({ seccion: 'academia', leccion: lesson.key });
  };

  const backToAcademy = () => {
    setActiveLesson(null);
    setSearchParams({ seccion: 'academia' });
  };

  const backToHelpCenter = () => {
    setView('home');
    setActiveLesson(null);
    setSearchParams({});
  };

  const { data: progressRows = [] } = useQuery({
    queryKey: ['academy-progress', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('academy_progress').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const completed = useMemo(() => new Set(progressRows.filter(x => x.completed).map(x => x.lesson_key)), [progressRows]);
  const allLessons = MODULES.flatMap(m => m.lessons);
  const progressPct = allLessons.length ? Math.round((allLessons.filter(l => completed.has(l.key)).length / allLessons.length) * 100) : 0;
  const activeLessonIndex = activeLesson ? lessonsWithModule.findIndex(lesson => lesson.key === activeLesson.key) : -1;
  const previousLesson = activeLessonIndex > 0 ? lessonsWithModule[activeLessonIndex - 1] : null;
  const nextLesson = activeLessonIndex >= 0 && activeLessonIndex < lessonsWithModule.length - 1 ? lessonsWithModule[activeLessonIndex + 1] : null;

  const markComplete = async (lesson) => {
    if (!user?.id) return;
    await supabase.from('academy_progress').upsert({
      user_id: user.id,
      lesson_key: lesson.key,
      completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,lesson_key' });
    queryClient.invalidateQueries({ queryKey: ['academy-progress', user.id] });
  };

  const filteredCategories = HELP_CATEGORIES.filter(c =>
    !search || (c.title + ' ' + c.description).toLowerCase().includes(search.toLowerCase())
  );

  const openCategory = (category) => {
    if (category.academy) { openAcademy(); return; }
    if (category.concepts) { setView('concepts'); setActiveLesson(null); setSearchParams({ seccion: 'conceptos' }); return; }
    if (category.path) { navigate(category.path); return; }
    setSearch(category.title);
  };

  if (view === 'concepts') {
    return (
      <div className="min-h-full bg-gradient-to-b from-[#FFF7FA] via-background to-background">
        <div className="mx-auto max-w-5xl p-4 lg:p-8">
          <Button variant="ghost" className="mb-4 -ml-2 text-muted-foreground" onClick={backToHelpCenter}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Centro de Ayuda
          </Button>
          <div className="rounded-3xl border border-[#F1D7E2] bg-white p-6 shadow-sm lg:p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#D45387]/10 px-3 py-1.5 text-xs font-bold text-[#B83E70]">
              <BookOpen className="h-4 w-4" /> APRENDE SIN COMPLICACIONES
            </div>
            <h1 className="mt-3 text-2xl font-bold lg:text-3xl">Conceptos financieros que necesitas conocer</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">No necesitas ser contadora para entender tus números. Aquí explicamos cada término como lo usarías en tu negocio, con ejemplos sencillos.</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {FINANCE_CONCEPTS.map(item => (
              <Card key={item.term} className="border-[#F0DCE5] p-5">
                <h2 className="text-lg font-bold">{item.term}</h2>
                <p className="mt-2 text-sm leading-6 text-foreground/80">{item.plain}</p>
                <div className="mt-4 rounded-xl bg-[#FFF4F8] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#B83E70]">Ejemplo sencillo</p>
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{item.example}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'academy') {
    return (
      <div className="min-h-full bg-gradient-to-b from-[#FFF7FA] via-background to-background">
        <div className="mx-auto max-w-6xl p-4 lg:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="-ml-2 text-muted-foreground" onClick={backToHelpCenter}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Centro de Ayuda
            </Button>
            {activeLesson ? (
              <>
                <span className="text-muted-foreground/50">/</span>
                <Button variant="ghost" className="px-2 text-[#B83E70]" onClick={backToAcademy}>
                  Academia · Todas las lecciones
                </Button>
              </>
            ) : null}
          </div>

          <div className="rounded-3xl border border-[#F1D7E2] bg-white p-6 shadow-sm lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#D45387]/10 px-3 py-1.5 text-xs font-bold text-[#B83E70]">
                  <GraduationCap className="h-4 w-4" /> ACADEMIA CEO RENTABLE
                </div>
                <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Aprende a dominar CEO Rentable</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Lecciones cortas y prácticas para aplicar cada función directamente en tu negocio.</p>
              </div>
              <div className="min-w-[220px] rounded-2xl bg-[#FFF4F8] p-4">
                <div className="flex items-center justify-between text-sm"><span className="font-medium">Tu progreso</span><strong>{progressPct}%</strong></div>
                <Progress value={progressPct} className="mt-3 h-2" />
              </div>
            </div>
          </div>

          {activeLesson ? (
            <>
              <Card className="mt-6 overflow-hidden border-[#F0DCE5]">
                <div className="flex items-center justify-between border-b bg-[#FFF9FB] p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#B83E70]">Contenido de la Academia</p>
                    <p className="mt-1 text-sm text-muted-foreground">{MODULES.length} módulos · {allLessons.length} lecciones disponibles</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={backToAcademy}>Ver todo</Button>
                </div>
                <div className="divide-y">
                  {MODULES.map(module => (
                    <div key={module.id} className="p-4">
                      <p className="mb-2 text-xs font-bold text-[#B83E70]">MÓDULO {module.number} · {module.title}</p>
                      <div className="flex flex-wrap gap-2">
                        {module.lessons.map(lesson => {
                          const isActive = activeLesson.key === lesson.key;
                          return (
                            <button
                              key={lesson.key}
                              type="button"
                              onClick={() => openLesson(lesson, module.number)}
                              className={`rounded-full border px-3 py-2 text-left text-xs font-medium transition ${isActive ? 'border-[#D45387] bg-[#D45387] text-white' : 'border-[#F0DCE5] bg-white hover:bg-[#FFF4F8]'}`}
                            >
                              {completed.has(lesson.key) ? '✓ ' : ''}L{lesson.number} · {lesson.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="mt-6">
                <div>
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#B83E70]">Módulo {activeLesson.moduleNumber} · Lección {activeLesson.number}</p>
                  <h2 className="mt-1 text-2xl font-bold">{activeLesson.title}</h2>
                </div>
                <YouTubeLessonPlayer videoId={activeLesson.youtubeId} title={activeLesson.title} moduleNumber={activeLesson.moduleNumber} lessonNumber={activeLesson.number} onEnded={() => markComplete(activeLesson)} />
                <Card className="mt-5 p-5">
                  <h3 className="font-semibold">Sobre esta lección</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeLesson.description}</p>
                  <button
                    type="button"
                    onClick={() => { setView('concepts'); setActiveLesson(null); setSearchParams({ seccion: 'conceptos' }); }}
                    className="mt-4 flex w-full items-center justify-between rounded-xl border border-[#F0DCE5] bg-[#FFF9FB] p-4 text-left transition hover:bg-[#FFF4F8]"
                  >
                    <div>
                      <p className="text-sm font-semibold">¿Hay algún término que no entiendes?</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Consulta rentabilidad, margen, punto de equilibrio y otros conceptos.</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#B83E70]" />
                  </button>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button onClick={() => markComplete(activeLesson)} className="bg-[#D45387] hover:bg-[#BC4778]">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> {completed.has(activeLesson.key) ? 'Completada' : 'Marcar como completada'}
                    </Button>
                    <Button variant="outline" onClick={backToAcademy}><ArrowLeft className="mr-2 h-4 w-4" /> Todas las lecciones</Button>
                    {previousLesson ? (
                      <Button variant="outline" onClick={() => openLesson(previousLesson, previousLesson.moduleNumber)}>Lección anterior</Button>
                    ) : null}
                    {nextLesson ? (
                      <Button onClick={() => openLesson(nextLesson, nextLesson.moduleNumber)} className="bg-[#171217] text-white hover:bg-[#2b222b]">Siguiente lección <ChevronRight className="ml-2 h-4 w-4" /></Button>
                    ) : null}
                  </div>
                </Card>
              </div>
              </div>
            </>
          ) : (
            <div className="mt-6 space-y-4">
              {MODULES.map(module => (
                <Card key={module.id} className="overflow-hidden border-[#F0DCE5]">
                  <div className="border-b bg-[#FFF9FB] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#B83E70]">Módulo {module.number}</p>
                    <h2 className="mt-1 text-xl font-bold">{module.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                  </div>
                  <div>
                    {module.lessons.map(lesson => (
                      <button key={lesson.key} onClick={() => openLesson(lesson, module.number)} className="flex w-full items-center gap-4 p-5 text-left transition hover:bg-[#FFF7FA]">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${completed.has(lesson.key)?'bg-emerald-100 text-emerald-700':'bg-[#D45387]/10 text-[#B83E70]'}`}>
                          {completed.has(lesson.key) ? <CheckCircle2 className="h-5 w-5"/> : <PlayCircle className="h-5 w-5"/>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">Lección {lesson.number}</p>
                          <h3 className="font-semibold">{lesson.title}</h3>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground"/>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <section className="border-b border-[#F0D8E2] bg-gradient-to-br from-[#FFF3F8] via-[#FFF9FB] to-white">
        <div className="mx-auto max-w-6xl px-4 py-10 text-center lg:px-8 lg:py-14">
          <img src="/brand/isotipo.png" alt="CEO Rentable" className="mx-auto mb-4 h-12 w-12 object-contain" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#B83E70]">CEO RENTABLE OS™</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">Centro de Ayuda</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Encuentra tutoriales, aprende a usar cada módulo y sácale más provecho a CEO Rentable.</p>
          <div className="relative mx-auto mt-7 max-w-2xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="¿En qué podemos ayudarte?" className="h-14 rounded-2xl border-[#E8CCD8] bg-white pl-12 pr-4 text-base shadow-sm focus-visible:ring-[#D45387]" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 p-4 py-8 lg:p-8">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#D45387]" />
            <h2 className="text-xl font-bold">¿Qué necesitas aprender?</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCategories.map(category => (
              <button key={category.key} onClick={() => openCategory(category)} className="group text-left">
                <Card className="h-full p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#E3AFC5] hover:shadow-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D45387]/10 text-[#B83E70]">
                    <category.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-bold">{category.title}</h3>
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{category.description}</p>
                  <div className="mt-4 flex items-center text-xs font-semibold text-[#B83E70]">Ver contenido <ChevronRight className="ml-1 h-3.5 w-3.5 transition group-hover:translate-x-1"/></div>
                </Card>
              </button>
            ))}
          </div>
          {filteredCategories.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">No encontramos contenido con esa búsqueda todavía.</Card> : null}
        </section>

        <section className="rounded-3xl border border-[#F0D8E2] bg-[#FFF7FA] p-6 lg:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#B83E70]"><Sparkles className="h-4 w-4"/> Empieza aquí</div>
              <h2 className="mt-2 text-2xl font-bold">Academia CEO Rentable</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Aprende el sistema paso a paso con lecciones en video y lleva el control de tu progreso.</p>
            </div>
            <Button onClick={() => setView('academy')} className="h-11 bg-[#D45387] px-5 hover:bg-[#BC4778]">
              <GraduationCap className="mr-2 h-4 w-4"/> Entrar a la Academia
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
