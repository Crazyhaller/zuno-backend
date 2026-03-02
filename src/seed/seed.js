import 'dotenv/config'
import fs from 'fs/promises'

const API_URL = process.env.API_URL

if (!API_URL) {
  throw new Error('API_URL is required to seed via REST endpoints.')
}

const DATA_FILE = new URL('../data/data.json', import.meta.url)

async function readJsonFile(fileUrl) {
  const raw = await fs.readFile(fileUrl, 'utf8')
  return JSON.parse(raw)
}

async function createMatch(match) {
  const response = await fetch(`${API_URL}/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sport: match.sport,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      startTime: match.startTime,
      endTime: match.endTime,
      homeScore: match.homeScore ?? 0,
      awayScore: match.awayScore ?? 0,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to create match: ${response.status}`)
  }

  const data = await response.json()
  return data.data
}

async function insertCommentary(matchId, entry) {
  const payload = {
    message: entry.message,
  }

  if (entry.minute !== undefined) payload.minute = entry.minute
  if (entry.sequence !== undefined) payload.sequence = entry.sequence
  if (entry.period !== undefined) payload.period = entry.period
  if (entry.eventType !== undefined) payload.eventType = entry.eventType
  if (entry.actor !== undefined) payload.actor = entry.actor
  if (entry.team !== undefined) payload.team = entry.team
  if (entry.metadata !== undefined) payload.metadata = entry.metadata
  if (entry.tags !== undefined) payload.tags = entry.tags

  const response = await fetch(`${API_URL}/matches/${matchId}/commentary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Failed to create commentary: ${response.status}`)
  }

  const data = await response.json()
  return data.data
}

async function seed() {
  console.log(`📡 Seeding via API: ${API_URL}`)

  const data = await readJsonFile(DATA_FILE)

  if (!Array.isArray(data.matches)) {
    throw new Error('data.json must contain a "matches" array.')
  }

  if (!Array.isArray(data.commentary)) {
    throw new Error('data.json must contain a "commentary" array.')
  }

  const matchIdMap = new Map()

  // 1️⃣ Create all matches
  for (const match of data.matches) {
    const created = await createMatch(match)
    console.log(
      `✅ Created match: ${created.id} (${match.homeTeam} vs ${match.awayTeam})`,
    )
    matchIdMap.set(match.id, created.id)
  }

  // 2️⃣ Insert all commentary
  for (const entry of data.commentary) {
    const newMatchId = matchIdMap.get(entry.matchId)

    if (!newMatchId) {
      console.warn(
        `⚠️ Skipping commentary. MatchId not found: ${entry.matchId}`,
      )
      continue
    }

    const row = await insertCommentary(newMatchId, entry)
    console.log(`📣 [Match ${newMatchId}] ${row.message}`)
  }

  console.log('🎉 Seeding complete.')
}

seed().catch((err) => {
  console.error('❌ Seed error:', err)
  process.exit(1)
})
