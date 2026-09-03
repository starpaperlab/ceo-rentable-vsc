import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const CONTACT_EMAIL = 'contacto@espinalguerra.com';
const CONTACT_PHONE = '+1 809-251-7070';

const documents = {
  '/terminos': {
    title: 'Términos de Servicio',
    intro: 'Estos términos regulan el acceso y uso de CEO Rentable OS, incluyendo sus planes de suscripción y período de prueba.',
    sections: [
      ['1. Titularidad y alcance', 'CEO Rentable OS es una marca y producto operado por Espinal Guerra, S.R.L. y Espinal Guerra LLC (en conjunto, “Espinal Guerra”). Al crear una cuenta o utilizar el servicio aceptas estos Términos de Servicio.'],
      ['2. Servicio', 'CEO Rentable es una plataforma de gestión empresarial que ofrece herramientas para organizar información comercial, financiera y operativa. Las funciones disponibles pueden evolucionar como parte del desarrollo del producto.'],
      ['3. Cuenta y seguridad', 'Debes proporcionar información correcta, mantener la confidencialidad de tus credenciales y notificarnos si detectas un acceso no autorizado. Eres responsable de la actividad realizada desde tu cuenta, salvo actividad atribuible a una falla de nuestros sistemas.'],
      ['4. Prueba gratuita y suscripciones', 'Los planes Mensual y Anual incluyen 7 días de prueba gratuita. Al iniciar la prueba eliges una frecuencia de facturación y registras un método de pago. Hoy pagas US$0. Si no cancelas antes de finalizar la prueba, la suscripción se renueva automáticamente según el plan seleccionado: US$21 al mes o US$210 al año.'],
      ['5. Pagos y renovación', 'Los pagos de suscripción se procesan mediante proveedores externos de pago, actualmente PayPal. CEO Rentable no almacena los datos completos de tu tarjeta. Las renovaciones continúan automáticamente hasta que canceles la suscripción.'],
      ['6. Cancelación', 'Puedes cancelar la renovación de tu suscripción. Si cancelas durante el período de prueba antes del primer cobro, no se realizará el cargo inicial. La cancelación impide futuras renovaciones y no elimina obligaciones ya generadas antes de la fecha efectiva de cancelación.'],
      ['7. Uso permitido', 'No puedes utilizar el servicio para actividades ilícitas, intentar acceder a cuentas o sistemas ajenos, interferir con la seguridad de la plataforma, extraer datos de forma abusiva, introducir código malicioso ni revender el acceso sin autorización escrita.'],
      ['8. Propiedad intelectual', 'El software, diseño, identidad visual, documentación, contenidos y demás elementos propios de CEO Rentable pertenecen a sus titulares o licenciantes. La suscripción concede un derecho limitado de uso del servicio y no transfiere propiedad sobre la plataforma.'],
      ['9. Datos del usuario', 'Conservas la titularidad de los datos que incorporas al servicio. Nos autorizas a tratarlos únicamente en la medida necesaria para prestar, proteger, mantener y mejorar el servicio, conforme a nuestra Política de Privacidad.'],
      ['10. Disponibilidad y cambios', 'Podemos realizar mantenimiento, mejoras, cambios de funciones o actualizaciones necesarias para seguridad y continuidad del servicio. Procuraremos minimizar interrupciones y comunicar cambios materiales cuando corresponda.'],
      ['11. Contacto', `Para consultas sobre estos términos puedes escribir a ${CONTACT_EMAIL} o comunicarte al ${CONTACT_PHONE}.`],
    ],
  },
  '/privacidad': {
    title: 'Política de Privacidad',
    intro: 'Explica qué información tratamos, para qué la utilizamos y las medidas aplicadas para protegerla cuando utilizas CEO Rentable.',
    sections: [
      ['1. Responsable y contacto', `CEO Rentable OS es operado por Espinal Guerra, S.R.L. y Espinal Guerra LLC. Para solicitudes relacionadas con privacidad puedes escribir a ${CONTACT_EMAIL} o comunicarte al ${CONTACT_PHONE}.`],
      ['2. Información que recopilamos', 'Podemos tratar datos de registro y cuenta, como nombre, apellido, correo electrónico, teléfono, país, empresa o marca; información necesaria para autenticación; datos que ingresas voluntariamente en las funciones de CEO Rentable; información técnica básica del dispositivo, navegador, dirección IP y registros de seguridad; y datos de suscripción y estado de pago.'],
      ['3. Datos de pago', 'Los datos sensibles del instrumento de pago son procesados por el proveedor de pagos. CEO Rentable recibe información necesaria para identificar la suscripción, su estado, importe y transacciones, pero no almacena los datos completos de tu tarjeta.'],
      ['4. Finalidades', 'Utilizamos los datos para crear y administrar cuentas, autenticar usuarios, prestar las funciones contratadas, gestionar pruebas y suscripciones, brindar soporte, enviar comunicaciones transaccionales, prevenir fraude y abuso, proteger la plataforma, cumplir obligaciones aplicables y, cuando corresponda, mejorar el producto. Las comunicaciones promocionales opcionales se gestionan separadamente de las necesarias para prestar el servicio.'],
      ['5. Proveedores tecnológicos', 'CEO Rentable utiliza proveedores tecnológicos para operar la plataforma, incluyendo infraestructura de alojamiento y despliegue, base de datos y autenticación, procesamiento de pagos y servicios de correo. Entre los proveedores actualmente integrados se encuentran Vercel, Supabase, PayPal y Resend. Estos proveedores procesan información únicamente en el contexto de los servicios tecnológicos que prestan.'],
      ['6. Seguridad', 'Aplicamos controles técnicos y organizativos orientados a proteger la información, incluyendo conexiones cifradas mediante HTTPS/TLS, autenticación de usuarios, controles de acceso, separación de credenciales sensibles del código público, políticas de acceso a base de datos y procesamiento externo de los datos de tarjeta. Revisamos la arquitectura y los permisos a medida que evoluciona el servicio.'],
      ['7. Conservación', 'Conservamos la información mientras tu cuenta o relación contractual esté activa y posteriormente durante el período necesario para atender obligaciones operativas, de seguridad, contables, legales o resolución de controversias. Los períodos pueden variar según el tipo de dato.'],
      ['8. Derechos y solicitudes', `Puedes solicitar acceso, corrección o eliminación de información personal bajo nuestro control, así como gestionar tus preferencias de comunicaciones. Envía la solicitud a ${CONTACT_EMAIL}; podremos solicitar información razonable para verificar la identidad antes de ejecutarla.`],
      ['9. Transferencias y ubicación de proveedores', 'Algunos proveedores tecnológicos pueden procesar datos desde infraestructuras ubicadas fuera de tu país. Seleccionamos proveedores reconocidos y utilizamos sus mecanismos contractuales y de seguridad disponibles para la prestación del servicio.'],
      ['10. Cookies y tecnologías similares', 'Utilizamos cookies y tecnologías similares de acuerdo con nuestra Política de Cookies. Las tecnologías estrictamente necesarias permiten funciones como seguridad, sesión y funcionamiento de la plataforma; las tecnologías no esenciales se gestionarán conforme a las preferencias aplicables.'],
      ['11. Cambios a esta política', 'Podemos actualizar esta política para reflejar cambios del servicio, proveedores o requisitos aplicables. Publicaremos la versión vigente en esta página y señalaremos su fecha de actualización.'],
    ],
  },
  '/cookies': {
    title: 'Política de Cookies',
    intro: 'Describe cómo CEO Rentable utiliza cookies y tecnologías similares para operar, proteger y medir la plataforma.',
    sections: [
      ['1. Qué son las cookies', 'Las cookies son pequeños archivos o identificadores que un sitio o aplicación puede guardar o leer desde tu navegador para recordar información y permitir determinadas funciones.'],
      ['2. Cookies estrictamente necesarias', 'Podemos utilizar tecnologías necesarias para autenticación, mantenimiento de sesión, seguridad, prevención de abuso, preferencias técnicas y funcionamiento esencial. Estas tecnologías son necesarias para prestar las funciones solicitadas.'],
      ['3. Analítica y medición', 'Podemos utilizar tecnologías de medición para comprender el uso de páginas públicas y mejorar la experiencia. CEO Rentable solo debe activar herramientas no esenciales que estén realmente configuradas en la plataforma y, cuando corresponda, sujetas a las preferencias del usuario.'],
      ['4. Marketing', 'Las tecnologías publicitarias o de marketing, cuando estén habilitadas, se utilizarán para medir campañas y comunicaciones comerciales. No consideramos estas tecnologías necesarias para el funcionamiento básico del servicio.'],
      ['5. Terceros', 'Determinadas funciones pueden involucrar proveedores tecnológicos externos. Sus tecnologías se rigen también por sus propios términos y políticas cuando el usuario interactúa con sus servicios.'],
      ['6. Gestión de cookies', 'Puedes controlar o eliminar cookies desde la configuración de tu navegador. El bloqueo de tecnologías estrictamente necesarias puede impedir el inicio de sesión o afectar funciones esenciales de CEO Rentable. Cuando implementemos un gestor de consentimiento para tecnologías no esenciales, podrás modificar esas preferencias desde el propio sitio.'],
      ['7. Contacto', `Para preguntas relacionadas con cookies o privacidad escribe a ${CONTACT_EMAIL} o comunícate al ${CONTACT_PHONE}.`],
    ],
  },
};

