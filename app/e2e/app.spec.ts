import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

test('user can play and stop the demo song', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Play')).toBeVisible()

  await page.getByLabel('Play').click()
  await expect(page.getByLabel('Pause')).toBeVisible()

  await page.getByLabel('Stop').click()
  await expect(page.getByLabel('Play')).toBeVisible()
})

test('shows an error when an invalid song file is opened', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('song-file-input').setInputFiles({
    name: 'bad-song.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not a valid song'),
  })

  await expect(page.getByRole('alert')).toBeVisible()
})

test('user can change editor controls', async ({ page }) => {
  await page.goto('/')

  const loop = page.getByLabel('Loop')
  const loopInitialState = await loop.isChecked()

  await loop.click()
  expect(await loop.isChecked()).toBe(!loopInitialState)

  await loop.click()
  expect(await loop.isChecked()).toBe(loopInitialState)

  const follow = page.getByLabel('Follow')
  const followInitialState = await follow.isChecked()

  await follow.click()
  expect(await follow.isChecked()).toBe(!followInitialState)

  await follow.click()
  expect(await follow.isChecked()).toBe(followInitialState)

  const snap = page.getByLabel('Snap')
  await snap.selectOption({ label: 'Beat' })
  await expect(snap).toHaveValue('1')

  const volume = page.getByLabel('Volume')
  await volume.fill('0.5')
  await expect(volume).toHaveValue('0.5')

  const zoom = page.getByLabel('Zoom')
  await zoom.fill('1')
  await expect(zoom).toHaveValue('1')
})

test('user can undo a note edit', async ({ page }) => {
  await page.goto('/')

  const undo = page.getByLabel('Undo')
  await expect(undo).toBeDisabled()

  await page.locator('.grid').click({
    position: { x: 10, y: 5 },
  })

  await expect(undo).toBeEnabled()

  await undo.click()
  await expect(undo).toBeDisabled()
})

test('user can save the song', async ({ page }) => {
  await page.goto('/')

  const downloadPromise = page.waitForEvent('download')

  await page.getByRole('button', {
    name: 'Save',
    exact: true,
  }).click()

  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^song.*\.json$/)
})