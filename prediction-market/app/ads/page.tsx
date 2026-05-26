'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import styles from './page.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BannerAd {
  id: number
  title: string
  image_url: string | null
  link_url: string | null
  pages: string[]
  start_date: string
  end_date: string
  is_active: boolean
  contact_handle: string | null
  created_at: string
}

const PAGE_OPTIONS = [
  { value: 'all',          label: 'All Pages' },
  { value: 'home',         label: 'Home' },
  { value: 'markets',      label: 'Markets' },
  { value: 'market_detail',label: 'Market Detail' },
  { value: 'portfolio',    label: 'Portfolio' },
  { value: 'activity',     label: 'Activity' },
  { value: 'leaderboard',  label: 'Leaderboard' },
  { value: 'whitelist',    label: 'Whitelist' },
]

const DURATION_PRESETS: { label: string; days: number }[] = [
  { label: '1 Day',  days: 1  },
  { label: '2 Days', days: 2  },
  { label: '3 Days', days: 3  },
  { label: '5 Days', days: 5  },
  { label: '7 Days', days: 7  },
  { label: '14 Days',days: 14 },
  { label: '30 Days',days: 30 },
]

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function statusBadge(ad: BannerAd): { label: string; cls: string } {
  const now = Date.now()
  const start = new Date(ad.start_date).getTime()
  const end   = new Date(ad.end_date).getTime()
  if (!ad.is_active) return { label: 'Paused',    cls: styles.badgePaused }
  if (now < start)   return { label: 'Scheduled', cls: styles.badgeScheduled }
  if (now > end)     return { label: 'Expired',   cls: styles.badgeExpired }
  return { label: 'Live', cls: styles.badgeLive }
}

// ── Blank form ────────────────────────────────────────────────────────────────

