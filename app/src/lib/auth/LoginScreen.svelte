<script lang="ts">
  import { logIn, signUp } from './supabase'

  type Mode = 'login' | 'signup'

  let mode = $state<Mode>('login')
  let email = $state('')
  let password = $state('')
  let username = $state('')
  let busy = $state(false)
  let error = $state('')
  let notice = $state('')

  const MIN_PASSWORD = 6

  function switchMode(next: Mode) {
    mode = next
    error = ''
    notice = ''
  }

  // Supabase's raw messages are fine for most cases; these are the ones worth rewording.
  function friendly(message: string): string {
    if (/invalid login credentials/i.test(message)) return 'Wrong email or password.'
    if (/email not confirmed/i.test(message)) return 'Confirm your email first — check your inbox for the link.'
    if (/already registered/i.test(message)) return 'An account with that email already exists. Try logging in.'
    // The profiles trigger fails when the username is already used.
    if (/database error saving new user/i.test(message)) return 'That username is taken. Try another one.'
    return message
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault()
    error = ''
    notice = ''

    if (mode === 'signup') {
      if (username.trim().length < 3) {
        error = 'Username must be at least 3 characters.'
        return
      }
      if (password.length < MIN_PASSWORD) {
        error = `Password must be at least ${MIN_PASSWORD} characters.`
        return
      }
    }

    busy = true
    try {
      if (mode === 'login') {
        const { error: err } = await logIn(email.trim(), password)
        if (err) error = friendly(err.message)
        // On success the auth listener in AuthGate swaps this screen for the app.
      } else {
        const { data, error: err } = await signUp(email.trim(), password, username.trim())
        if (err) {
          error = friendly(err.message)
        } else if (!data.session) {
          // Email confirmation is on: no session until the user clicks the link.
          notice = `Account created! Check ${email.trim()} for a confirmation link, then log in.`
          password = ''
          mode = 'login'
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong. Try again.'
    } finally {
      busy = false
    }
  }
</script>

<div class="screen">
  <form class="card" onsubmit={onSubmit} aria-label={mode === 'login' ? 'Log in' : 'Sign up'}>
    <h1>Lite DAW</h1>

    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'login'}
        onclick={() => switchMode('login')}>Log in</button
      >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'signup'}
        onclick={() => switchMode('signup')}>Sign up</button
      >
    </div>

    {#if mode === 'signup'}
      <label>
        Username
        <input bind:value={username} autocomplete="username" required />
      </label>
    {/if}
    <label>
      Email
      <input type="email" bind:value={email} autocomplete="email" required />
    </label>
    <label>
      Password
      <input
        type="password"
        bind:value={password}
        autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
        required
      />
    </label>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}

    <button class="submit" type="submit" disabled={busy}>
      {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
    </button>
  </form>
</div>

<style>
  .screen {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 16px;
    box-sizing: border-box;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 320px;
    padding: 28px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 22px;
    text-align: center;
    color: var(--accent);
  }

  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 3px;
    background: var(--roll-bg);
    border-radius: 6px;
  }

  .tabs button {
    padding: 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    font: inherit;
  }

  .tabs button[aria-selected='true'] {
    background: var(--button);
    color: var(--text);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-dim);
  }

  input {
    padding: 8px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--roll-bg);
    color: var(--text);
    font: inherit;
  }

  input:focus {
    outline: 1px solid var(--accent);
    border-color: var(--accent);
  }

  .submit {
    padding: 9px;
    border: 0;
    border-radius: 4px;
    background: var(--accent);
    color: var(--note-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .submit:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .error,
  .notice {
    margin: 0;
    padding: 8px 10px;
    border-radius: 4px;
  }

  .error {
    color: #ff7a7a;
    background: #ff7a7a1a;
  }

  .notice {
    color: var(--accent);
    background: #9fe8701a;
  }
</style>
