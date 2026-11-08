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