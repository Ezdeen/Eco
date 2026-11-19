import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
const orgName = process.env.ORG_NAME || 'Eco Ledger'
if (!email || !password) { console.error('ADMIN_EMAIL و ADMIN_PASSWORD مطلوبان'); process.exit(1) }

const db = new PrismaClient()
try {
  const org = await db.organization.upsert({
    where: { code: 'ECO' },
    update: {},
    create: { name: orgName, code: 'ECO' },
  })
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash, role: 'org_admin' },
    create: { email, name: 'Admin', passwordHash, role: 'org_admin' },
  })
  await db.userMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: { role: 'org_admin', status: 'active' },
    create: { userId: user.id, organizationId: org.id, role: 'org_admin', status: 'active' },
  })
  console.log('تم إنشاء الحساب:', email)
} finally {
  await db.$disconnect()
}
