'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  RiTrophyLine,
  RiMedalLine,
  RiFireLine,
  RiBarChart2Line,
  RiStarLine,
} from 'react-icons/ri'
import { useMarkets } from '../../context/MarketsContext'
import { getMarketDetailPath } from '../../lib/utils'
import styles from './page.module.css'

const DUMMY_USERS = [
  { rank: 1, addr: '0xA1b2…C3d4', wins: 47, total: 89, vol: '12.45', profit: '+4.21', badge: '🥇' },
  { rank: 2, addr: '0xF4e5…D6c7', wins: 39, total: 71, vol: '9.82',  profit: '+3.67', badge: '🥈' },
  { rank: 3, addr: '0xB8a9…E0f1', wins: 35, total: 68, vol: '8.30',  profit: '+2.95', badge: '🥉' },
  { rank: 4, addr: '0xC2d3…F4e5', wins: 28, total: 56, vol: '6.11',  profit: '+2.10', badge: null },
  { rank: 5, addr: '0xD6e7…A8b9', wins: 24, total: 50, vol: '5.40',  profit: '+1.88', badge: null },
  { rank: 6, addr: '0xE0f1…B2c3', wins: 21, total: 45, vol: '4.92',  profit: '+1.44', badge: null },
  { rank: 7, addr: '0xF4a5…C6d7', wins: 19, total: 42, vol: '4.33',  profit: '+1.22', badge: null },
  { rank: 8, addr: '0x1234…5678', wins: 17, total: 38, vol: '3.90',  profit: '+0.98', badge: null },
  { rank: 9, addr: '0x9abc…def0', wins: 14, total: 32, vol: '3.20',  profit: '+0.76', badge: null },
  { rank: 10, addr: '0xA1B2…C3D4', wins: 12, total: 28, vol: '2.87', profit: '+0.55', badge: null },
]

