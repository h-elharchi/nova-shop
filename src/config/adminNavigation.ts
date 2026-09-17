export interface NavItem {
  to: string
  labelKey: string
  end?: boolean
  badge?: 'waitingCount'
  adminOnly?: boolean
}

export interface NavGroup {
  labelKey: string
  items: NavItem[]
  adminOnly?: boolean
}

export const navGroups: NavGroup[] = [
  {
    labelKey: 'admin.group_activity',
    items: [
      { to: '/admin',           labelKey: 'admin.dashboard',  end: true },
      { to: '/admin/workspace', labelKey: 'admin.workspace',  badge: 'waitingCount' },
      { to: '/admin/orders',    labelKey: 'order.orders'      },
      { to: '/admin/history',   labelKey: 'admin.history'     },
      { to: '/admin/customers', labelKey: 'admin.customers'   },
    ],
  },
  {
    labelKey: 'admin.group_catalogue',
    adminOnly: true,
    items: [
      { to: '/admin/products',    labelKey: 'admin.products',    adminOnly: true },
      { to: '/admin/categories',  labelKey: 'admin.categories',  adminOnly: true },
    ],
  },
  {
    labelKey: 'admin.group_admin',
    adminOnly: true,
    items: [
      { to: '/admin/supervision', labelKey: 'admin.supervision', adminOnly: true },
      { to: '/admin/users',       labelKey: 'admin.users',       adminOnly: true },
      { to: '/admin/settings',    labelKey: 'admin.settings',    adminOnly: true },
    ],
  },
]

// Icônes associées aux routes (importées dans AdminLayout)
export const NAV_ICONS: Record<string, string> = {
  '/admin':             'LayoutDashboard',
  '/admin/workspace':   'Layers',
  '/admin/orders':      'ShoppingCart',
  '/admin/history':     'History',
  '/admin/customers':   'UserRound',
  '/admin/products':    'Package',
  '/admin/categories':  'Tag',
  '/admin/supervision': 'BarChart2',
  '/admin/users':       'Users',
  '/admin/settings':    'Settings',
}

export type IconName = keyof typeof NAV_ICONS
