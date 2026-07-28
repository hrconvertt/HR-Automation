/**
 * Clerk → Convertt webhook.
 *
 * Setup steps (USER ACTION REQUIRED after deploy):
 *   1) Clerk Dashboard → Webhooks → Add Endpoint
 *   2) URL: https://<your-domain>/api/webhooks/clerk
 *   3) Subscribe to: user.created, user.updated, user.deleted
 *   4) Copy the Signing Secret → set as CLERK_WEBHOOK_SIGNING_SECRET in Vercel env vars
 *
 * Signature verification uses svix (Clerk's webhook signing library).
 */
import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { syncClerkUser, updateClerkUserEmail, deactivateClerkUser } from '@/lib/clerk-sync'

export const runtime = 'nodejs'

type ClerkWebhookEvent =
  | {
      type: 'user.created'
      data: { id: string; email_addresses: Array<{ email_address: string; id: string }>; primary_email_address_id?: string }
    }
  | {
      type: 'user.updated'
      data: { id: string; email_addresses: Array<{ email_address: string; id: string }>; primary_email_address_id?: string }
    }
  | { type: 'user.deleted'; data: { id: string; deleted?: boolean } }
  | { type: string; data: unknown }

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
  if (!secret) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const svix_id = req.headers.get('svix-id')
  const svix_timestamp = req.headers.get('svix-timestamp')
  const svix_signature = req.headers.get('svix-signature')
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const body = await req.text()
  const wh = new Webhook(secret)
  let evt: ClerkWebhookEvent
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkWebhookEvent
  } catch (err) {
    console.error('[clerk-webhook] signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    switch (evt.type) {
      case 'user.created': {
        const data = evt.data as { id: string }
        await syncClerkUser(data.id)
        break
      }
      case 'user.updated': {
        const data = evt.data as {
          id: string
          email_addresses: Array<{ email_address: string; id: string }>
          primary_email_address_id?: string
        }
        const primary =
          data.email_addresses.find((e) => e.id === data.primary_email_address_id) ??
          data.email_addresses[0]
        if (primary) {
          await updateClerkUserEmail(data.id, primary.email_address)
        }
        // Also re-sync in case clerkUserId still wasn't linked
        await syncClerkUser(data.id)
        break
      }
      case 'user.deleted': {
        const data = evt.data as { id: string }
        await deactivateClerkUser(data.id)
        break
      }
      default:
        // Ignore other event types
        break
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[clerk-webhook] handler error', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}
