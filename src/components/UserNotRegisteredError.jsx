import React from 'react';

const UserNotRegisteredError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-[#F7D8E5] px-4">
      <div className="max-w-md w-full p-8 bg-white rounded-3xl shadow-xl border border-[#EBC7D7]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-[#D45387]/10">
            <svg className="w-8 h-8 text-[#D45387]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Perfil no disponible</h1>
          <p className="text-slate-600 mb-8">
            Tu cuenta de autenticacion existe, pero todavia no encontramos tu perfil dentro de CEO Rentable OS.
          </p>
          <div className="p-4 bg-[#F7F3EE] rounded-2xl text-sm text-slate-600 text-left">
            <p className="font-semibold text-slate-800">Que puedes hacer ahora:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Verifica que iniciaste sesion con el correo correcto.</li>
              <li>Si acabas de registrarte, confirma tu correo y vuelve a entrar.</li>
              <li>Si el problema continua, solicita soporte para crear o reparar tu perfil.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
