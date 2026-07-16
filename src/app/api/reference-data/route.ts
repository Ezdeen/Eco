import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

export async function GET() {
  try {
    const auth = await requirePermission('project:read')
    if (!auth.authorized) return auth.response

    // Fetch all reference data with version + source + validity
    const [emissionFactors, tariffs, conversionFactors, methodologies] = await Promise.all([
      db.gridEmissionFactor.findMany({
        orderBy: { validFrom: 'desc' },
      }),
      db.tariff.findMany({
        orderBy: { validFrom: 'desc' },
      }),
      db.conversionFactor.findMany({
        orderBy: { validFrom: 'desc' },
      }),
      db.methodology.findMany({
        orderBy: { validFrom: 'desc' },
      }),
    ])

    return NextResponse.json({
      emissionFactors,
      tariffs,
      conversionFactors,
      methodologies,
      summary: {
        totalEmissionFactors: emissionFactors.length,
        totalTariffs: tariffs.length,
        totalConversionFactors: conversionFactors.length,
        totalMethodologies: methodologies.length,
      },
    })
  } catch (error) {
    console.error('Reference data API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const { type, data } = body

    let record

    switch (type) {
      case 'emission_factor':
        record = await db.gridEmissionFactor.create({ data })
        break
      case 'tariff':
        record = await db.tariff.create({ data })
        break
      case 'conversion_factor':
        record = await db.conversionFactor.create({ data })
        break
      case 'methodology':
        record = await db.methodology.create({ data })
        break
      default:
        return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
    }

    return NextResponse.json({ success: true, record }, { status: 201 })
  } catch (error) {
    console.error('Create reference data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
