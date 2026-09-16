import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageContext } from './context/LanguageContext'
import { ThemeContext } from './context/ThemeContext'
import { useLanguage } from './hooks/useLanguage'
import { useTheme } from './hooks/useTheme'
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
import { ProtectedRoute } from './pages/Admin/ProtectedRoute'

function AppContent() {
  const lang = useLanguage()
  const theme = useTheme()

  return (
    <ThemeContext.Provider value={theme}>
      <LanguageContext.Provider value={lang}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:slug" element={<ProductDetailsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/categories/:slug" element={<CategoryPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/products" element={<ProtectedRoute><AdminProductsPage /></ProtectedRoute>} />
          <Route path="/admin/products/new" element={<ProtectedRoute><ProductFormPage /></ProtectedRoute>} />
          <Route path="/admin/products/:id/edit" element={<ProtectedRoute><ProductFormPage /></ProtectedRoute>} />
          <Route path="/admin/categories" element={<ProtectedRoute><AdminCategoriesPage /></ProtectedRoute>} />
          <Route path="/admin/orders" element={<ProtectedRoute><AdminOrdersPage /></ProtectedRoute>} />
          <Route path="/admin/chat" element={<ProtectedRoute><AdminChatPage /></ProtectedRoute>} />
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