export default function LeaderboardPage() {
  const { markets } = useMarkets()

  const topMarkets = useMemo(() =>
    [...markets]
      .sort((a, b) => (parseFloat(b.totalPool) || 0) - (parseFloat(a.totalPool) || 0))
      .slice(0, 5),
    [markets]
  )

  const podium = DUMMY_USERS.slice(0, 3)
  const rest   = DUMMY_USERS.slice(3)

  return (
    <div className={styles.page}>

      {/* ── Hero header (solid purple bg) ─────────────── */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}><RiTrophyLine /> Leaderboard</div>
          <h1 className={styles.heroTitle}>Top Predictors</h1>
          <p className={styles.heroSub}>The most accurate and active traders on PredictFi</p>
        </div>
      </div>

      <div className={styles.body}>

        {/* ── Left: Rankings ──────────────────────────── */}
        <div className={styles.mainCol}>

          {/* Podium — top 3 */}
          <div className={styles.podium}>
            {/* 2nd */}
            <div className={`${styles.podiumCard} ${styles.second}`}>
              <div className={styles.podiumBadge}>🥈</div>
              <div className={styles.podiumRank}>#2</div>
              <div className={styles.podiumAddr}>{podium[1].addr}</div>
              <div className={styles.podiumStat}>{podium[1].vol} tBNB</div>
              <div className={styles.podiumWins}>{podium[1].wins}/{podium[1].total} wins</div>
            </div>
            {/* 1st */}
            <div className={`${styles.podiumCard} ${styles.first}`}>
              <div className={styles.crownGlow} />
              <div className={styles.podiumBadge}>🥇</div>
              <div className={styles.podiumRank}>#1</div>
              <div className={styles.podiumAddr}>{podium[0].addr}</div>
              <div className={styles.podiumStat}>{podium[0].vol} tBNB</div>
              <div className={styles.podiumWins}>{podium[0].wins}/{podium[0].total} wins</div>
              <div className={styles.firstLabel}>TOP PREDICTOR</div>
            </div>
            {/* 3rd */}
            <div className={`${styles.podiumCard} ${styles.third}`}>
              <div className={styles.podiumBadge}>🥉</div>
              <div className={styles.podiumRank}>#3</div>
              <div className={styles.podiumAddr}>{podium[2].addr}</div>
              <div className={styles.podiumStat}>{podium[2].vol} tBNB</div>
              <div className={styles.podiumWins}>{podium[2].wins}/{podium[2].total} wins</div>
            </div>
          </div>

          {/* Ranks 4–10 table */}
          <div className={styles.rankTable}>
            <div className={styles.tableHeader}>
              <span>#</span>
              <span>Address</span>
              <span className={styles.alignRight}>Wins</span>
              <span className={styles.alignRight}>Volume</span>
              <span className={styles.alignRight}>Profit</span>
              <span className={styles.alignRight}>Rate</span>
            </div>
            {rest.map((u) => (
              <div key={u.rank} className={styles.tableRow}>
                <span className={styles.rankNum}>{u.rank}</span>
                <span className={styles.rankAddr}>{u.addr}</span>
                <span className={`${styles.alignRight} ${styles.rankWins}`}>{u.wins}/{u.total}</span>
                <span className={`${styles.alignRight} ${styles.rankVol}`}>{u.vol} tBNB</span>
                <span className={`${styles.alignRight} ${styles.rankProfit}`}>{u.profit}</span>
                <span className={`${styles.alignRight} ${styles.rankRate}`}>{Math.round((u.wins/u.total)*100)}%</span>
              </div>
            ))}
          </div>

          <p className={styles.demoNote}>* Leaderboard data is illustrative. Live on-chain rankings coming soon.</p>
        </div>

        {/* ── Right: Hot markets ───────────────────────── */}
        <div className={styles.sideCol}>

          <div className={styles.sideCard}>
            <div className={styles.sideCardHeader}>
              <RiFireLine className={styles.sideCardIcon} /> Hottest Markets
            </div>
            {topMarkets.length === 0 ? (
              <p className={styles.noMarkets}>No markets yet</p>
            ) : (
              topMarkets.map((m, i) => {
                const total = parseFloat(m.totalPool) || 0
                const yes   = parseFloat(m.yesPool)   || 0
                const yesP  = total > 0 ? Math.round((yes / total) * 100) : 50
                const shortQ = m.question.length > 40 ? m.question.slice(0, 40) + '…' : m.question
                return (
                  <Link href={getMarketDetailPath(m.question, m.id)} key={m.id} className={styles.hotMarket}>
                    <div className={styles.hotRank}>#{i + 1}</div>
                    <div className={styles.hotContent}>
                      <div className={styles.hotQ}>{shortQ}</div>
                      <div className={styles.hotMeta}>
                        <span className={styles.hotVol}><RiBarChart2Line /> {total.toFixed(3)} tBNB</span>
                        <span className={styles.hotYes}>{yesP}% YES</span>
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>

          <div className={styles.sideCard}>
            <div className={styles.sideCardHeader}>
              <RiStarLine className={styles.sideCardIcon} /> Your Stats
            </div>
            <div className={styles.yourRank}>
              <div className={styles.yourRankNum}>—</div>
              <div className={styles.yourRankLabel}>Your current rank</div>
              <p className={styles.yourRankSub}>Connect your wallet and start trading to appear on the leaderboard</p>
            </div>
          </div>

          <div className={styles.sideCard}>
            <div className={styles.sideCardHeader}>
              <RiMedalLine className={styles.sideCardIcon} /> How to Climb
            </div>
            <div className={styles.howList}>
              {[
                'Make accurate predictions',
                'Trade on more markets',
                'Claim winnings promptly',
                'Build a winning streak',
              ].map((tip, i) => (
                <div key={i} className={styles.howItem}>
                  <span className={styles.howNum}>{i + 1}</span>
                  <span className={styles.howTip}>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
