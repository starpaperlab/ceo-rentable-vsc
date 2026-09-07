import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/index.css'

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot(rootElement)

function StartupError({ error }) {
  const message = error?.message || 'Error desconocido al iniciar la aplicación.'

  return (
    <div className="min-h-screen bg-[#F7F3EE] flex items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-sm p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">No pudimos iniciar CEO Rentable</h1>
        <p className="text-sm text-slate-600 mb-4">
          La vista previa encontró un error de configuración o ejecución.
        </p>
        <pre className="text-left whitespace-pre-wrap break-words rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 overflow-auto">
          {message}
        </pre>
      </div>
    </div>
  )
}

async function bootstrap() {
  try {
    const { default: App } = await import('./App.jsx')
    root.render(<App />)
  } catch (error) {
    console.error('Error al iniciar CEO Rentable:', error)
    root.render(<StartupError error={error} />)
  }
}

bootstrap()
