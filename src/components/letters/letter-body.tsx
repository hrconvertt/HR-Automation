'use client'

/**
 * The letter's text, with an Edit that saves.
 *
 * The generated wording is a starting point, not the final word — a
 * confirmation letter routinely needs a sentence changed before it is signed.
 * Editing it meant going back to the database, so the printed letter and what
 * HR actually wanted to say could not be reconciled. Edits save against the
 * letter record, so reopening it shows the corrected version.
 *
 * Print always uses the saved text: the textarea is swapped out for the plain
 * paragraph before the browser paginates, so an unsaved draft can never print.
 */
import { useState } from 'react'

export function LetterBody({
  letterId, initialBody, canEdit,
}: {
  letterId: string
  initialBody: string
  canEdit: boolean
}) {
  const [body, setBody] = useState(initialBody)
  const [draft, setDraft] = useState(initialBody)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setSaving(true); setMsg('')
    try {
      const res = await fetch(`/api/letters/${letterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'EDIT_BODY', letterBody: draft }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(d.error ?? 'Could not save.'); return }
      setBody(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const textStyle: React.CSSProperties = {
    fontSize: 13, lineHeight: 1.75, color: '#1f2937', whiteSpace: 'pre-wrap',
  }

  if (!editing) {
    return (
      <>
        {canEdit && (
          <div className="no-print" style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => { setDraft(body); setEditing(true) }}
              style={{
                fontFamily: 'system-ui, sans-serif', fontSize: 12, cursor: 'pointer',
                padding: '5px 12px', borderRadius: 6, border: '1px solid #cbd5e1',
                background: '#fff', color: '#0f172a',
              }}
            >
              Edit letter
            </button>
          </div>
        )}
        <div style={textStyle}>{body}</div>
      </>
    )
  }

  return (
    <div className="no-print">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{
          width: '100%', minHeight: 380, padding: 12, borderRadius: 8,
          border: '1px solid #cbd5e1', fontFamily: 'inherit', ...textStyle,
        }}
      />
      {msg && <p style={{ color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving || !draft.trim()}
          style={{
            fontFamily: 'system-ui, sans-serif', fontSize: 13, cursor: 'pointer',
            padding: '7px 14px', borderRadius: 6, border: '1px solid #0f172a',
            background: '#0f172a', color: '#fff', fontWeight: 600,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => { setDraft(body); setEditing(false); setMsg('') }}
          style={{
            fontFamily: 'system-ui, sans-serif', fontSize: 13, cursor: 'pointer',
            padding: '7px 14px', borderRadius: 6, border: '1px solid #cbd5e1',
            background: '#fff', color: '#0f172a',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
