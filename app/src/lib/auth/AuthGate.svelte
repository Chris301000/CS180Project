<script lang="ts">
  import type { Session } from '@supabase/supabase-js'
  import { onDestroy } from 'svelte'
  import App from '../../App.svelte'
  import type { AudioBackend } from '../audio/backend'
  import LoginScreen from './LoginScreen.svelte'
  import { supabaseSongStore } from '../cloud/songStore'
  import { getCurrentUserProfile, logOut, supabase } from './supabase'

  let { backend }: { backend: AudioBackend } = $props()

  const songs = supabaseSongStore(supabase)

  // undefined = still checking for a saved session; null = signed out.
  let session = $state<Session | null | undefined>(undefined)
  let username = $state('')

  supabase.auth.getSession().then(({ data }) => (session = data.session))

  // Fires on log in, log out, and token refresh. Don't await Supabase calls in here
  // (the docs warn it can deadlock) — the profile lookup happens in the effect below.
  const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => (session = next))
  onDestroy(() => listener.subscription.unsubscribe())

  const userId = $derived(session?.user.id)

  $effect(() => {
    if (!userId) return
    // Show something right away, then replace it with the name from `profiles`.
    username = session?.user.user_metadata.username ?? session?.user.email ?? ''
    getCurrentUserProfile().then((profile) => {
      if (profile?.username) username = profile.username
    })
  })
</script>

{#if session === undefined}
  <!-- Checking for a saved login; render nothing to avoid a login-screen flash. -->
{:else if session}
  <App {backend} account={{ username, onLogOut: logOut, songs }} />
{:else}
  <LoginScreen />
{/if}
