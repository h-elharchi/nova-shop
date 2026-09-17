import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageContext } from './context/LanguageContext'
import { ThemeContext } from './context/ThemeContext'
import { AgentProvider } from './context/AgentContext'
import { useLanguage } from './hooks/useLanguage'
import { useTheme } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'
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
import { AdminAccountPage } from './pages/Admin/AccountPage'
import { AdminUsersPage } from './pages/Admin/UsersPage'
import { CRCSettingsPage } from './pages/Admin/CRCSettingsPage'
import { SupervisionPage } from './pages/Admin/SupervisionPage'
import { HistoryPage } from './pages/Admin/HistoryPage'
import { CustomersPage } from './pages/Admin/CustomersPage'
import { EmailSettingsPage } from './pages/Admin/EmailSettingsPage'
import { WorkspacePage } from './pages/Admin/WorkspacePage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { ProtectedRoute } from './pages/Admin/ProtectedRoute'

// Les liens d'invitation et de récupération de mot de passe sont interceptés dans
// index.html avant que React charge (les tokens hash sont capturés en sessionStorage
// et le hash est remplacé par #/set-password). Ce composant n'est plus nécessaire
// pour ces flux mais reste en place au cas où Supabase enverrait l'événement
// PASSWORD_RECOVERY sans hash (ex. flux PKCE futur).
function AuthRedirectHandler() {
  return null
}

function AppContent() {
  const lang = useLanguage()
  const theme = useTheme()
  const { user } = useAuth()

  return (
    <ThemeContext.Provider value={theme}>
      <LanguageContext.Provider value={lang}>
        <AgentProvider userId={user?.id ?? null}>
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
          <Route path="/admin/workspace"    element={<ProtectedRoute requiredRole="agent"><WorkspacePage /></ProtectedRoute>} />
          {/* Redirections : anciennes routes → workspace */}
          <Route path="/admin/chat"         element={<Navigate to="/admin/workspace" replace />} />
          <Route path="/admin/email"        element={<Navigate to="/admin/workspace" replace />} />
          <Route path="/admin/orders"       element={<ProtectedRoute requiredRole="agent"><AdminOrdersPage /></ProtectedRoute>} />
          <Route path="/admin/account"      element={<ProtectedRoute requiredRole="agent"><AdminAccountPage /></ProtectedRoute>} />

          {/* Admin — routes protégées (admin uniquement) */}
          <Route path="/admin/products"          element={<ProtectedRoute requiredRole="admin"><AdminProductsPage /></ProtectedRoute>} />
          <Route path="/admin/products/new"      element={<ProtectedRoute requiredRole="admin"><ProductFormPage /></ProtectedRoute>} />
          <Route path="/admin/products/:id/edit" element={<ProtectedRoute requiredRole="admin"><ProductFormPage /></ProtectedRoute>} />
          <Route path="/admin/categories"        element={<ProtectedRoute requiredRole="admin"><AdminCategoriesPage /></ProtectedRoute>} />
          <Route path="/admin/users"             element={<ProtectedRoute requiredRole="admin"><AdminUsersPage /></ProtectedRoute>} />
          <Route path="/admin/supervision"       element={<ProtectedRoute requiredRole="admin"><SupervisionPage /></ProtectedRoute>} />
          <Route path="/admin/crc-settings"      element={<ProtectedRoute requiredRole="admin"><CRCSettingsPage /></ProtectedRoute>} />

          {/* Admin — routes protégées (agent + admin) */}
          <Route path="/admin/history"        element={<ProtectedRoute requiredRole="agent"><HistoryPage /></ProtectedRoute>} />
          <Route path="/admin/customers"      element={<ProtectedRoute requiredRole="agent"><CustomersPage /></ProtectedRoute>} />
          <Route path="/admin/email-settings" element={<ProtectedRoute requiredRole="admin"><EmailSettingsPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AgentProvider>
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
