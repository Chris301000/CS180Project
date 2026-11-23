import { fireEvent, render, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginScreen from './LoginScreen.svelte'
import { logIn, signUp } from './supabase'

vi.mock('./supabase', () => ({ logIn: vi.fn(), signUp: vi.fn() }))

const mockLogIn = vi.mocked(logIn)
const mockSignUp = vi.mocked(signUp)

beforeEach(() => {
  mockLogIn.mockReset()
  mockSignUp.mockReset()
})

function setup() {
  const view = render(LoginScreen)
  const fill = async (fields: Record<string, string>) => {
    for (const [label, value] of Object.entries(fields)) {
      await fireEvent.input(view.getByLabelText(label), { target: { value } })
    }
  }
  const submit = () => fireEvent.submit(view.container.querySelector('form')!)
  const signUpTab = () => fireEvent.click(view.getByRole('tab', { name: 'Sign up' }))
  return { ...view, fill, submit, signUpTab }
}

describe('log in', () => {
  it('sends the trimmed email and password to Supabase', async () => {
    mockLogIn.mockResolvedValue({ data: {}, error: null } as never)
    const { fill, submit } = setup()
    await fill({ Email: ' a@b.com ', Password: 'secret1' })
    await submit()
    expect(mockLogIn).toHaveBeenCalledWith('a@b.com', 'secret1')
  })

  it('rewords a wrong-password error', async () => {
    mockLogIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } } as never)
    const { fill, submit, findByRole } = setup()
    await fill({ Email: 'a@b.com', Password: 'nope' })
    await submit()
    expect((await findByRole('alert')).textContent).toBe('Wrong email or password.')
  })
})

describe('sign up', () => {
  it('only asks for a username on the sign-up tab', async () => {
    const { queryByLabelText, signUpTab } = setup()
    expect(queryByLabelText('Username')).toBeNull()
    await signUpTab()
    expect(queryByLabelText('Username')).not.toBeNull()
  })

  it('rejects a short password without calling Supabase', async () => {
    const { fill, submit, signUpTab, findByRole } = setup()
    await signUpTab()
    await fill({ Username: 'chris', Email: 'a@b.com', Password: '123' })
    await submit()
    expect((await findByRole('alert')).textContent).toMatch(/at least 6/)
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('creates the account and asks the user to confirm their email', async () => {
    mockSignUp.mockResolvedValue({ data: { user: {}, session: null }, error: null } as never)
    const { fill, submit, signUpTab, findByRole, getByRole } = setup()
    await signUpTab()
    await fill({ Username: 'chris', Email: 'a@b.com', Password: 'secret1' })
    await submit()
    expect(mockSignUp).toHaveBeenCalledWith('a@b.com', 'secret1', 'chris')
    expect((await findByRole('status')).textContent).toMatch(/check a@b.com/i)
    await waitFor(() => expect(getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true'))
  })

  it('explains a taken username', async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: { message: 'Database error saving new user' } } as never)
    const { fill, submit, signUpTab, findByRole } = setup()
    await signUpTab()
    await fill({ Username: 'chris', Email: 'a@b.com', Password: 'secret1' })
    await submit()
    expect((await findByRole('alert')).textContent).toMatch(/username is taken/)
  })
})
