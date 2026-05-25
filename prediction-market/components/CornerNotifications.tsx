'use client'

import styles from './CornerNotifications.module.css'

/** Floating LIVE indicator – real activity feed coming soon */
export default function CornerNotifications() {
  return (
    <div className={styles.container} aria-label="Live activity">
      <div className={styles.liveBadge}>
        <span className={styles.dot} />
        <span className={styles.text}>LIVE</span>
      </div>
    </div>
  )
}
