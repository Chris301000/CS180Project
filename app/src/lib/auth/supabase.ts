import { createClient, type User } from '@supabase/supabase-js'

// Vite only exposes env vars prefixed with VITE_, via import.meta.env
// (process.env doesn't exist in the browser). Values come from app/.env.local.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY — see app/.env.example')
}

export const supabase = createClient(url, key)

// 1. SIGN UP — email + password go to Supabase Auth; the username rides along
// in user metadata, where the handle_new_user() trigger copies it into `profiles`.
export async function signUp(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  })
  return { data, error }
}

// 2. LOG IN
export async function logIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

// 3. LOG OUT
export async function logOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export type UserProfile = User & { username: string | undefined }

// 4. CURRENT LOGGED-IN USER & USERNAME (null when signed out)
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  return { ...user, username: profile?.username }
}
