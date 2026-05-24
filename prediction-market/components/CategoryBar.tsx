'use client'

import { AVAILABLE_CATEGORIES } from '../lib/utils'
import styles from './CategoryBar.module.css'

interface Props {
  activeCategory: string
  onCategoryChange: (cat: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  liveCount: number
}

export default function CategoryBar({ activeCategory, onCategoryChange, searchQuery, onSearchChange, liveCount }: Props) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.liveChip}>
          <span className={styles.liveDot} />
          {liveCount} Live
        </span>

        <div className={styles.categories}>
          {AVAILABLE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={activeCategory === cat ? styles.catActive : styles.catBtn}
              onClick={() => onCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.search}>
        <span className={styles.searchIcon}>⌕</span>
        <input
          className={styles.searchInput}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search markets..."
        />
      </div>
    </div>
  )
}
