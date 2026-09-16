import { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { LanguageContext } from './context/LanguageContext'
import { ThemeContext } from './context/ThemeContext'
import { useLanguage } from './hooks/useLanguage'
import { useTheme } from './hooks/useTheme'
import { supabase } from './lib/supabase'
import { HomePage } from './pages/Home'
import { ProductsPage } from './pages/Products'
import { ProductDetailsPage } from './pages/ProductDetails'
import { CategoriesPage } from './pages/Categories'
import { CategoryPage } from './pages/Categories/CategoryPage'
import { ContactPage } from './pages/Contact'
import { AdminLoginPage } from './pages/Admin/LoginPage'
import { AdminDashboard } from './pages/Admin/DashboardPage'
import { AdminProductsPage } from './pages/Admin/ProductsPage'
import { ProductFormPage } from './pages/Admin/ProductFormPage'
import { AdminCategoriesPage } from './pages/Admin/CategoriesPage'
import { AdminOrdersPage } from './pages/Admin/OrdersPage'
import { AdminChatPage } from './pages/Admin/ChatPage'
import { AdminAccountPage } from './pages/Admin/AccountPage'
import { AdminUsersPage } from './pages/Admin/UsersPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { ProtectedRoute } from './pages/Admin/ProtectedRoute'

// Détecte les liens d'invitation / reset-password et redirige vers /set-password
function AuthRedirectHandler() {
  const navigate = useNavigate()
  const handledRef = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (handledRef.current) return
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        const hash = window.location.hash
        if (hash.includes('type=invite') || hash.includes('type=recovery') || event === 'PASSWORD_RECOVERY') {
          handledRef.current = true
          navigate('/set-password', { replace: true })
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  return null
}

function AppContent() {
  const lang = useLanguage()
  const theme = useTheme()

  return (
    <ThemeContext.Provider value={theme}>
      <LanguageContext.Provider value={lang}>
        <AuthRedirectHandler />
        <Routes>
          {/* Public */}
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:slug" element={<ProductDetailsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/categories/:slug" element={<CategoryPage />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Invitation / reset password — pas de ProtectedRoute */}
          <Route path="/set-password" element={<SetPasswordPage />} />

          {/* Admin — authentification */}
          <Route path="/admin/login" element={<AdminLoginPage />} />

          {/* Admin — routes protégées (agent + admin) */}
          <Route path="/admin" element={<ProtectedRoute requiredRole="agent"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/chat" element={<ProtectedRoute requiredRole="agent"><AdminChatPage /></ProtectedRoute>} />
          <Route path="/admin/orders" element={<ProtectedRoute requiredRole="agent"><AdminOrdersPage /></ProtectedRoute>} />
          <Route path="/admin/account" element={<ProtectedRoute requiredRole="agent"><AdminAccountPage /></ProtectedRoute>} />

          {/* Admin — routes protégées (admin uniquement) */}
          <Route path="/admin/products" element={<ProtectedRoute requiredRole="admin"><AdminProductsPage /></ProtectedRoute>} />
          <Route path="/admin/products/new" element={<ProtectedRoute requiredRole="admin"><ProductFormPage /></ProtectedRoute>} />
          <Route path="/admin/products/:id/edit" element={<ProtectedRoute requiredRole="admin"><ProductFormPage /></ProtectedRoute>} />
          <Route path="/admin/categories" element={<ProtectedRoute requiredRole="admin"><AdminCategoriesPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><AdminUsersPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </LanguageContext.Provider>
    </ThemeContext.Provider>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
