import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const accounts = await db.impactAccount.findMany({
      include: {
        organization: { select: { name: true, nameAr: true, code: true } },
        impactUnits: {
          include: { project: { select: { name: true, nameAr: true, code: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    const result = accounts.map((acc) => {
      const units = acc.impactUnits
      const byStatus = units.reduce(
        (map, u) => {
          map[u.status] = (map[u.status] || 0) + u.amount
          return map
        },
        {} as Record<string, number>,
      )

      return {
        id: acc.id,
        name: acc.name,
        accountType: acc.accountType,
        balance: acc.balance,
        unit: acc.unit,
        organization: acc.organization,
        unitsCount: units.length,
        byStatus,
        recentUnits: units.slice(0, 10).map((u) => ({
          id: u.id,
          project: u.project,
          amount: u.amount,
          unit: u.unit,
          status: u.status,
          periodStart: u.periodStart,
          periodEnd: u.periodEnd,
          methodologyVersion: u.methodologyVersion,
          createdAt: u.createdAt,
          retiredAt: u.retiredAt,
        })),
      }
    })

    // Aggregate stats
    const allUnits = await db.impactUnit.findMany({ select: { amount: true, status: true } })
    const stats = {
      totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
      totalIssued: allUnits.filter((u) => u.status === 'issued' || u.status === 'verified').reduce((s, u) => s + u.amount, 0),
      totalRetired: allUnits.filter((u) => u.status === 'retired').reduce((s, u) => s + u.amount, 0),
      totalCancelled: allUnits.filter((u) => u.status === 'cancelled').reduce((s, u) => s + u.amount, 0),
      totalEstimated: allUnits.filter((u) => u.status === 'estimated').reduce((s, u) => s + u.amount, 0),
    }

    return NextResponse.json({ accounts: result, stats })
  } catch (error) {
    console.error('Impact API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
