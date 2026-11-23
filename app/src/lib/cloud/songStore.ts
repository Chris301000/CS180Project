// Songs saved to the signed-in user's account, in the Supabase `songs` table.
// Each row's `data` is the same JSON a downloaded song file contains, so loading
// reuses parseSong() and keeps working with older song versions.
//
// Row Level Security on the table limits every query to the user's own rows,
// and `user_id` defaults to auth.uid(), so nothing here passes a user ID.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Song } from '../song/song'
import { parseSong, serializeSong } from '../song/songFile'

export interface SongSummary {
  id: string
  name: string
  updatedAt: string
}

export interface SongStore {
  /** The user's songs, most recently saved first. */
  list(): Promise<SongSummary[]>
  load(id: string): Promise<{ summary: SongSummary; song: Song }>
  /** Overwrites the song with `id`, or creates a new one when `id` is omitted. */
  save(song: Song, name: string, id?: string): Promise<SongSummary>
  remove(id: string): Promise<void>
}

interface SongRow {
  id: string
  name: string
  updated_at: string
  data?: unknown
}

const summarize = (row: SongRow): SongSummary => ({ id: row.id, name: row.name, updatedAt: row.updated_at })

export function supabaseSongStore(client: SupabaseClient): SongStore {
  const songs = () => client.from('songs')

  return {
    async list() {
      const { data, error } = await songs()
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as SongRow[]).map(summarize)
    },

    async load(id) {
      const { data, error } = await songs().select('id, name, updated_at, data').eq('id', id).single()
      if (error) throw new Error(error.message)
      const row = data as SongRow
      return { summary: summarize(row), song: parseSong(JSON.stringify(row.data)) }
    },

    async save(song, name, id) {
      const fields = { name, data: JSON.parse(serializeSong(song)) }
      const query = id ? songs().update(fields).eq('id', id) : songs().insert(fields)
      const { data, error } = await query.select('id, name, updated_at').single()
      // An update that matched no row: the song was deleted (or isn't this user's).
      if (error?.code === 'PGRST116') throw new Error('That song no longer exists in your account.')
      if (error) throw new Error(error.message)
      return summarize(data as SongRow)
    },

    async remove(id) {
      const { error } = await songs().delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
