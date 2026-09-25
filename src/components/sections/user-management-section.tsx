'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Users, UserPlus, Trash2, Edit3, Shield, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface User {
  id: string
  email: string
  name: string | null
  nameAr: string | null
  globalRole: string
  membershipId: string
  role: string
  status: string
  mfaEnabled: boolean
  joinedAt: string
}

const ROLES = [
  { code: 'org_admin', name: 'مدير المؤسسة', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  { code: 'project_manager', name: 'مدير مشروع', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300' },
  { code: 'data_entry', name: 'مدخل بيانات', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
]

const STATUSES: Record<string, { label: string; className: string }> = {
  active: { label: 'نشط', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  suspended: { label: 'موقوف', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  invited: { label: 'مدعو', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
}

export function UserManagementSection() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Add form
  const [addForm, setAddForm] = useState({ email: '', name: '', nameAr: '', password: '', role: 'data_entry' })
  const [showPassword, setShowPassword] = useState(false)

  // Edit form
  const [editRole, setEditRole] = useState('')
  const [editStatus, setEditStatus] = useState('')

  const fetchUsers = useCallback(() => {
    setLoading(true)
    fetch('/api/users')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { if (d && d.users) setUsers(d.users) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleAdd = async () => {
    if (!addForm.email || !addForm.name || !addForm.password) {
      toast.error('يرجى تعبئة جميع الحقول المطلوبة')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل إضافة المستخدم')
        return
      }
      toast.success('تم إضافة المستخدم بنجاح')
      setAddOpen(false)
      setAddForm({ email: '', name: '', nameAr: '', password: '', role: 'data_entry' })
      fetchUsers()
    } catch {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editUser) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole, status: editStatus }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل تحديث المستخدم')
        return
      }
      toast.success('تم تحديث المستخدم بنجاح')
      setEditOpen(false)
      setEditUser(null)
      fetchUsers()
    } catch {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteUser) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/users/${deleteUser.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل إزالة المستخدم')
        return
      }
      toast.success('تم إزالة المستخدم من المؤسسة')
      setDeleteOpen(false)
      setDeleteUser(null)
      fetchUsers()
    } catch {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = (user: User) => {
    setEditUser(user)
    setEditRole(user.role)
    setEditStatus(user.status)
    setEditOpen(true)
  }

  const getRoleInfo = (role: string) => ROLES.find((r) => r.code === role) || ROLES[ROLES.length - 1]
  const getStatusInfo = (status: string) => STATUSES[status] || STATUSES.active

  if (loading) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Users className="h-10 w-10" />
              <div>
                <h2 className="font-cairo text-2xl font-bold">إدارة المستخدمين</h2>
                <p className="text-sm opacity-90">{users.length} عضو في المؤسسة</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => setAddOpen(true)}
              className="bg-white text-emerald-700 hover:bg-white/90"
            >
              <UserPlus className="h-4 w-4 ml-1" />
              إضافة عضو
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أعضاء المؤسسة</CardTitle>
          <CardDescription className="text-xs">إدارة الأدوار والصلاحيات والحالات</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العضو</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>تاريخ الانضمام</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const roleInfo = getRoleInfo(u.role)
                  const statusInfo = getStatusInfo(u.status)
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
                            {(u.nameAr || u.name || u.email).charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.nameAr || u.name}</p>
                            {u.nameAr && u.name && (
                              <p className="text-[10px] text-muted-foreground">{u.name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-mono">{u.email}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${roleInfo.color}`}>
                          {roleInfo.name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusInfo.className}`}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.mfaEnabled ? (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">
                            <Shield className="h-3 w-3 ml-1" /> مفعّل
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">غير مفعّل</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs tabular-nums">
                          {new Date(u.joinedAt).toLocaleDateString('ar-SA')}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(u)}
                            title="تعديل"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => { setDeleteUser(u); setDeleteOpen(true) }}
                            title="إزالة"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              إضافة عضو جديد
            </DialogTitle>
            <DialogDescription>أضف عضوًا جديدًا إلى المؤسسة</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم الكامل *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="أحمد محمد"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم بالعربية</Label>
              <Input
                value={addForm.nameAr}
                onChange={(e) => setAddForm({ ...addForm, nameAr: e.target.value })}
                placeholder="أحمد محمد"
                dir="rtl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">البريد الإلكتروني *</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="user@example.com"
                  className="pr-9"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور *</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="8 أحرف على الأقل"
                  className="pr-9 pl-9"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الدور</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={submitting}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <UserPlus className="h-4 w-4 ml-1" />}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditUser(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-primary" />
              تعديل: {editUser?.nameAr || editUser?.name}
            </DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الدور</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الحالة</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="suspended">موقوف</SelectItem>
                  <SelectItem value="invited">مدعو</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={submitting}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Edit3 className="h-4 w-4 ml-1" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteUser(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              تأكيد إزالة العضو
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إزالة <strong>{deleteUser?.nameAr || deleteUser?.name}</strong> ({deleteUser?.email}) من المؤسسة؟
              <br />
              <br />
              سيُحرم المستخدم من الوصول لبيانات المؤسسة. يمكن إضافته مجددًا لاحقًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {submitting ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Trash2 className="h-4 w-4 ml-1" />}
              نعم، إزالة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
