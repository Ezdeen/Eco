import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { decryptSecret } from '@/lib/crypto'

// TEMPORARY DIAGNOSTIC ENDPOINT — delete after debugging the Hedera key mismatch issue.
// Uses the real Hedera SDK to derive the public key from the stored private key and
// compares it against the stored public key and the account, giving a definitive
// answer instead of guessing from DER byte patterns.
export async function GET() {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const row = await db.integrationConfig.findUnique({ where: { name: 'hedera' } })
    if (!row) {
      return NextResponse.json({ error: 'لا يوجد تكامل Hedera محفوظ' }, { status: 404 })
    }

    const cfg = row.config ? JSON.parse(row.config) : {}
    const storedPrivateKeyDer = row.encryptedSecret ? decryptSecret(row.encryptedSecret) : null
    const storedPublicKeyDer = cfg.derPublicKey || null
    const accountId = cfg.accountId || null

    if (!storedPrivateKeyDer) {
      return NextResponse.json({ error: 'لا يوجد مفتاح خاص محفوظ' }, { status: 400 })
    }

    const { PrivateKey, PublicKey, AccountId, Client, AccountBalanceQuery } = await import('@hashgraph/sdk')

    const results: Record<string, any> = {}

    // Test 1: Can the SDK parse the stored value as an ECDSA private key at all?
    try {
      const parsedPrivateKey = PrivateKey.fromStringECDSA(storedPrivateKeyDer)
      results.privateKeyParsesAsEcdsa = true

      // Test 2: Derive the public key FROM the private key using the SDK itself
      const derivedPublicKey = parsedPrivateKey.publicKey
      const derivedPublicKeyDer = derivedPublicKey.toStringDer()
      results.derivedPublicKeyFromPrivateKey = derivedPublicKeyDer

      // Test 3: Compare derived public key against what's stored as "public key"
      if (storedPublicKeyDer) {
        results.storedPublicKeyDer = storedPublicKeyDer
        results.publicKeysMatch = derivedPublicKeyDer.toLowerCase() === storedPublicKeyDer.toLowerCase()
      }

      // Test 4: Try to actually sign a real query with this key against the real account,
      // and see if Hedera testnet accepts the signature. This is the definitive test —
      // no byte-pattern guessing, just asking the network directly.
      if (accountId) {
        try {
          const client = Client.forTestnet()
          const operatorId = AccountId.fromString(accountId)
          client.setOperator(operatorId, parsedPrivateKey)

          const balance = await new AccountBalanceQuery().setAccountId(operatorId).execute(client)
          results.balanceQuerySucceeded = true
          results.balance = balance.hbars.toString()
        } catch (err: any) {
          results.balanceQuerySucceeded = false
          results.balanceQueryError = err?.message
        }
      }
    } catch (err: any) {
      results.privateKeyParsesAsEcdsa = false
      results.parseError = err?.message
    }

    return NextResponse.json({
      accountId,
      storedPrivateKeyPrefix: storedPrivateKeyDer.slice(0, 20) + '...',
      storedPrivateKeySuffix: '...' + storedPrivateKeyDer.slice(-10),
      storedPrivateKeyLength: storedPrivateKeyDer.length,
      diagnostics: results,
      conclusion: results.publicKeysMatch === false
        ? 'المفتاح الخاص المحفوظ لا يطابق المفتاح العام المحفوظ — تأكد من نسخ المفتاح الخاص الصحيح من Hedera Portal'
        : results.publicKeysMatch === true
        ? 'المفتاح الخاص والعام متطابقان رياضياً بشكل صحيح'
        : 'تعذر التحقق (لا يوجد مفتاح عام محفوظ للمقارنة)',
    })
  } catch (error: any) {
    console.error('Hedera diagnose error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