export default function Legal() {
  const { pathname } = useLocation();
  const document = documents[pathname] || documents['/privacidad'];

  return (
    <main className="min-h-screen bg-[#F7F3EE] px-4 py-8 sm:px-6 lg:py-12">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl">
        <header className="border-b border-gray-100 px-6 py-8 sm:px-10">
          <Link to="/checkout" className="flex items-center gap-3">
            <img src="/brand/isotipo.png" alt="CEO Rentable OS" className="h-10 w-10" />
            <div><p className="font-black text-gray-900">CEO Rentable OS</p><p className="text-xs text-gray-500">Información legal</p></div>
          </Link>
          <h1 className="mt-8 text-3xl font-black text-gray-900 sm:text-4xl">{document.title}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-gray-600">{document.intro}</p>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-400">Última actualización: 2 de septiembre de 2026</p>
        </header>

        <div className="space-y-8 px-6 py-8 sm:px-10 sm:py-10">
          {document.sections.map(([heading, body]) => (
            <section key={heading}>
              <h2 className="text-lg font-black text-gray-900">{heading}</h2>
              <p className="mt-2 whitespace-pre-line leading-7 text-gray-600">{body}</p>
            </section>
          ))}

          <div className="rounded-2xl bg-gray-50 p-5 text-sm leading-6 text-gray-600">
            <strong className="text-gray-900">Espinal Guerra</strong><br />
            CEO Rentable OS<br />
            <a className="font-semibold text-[#D45387]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />
            <a className="font-semibold text-[#D45387]" href="tel:+18092517070">{CONTACT_PHONE}</a>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-100 pt-6 text-sm font-semibold text-[#D45387]">
            <Link to="/terminos">Términos de Servicio</Link>
            <Link to="/privacidad">Política de Privacidad</Link>
            <Link to="/cookies">Política de Cookies</Link>
            <Link to="/checkout">Volver al checkout</Link>
          </nav>
        </div>
      </article>
    </main>
  );
}
