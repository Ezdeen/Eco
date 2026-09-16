export const locales = ['ar', 'en'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'ar'

export const appCopy = {
  ar: {
    appName: 'منصة ESG',
    appNameLong: 'منصة ESG الشمسية',
    loading: 'جاري التحقق من الجلسة...',
    search: 'بحث...',
    language: 'اللغة',
    logout: 'تسجيل الخروج',
    logoutSuccess: 'تم تسجيل الخروج بنجاح',
    logoutError: 'فشل تسجيل الخروج',
    lastUpdated: 'آخر تحديث:',
    user: 'المستخدم:',
    userLabel: 'مستخدم',
    dataEntry: 'مدخل بيانات',
    createProject: 'إنشاء مشروع جديد',
    dataEntryDescription: 'صلاحية حسابك تقتصر على إدخال بيانات مشروع جديد فقط. لا يمكنك الوصول إلى أقسام أخرى بالمنصة.',
    projectCreated: 'تم إنشاء المشروع بنجاح',
    platformDescription: 'منصة dMRV للمنشآت الصغيرة والمتوسطة',
    accessDenied: 'هذا القسم متاح فقط لمدير المؤسسة',
  },
  en: {
    appName: 'ESG Platform',
    appNameLong: 'Solar ESG Platform',
    loading: 'Checking session...',
    search: 'Search...',
    language: 'Language',
    logout: 'Log out',
    logoutSuccess: 'Logged out successfully',
    logoutError: 'Could not log out',
    lastUpdated: 'Last updated:',
    user: 'User:',
    userLabel: 'User',
    dataEntry: 'Data entry',
    createProject: 'Create a new project',
    dataEntryDescription: 'Your account can only enter data for a new project. You cannot access other platform sections.',
    projectCreated: 'Project created successfully',
    platformDescription: 'dMRV platform for SMEs',
    accessDenied: 'This section is only available to the organization administrator',
  },
} as const