function blankForm() {
  const now   = new Date()
  const later = addDays(now, 1)
  return {
    title:          '',
    image_url:      '',
    link_url:       '',
    pages:          ['all'] as string[],
    start_date:     toLocalDatetimeValue(now),
    end_date:       toLocalDatetimeValue(later),
    is_active:      true,
    contact_handle: 'cixanp',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const [ads, setAds]           = useState<BannerAd[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState<number | null>(null)
  const [form, setForm]         = useState(blankForm())
  const [preview, setPreview]   = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // toast helper
  const flash = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Fetch all ads ──────────────────────────────────────────────────────────
  const fetchAds = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('banner_ads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { flash('Failed to load ads'); setLoading(false); return }
    setAds((data as BannerAd[]) ?? [])
    setLoading(false)
  }, [flash])

  useEffect(() => { fetchAds() }, [fetchAds])

  // ── Duration preset ────────────────────────────────────────────────────────
  const applyDuration = (days: number) => {
    const start = form.start_date ? new Date(form.start_date) : new Date()
    setForm(f => ({ ...f, end_date: toLocalDatetimeValue(addDays(start, days)) }))
  }

  // ── Page toggle ────────────────────────────────────────────────────────────
  const togglePage = (val: string) => {
    setForm(f => {
      if (val === 'all') return { ...f, pages: ['all'] }
      const cur = f.pages.filter(p => p !== 'all')
      const next = cur.includes(val) ? cur.filter(p => p !== val) : [...cur, val]
      return { ...f, pages: next.length === 0 ? ['all'] : next }
    })
  }

  // ── Open new ───────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditId(null)
    setForm(blankForm())
    setPreview(null)
    setShowForm(true)
  }

  // ── Open edit ──────────────────────────────────────────────────────────────
  const openEdit = (ad: BannerAd) => {
    setEditId(ad.id)
    setForm({
      title:          ad.title,
      image_url:      ad.image_url ?? '',
      link_url:       ad.link_url ?? '',
      pages:          ad.pages,
      start_date:     toLocalDatetimeValue(new Date(ad.start_date)),
      end_date:       toLocalDatetimeValue(new Date(ad.end_date)),
      is_active:      ad.is_active,
      contact_handle: ad.contact_handle ?? 'cixanp',
    })
    setPreview(ad.image_url ?? null)
    setShowForm(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim())      { flash('Title is required'); return }
    if (!form.start_date)        { flash('Start date is required'); return }
    if (!form.end_date)          { flash('End date is required'); return }
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      flash('End date must be after start date'); return
    }
    setSaving(true)
    const payload = {
      title:          form.title.trim(),
      image_url:      form.image_url.trim() || null,
      link_url:       form.link_url.trim()  || null,
      pages:          form.pages,
      start_date:     new Date(form.start_date).toISOString(),
      end_date:       new Date(form.end_date).toISOString(),
      is_active:      form.is_active,
      contact_handle: form.contact_handle.trim() || 'cixanp',
    }
    let error
    if (editId !== null) {
      ;({ error } = await supabase.from('banner_ads').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('banner_ads').insert(payload))
    }
    setSaving(false)
    if (error) { flash(`Error: ${error.message}`); return }
    flash(editId !== null ? 'Ad updated!' : 'Ad created!')
    setShowForm(false)
    fetchAds()
  }

  // ── Toggle active ──────────────────────────────────────────────────────────
  const toggleActive = async (ad: BannerAd) => {
    const { error } = await supabase
      .from('banner_ads')
      .update({ is_active: !ad.is_active })
      .eq('id', ad.id)
    if (error) { flash('Failed to update'); return }
    setAds(prev => prev.map(a => a.id === ad.id ? { ...a, is_active: !a.is_active } : a))
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (deleteId === null) return
    const { error } = await supabase.from('banner_ads').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) { flash('Delete failed'); return }
    flash('Ad deleted')
    setAds(prev => prev.filter(a => a.id !== deleteId))
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const liveCount      = ads.filter(a => { const b = statusBadge(a); return b.label === 'Live' }).length
  const scheduledCount = ads.filter(a => { const b = statusBadge(a); return b.label === 'Scheduled' }).length
  const expiredCount   = ads.filter(a => { const b = statusBadge(a); return b.label === 'Expired' }).length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* ── Toast ── */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* ── Delete confirm modal ── */}
      {deleteId !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <h3 className={styles.modalTitle}>Delete this ad?</h3>
            <p className={styles.modalDesc}>This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setDeleteId(null)}>Cancel</button>
              <button type="button" className={styles.btnDanger} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Ads Management</h1>
          <p className={styles.subtitle}>
            Manage banner ads across all pages.{' '}
            To advertise, DM{' '}
            <a href="https://t.me/cixanp" target="_blank" rel="noopener noreferrer" className={styles.tgLink}>
              @cixanp on Telegram
            </a>
          </p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={openNew}>
          + New Ad
        </button>
      </div>

      {/* ── Stats ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{ads.length}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statNum} ${styles.statLive}`}>{liveCount}</span>
          <span className={styles.statLabel}>Live Now</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statNum} ${styles.statScheduled}`}>{scheduledCount}</span>
          <span className={styles.statLabel}>Scheduled</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statNum} ${styles.statExpired}`}>{expiredCount}</span>
          <span className={styles.statLabel}>Expired</span>
        </div>
      </div>

      {/* ── Advertise CTA ── */}
      <div className={styles.ctaBanner}>
        <div className={styles.ctaLeft}>
          <span className={styles.ctaIcon}>📣</span>
          <div>
            <p className={styles.ctaTitle}>Want to advertise here?</p>
            <p className={styles.ctaDesc}>
              Reach crypto traders across all pages. Reach out to book your slot.
            </p>
          </div>
        </div>
        <a
          href="https://t.me/cixanp"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.ctaBtn}
        >
          DM @cixanp on Telegram
        </a>
      </div>

      {/* ── Ad create/edit form ── */}
      {showForm && (
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>{editId !== null ? 'Edit Ad' : 'Create New Ad'}</h2>
            <button type="button" className={styles.btnGhost} onClick={() => setShowForm(false)}>✕ Close</button>
          </div>

          <div className={styles.formGrid}>
            {/* Title */}
            <div className={styles.fieldFull}>
              <label className={styles.label}>Ad Title <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. CryptoProject Launch Campaign"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Image URL */}
            <div className={styles.fieldFull}>
              <label className={styles.label}>Banner Image URL</label>
              <input
                className={styles.input}
                type="url"
                placeholder="https://yourserver.com/banner.png  (1200 × 238px recommended)"
                value={form.image_url}
                onChange={e => {
                  setForm(f => ({ ...f, image_url: e.target.value }))
                  setPreview(e.target.value || null)
                }}
              />
              {preview && (
                <div className={styles.previewWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Preview"
                    className={styles.previewImg}
                    onError={() => setPreview(null)}
                  />
                  <span className={styles.previewLabel}>Preview</span>
                </div>
              )}
            </div>

            {/* Link URL */}
            <div className={styles.fieldFull}>
              <label className={styles.label}>Click-Through URL (optional)</label>
              <input
                className={styles.input}
                type="url"
                placeholder="https://yourproject.io"
                value={form.link_url}
                onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
              />
            </div>

            {/* Pages */}
            <div className={styles.fieldFull}>
              <label className={styles.label}>Show On Pages</label>
              <div className={styles.pageChips}>
                {PAGE_OPTIONS.map(opt => (
                  <button
                    type="button"
                    key={opt.value}
                    className={`${styles.pageChip} ${form.pages.includes(opt.value) ? styles.pageChipActive : ''}`}
                    onClick={() => togglePage(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Start date */}
            <div className={styles.field}>
              <label className={styles.label}>Start Date <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="datetime-local"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>

            {/* End date */}
            <div className={styles.field}>
              <label className={styles.label}>End Date <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="datetime-local"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>

            {/* Duration presets */}
            <div className={styles.fieldFull}>
              <label className={styles.label}>Quick Duration</label>
              <div className={styles.durationChips}>
                {DURATION_PRESETS.map(p => (
                  <button
                    type="button"
                    key={p.days}
                    className={styles.durationChip}
                    onClick={() => applyDuration(p.days)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact handle */}
            <div className={styles.field}>
              <label className={styles.label}>Contact Handle (Telegram)</label>
              <input
                className={styles.input}
                type="text"
                placeholder="cixanp"
                value={form.contact_handle}
                onChange={e => setForm(f => ({ ...f, contact_handle: e.target.value }))}
              />
            </div>

            {/* Active toggle */}
            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <button
                type="button"
                className={`${styles.toggleBtn} ${form.is_active ? styles.toggleActive : styles.togglePaused}`}
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              >
                {form.is_active ? '● Active' : '○ Paused'}
              </button>
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" className={styles.btnGhost} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId !== null ? 'Save Changes' : 'Create Ad'}
            </button>
          </div>
        </div>
      )}

      {/* ── Ad list ── */}
      {loading ? (
        <div className={styles.listSkeleton}>
          {[1,2,3].map(i => <div key={i} className={styles.skeletonRow} />)}
        </div>
      ) : ads.length === 0 ? (
        <div className={styles.empty}>
          <p>No ads yet. Click <strong>+ New Ad</strong> to create one.</p>
        </div>
      ) : (
        <div className={styles.adList}>
          {ads.map(ad => {
            const { label, cls } = statusBadge(ad)
            const start = new Date(ad.start_date)
            const end   = new Date(ad.end_date)
            const durMs = end.getTime() - start.getTime()
            const durDays = Math.round(durMs / 86_400_000)

            return (
              <div key={ad.id} className={styles.adCard}>
                {/* preview thumb */}
                <div className={styles.adThumbWrap}>
                  {ad.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.image_url} alt={ad.title} className={styles.adThumb} />
                  ) : (
                    <div className={styles.adThumbPlaceholder}>No Image</div>
                  )}
                </div>

                {/* info */}
                <div className={styles.adInfo}>
                  <div className={styles.adTitleRow}>
                    <span className={styles.adTitle}>{ad.title}</span>
                    <span className={`${styles.badge} ${cls}`}>{label}</span>
                  </div>
                  <div className={styles.adMeta}>
                    <span>📅 {start.toLocaleDateString()} – {end.toLocaleDateString()}</span>
                    <span>⏱ {durDays} day{durDays !== 1 ? 's' : ''}</span>
                    <span>📍 {ad.pages.join(', ')}</span>
                    {ad.link_url && (
                      <a href={ad.link_url} target="_blank" rel="noopener noreferrer" className={styles.adLink}>
                        🔗 {ad.link_url.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  {ad.contact_handle && (
                    <a
                      href={`https://t.me/${ad.contact_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.adContact}
                    >
                      Telegram: @{ad.contact_handle}
                    </a>
                  )}
                </div>

                {/* actions */}
                <div className={styles.adActions}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${ad.is_active ? styles.toggleActive : styles.togglePaused}`}
                    onClick={() => toggleActive(ad)}
                    title={ad.is_active ? 'Pause ad' : 'Activate ad'}
                  >
                    {ad.is_active ? '● Live' : '○ Paused'}
                  </button>
                  <button type="button" className={styles.btnEdit} onClick={() => openEdit(ad)}>Edit</button>
                  <button type="button" className={styles.btnDanger} onClick={() => setDeleteId(ad.id)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── How it works ── */}
      <div className={styles.howCard}>
        <h2 className={styles.howTitle}>How Banner Ads Work</h2>
        <div className={styles.howGrid}>
          <div className={styles.howStep}>
            <span className={styles.howNum}>1</span>
            <div>
              <strong>DM to book</strong>
              <p>Contact <a href="https://t.me/cixanp" target="_blank" rel="noopener noreferrer" className={styles.tgLink}>@cixanp on Telegram</a> to confirm your slot and pricing.</p>
            </div>
          </div>
          <div className={styles.howStep}>
            <span className={styles.howNum}>2</span>
            <div>
              <strong>Provide assets</strong>
              <p>Share your banner image (1200 × 238 px recommended) and click-through URL.</p>
            </div>
          </div>
          <div className={styles.howStep}>
            <span className={styles.howNum}>3</span>
            <div>
              <strong>Choose duration & pages</strong>
              <p>Select specific pages or all pages. Pick 1-day, 2-day, 7-day slots or a custom range.</p>
            </div>
          </div>
          <div className={styles.howStep}>
            <span className={styles.howNum}>4</span>
            <div>
              <strong>Go live</strong>
              <p>Your banner appears at the top of the selected pages for the entire booked period.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
