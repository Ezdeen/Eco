export const locales = ['ar', 'en'] as const
export type Locale = (typeof locales)[number]

export const appCopy = {
  ar: {
    appName: 'منصة ESG',
    appNameLong: 'منصة ESG الشمسية',
    loading: 'جاري التحقق من الجلسة...',
    search: 'بحث...',
    language: 'اللغة',
    logout: 'تسجيل الخروج',
    lastUpdated: 'آخر تحديث:',
    user: 'المستخدم:',
    userLabel: 'مستخدم',
    dataEntry: 'مدخل بيانات',
    loginTitle: 'تسجيل الدخول',
    welcome: 'أهلاً',
    account: 'حساب',
    menu: 'القائمة',
    english: 'EN',
    arabic: 'AR',
  },
  en: {
    appName: 'ESG Platform',
    appNameLong: 'ESG Platform',
    loading: 'Checking session...',
    search: 'Search...',
    language: 'Language',
    logout: 'Log out',
    lastUpdated: 'Last updated:',
    user: 'User:',
    userLabel: 'User',
    dataEntry: 'Data entry',
    loginTitle: 'Login',
    welcome: 'Welcome',
    account: 'Account',
    menu: 'Menu',
    english: 'EN',
    arabic: 'AR',
  },
} as const

export const defaultLocale: Locale = 'ar'
