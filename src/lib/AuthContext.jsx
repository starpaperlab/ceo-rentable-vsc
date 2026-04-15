import React, { createContext, useContext } from 'react'
import { useProvideAuth } from '@/hooks/useAuth'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const auth = useProvideAuth()

  return (
    <AuthContext.Provider value={{
      ...auth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider')
  }
  return context
}
