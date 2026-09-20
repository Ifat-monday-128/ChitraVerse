import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';

const require = createRequire(import.meta.url);
require('../../../server/src/config/env');
const { Pool } = require('../../../server/node_modules/pg');
const schema = `chitraverse_ui_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '' });
process.env.PGOPTIONS = `-c search_path=${schema},public`;
process.env.FRONTEND_ORIGINS = 'http://localhost:3001';
const pool = require('../../../server/src/config/db');
let server: ReturnType<typeof import('node:http').createServer>;
const password = 'UI verification password 123';

test.beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  for (const file of ['schema.sql', 'migrations/001_search_and_sessions.sql', 'migrations/002_homepage_features.sql']) {
    await pool.query(await readFile(new URL(`../../../server/database/${file}`, import.meta.url), 'utf8'));
  }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  await pool.query("INSERT INTO media(title,description,tmdb_rating,trailer_link) VALUES('Cinema test movie','A movie description.',8.2,'abcdefghijk'),('Cinema test series','A series description.',8.4,'abcdefghijk')");
  await pool.query('INSERT INTO movie(title_id,release_date) VALUES(1,$1)', [date]);
  await pool.query('INSERT INTO series(title_id,first_air_date) VALUES(2,$1)', [date]);
  await pool.query('INSERT INTO homepage_feature(title_id,position) VALUES(1,0)');
  const hash = `scrypt:ui-fixture:${scryptSync(password, 'ui-fixture', 64).toString('hex')}`;
  for (const name of ['ratings', 'watchlists', 'favorites']) {
    await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'user')", [name, `${name}@example.invalid`, hash]);
  }
  server = require('../../../server/src/app').listen(5001, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
});

test.afterAll(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

async function login(page: Page, name: string) {
  await page.goto('/');
  await expect(page.locator('.hero-copy h1')).toHaveText('Cinema test movie');
  await page.getByRole('button', { name: 'Open profile' }).click();
  await page.getByLabel('Email address', { exact: true }).fill(`${name}@example.invalid`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('homepage order, stored aggregates, movie/series ratings, and detail placement', async ({ page }) => {
  await login(page, 'ratings');
  await expect(page.locator('.hero-copy .chitraverse-rating')).toHaveText('ChitraVerse —');
  await expect(page.locator('.released-section .media-card')).toHaveCount(2);
  const sections = await page.locator('.home-discovery > section').evaluateAll(elements => elements.map(element => element.className));
  expect(sections.findIndex(name => name.includes('box-office'))).toBeLessThan(sections.findIndex(name => name.includes('released')));
  expect(sections.findIndex(name => name.includes('released'))).toBeLessThan(sections.findIndex(name => name.includes('birthday')));
  for (const [id, value] of [[1, '8'], [2, '9']] as const) {
    await page.goto(`/?title=${id}`);
    await expect(page.getByText('No ratings yet. Be the first to rate this title.')).toBeVisible();
    await expect(page.locator('.detail-heading .chitraverse-rating')).toHaveText('ChitraVerse —');
    const order = await page.locator('.title-page').evaluate(element => Array.from(element.children).map(child => child.className));
    expect(order.indexOf('detail-heading')).toBeLessThan(order.indexOf('detail-description'));
    expect(order.indexOf('detail-description')).toBeLessThan(order.indexOf('role-panel'));
    expect(order.indexOf('role-panel')).toBeLessThan(order.indexOf('detail-trailer'));
    await expect(page.getByRole('region', { name: 'ChitraVerse ratings' })).toHaveCount(1);
    await expect(page.locator('.detail-heading').getByRole('button', { name: 'Add to watchlist' })).toBeVisible();
    await page.getByLabel('Your rating').selectOption(value);
    await page.getByRole('button', { name: 'Save rating' }).click();
    await expect(page.locator('.detail-heading .chitraverse-rating')).toHaveText(`ChitraVerse ${value}.0`);
    await page.reload();
    await expect(page.getByLabel('Your rating')).toHaveValue(value);
    await expect(page.getByText(`${value}.0/10 · 1 votes`)).toBeVisible();
  }
  await page.goto('/');
  await expect(page.locator('.hero-copy .chitraverse-rating')).toHaveText('ChitraVerse 8.0');
});

test('chooser and library create, persist, rename, isolate and delete named lists with navigation', async ({ page }) => {
  await login(page, 'watchlists');
  await page.goto('/?view=watchlist');
  await expect(page.getByText('No watchlists yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '+ Create Watchlist', exact: true }).click();
  await page.getByLabel('Watchlist name').fill('Weekend Movies');
  await page.getByRole('button', { name: 'Create watchlist', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/?title=1');
  await page.getByRole('button', { name: 'Add to watchlist', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Add to watchlist' });
  await expect(chooser.getByRole('checkbox', { name: /Weekend Movies/ })).not.toBeChecked();
  await chooser.getByRole('checkbox', { name: /Weekend Movies/ }).click();
  await chooser.getByRole('button', { name: '+ Create new watchlist' }).click();
  await chooser.getByLabel('Watchlist name').fill('With Friends');
  await chooser.getByRole('button', { name: 'Create watchlist', exact: true }).click();
  await expect(chooser.getByRole('checkbox', { name: /With Friends/ })).not.toBeChecked();
  await chooser.getByRole('checkbox', { name: /With Friends/ }).click();
  await expect(chooser.getByRole('button', { name: 'Done' })).toBeEnabled();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(chooser).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to watchlist', exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Add to watchlist', exact: true }).click();
  await expect(chooser.getByRole('checkbox', { name: /Weekend Movies/ })).toBeChecked();
  await expect(chooser.getByRole('checkbox', { name: /With Friends/ })).toBeChecked();
  await chooser.getByRole('checkbox', { name: /Weekend Movies/ }).click();
  await chooser.getByRole('button', { name: 'Done' }).click();
  await page.goto('/?view=watchlist');
  await page.getByRole('button', { name: /WATCHLIST With Friends 1 title/ }).click();
  const listUrl = page.url();
  await page.getByRole('button', { name: 'About Cinema test movie' }).click();
  await page.goBack();
  await expect(page).toHaveURL(listUrl);
  await page.goForward();
  await expect(page.getByRole('region', { name: 'About Cinema test movie' })).toBeVisible();
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await expect(page).toHaveURL(listUrl);
  await page.getByRole('button', { name: 'Rename watchlist' }).click();
  await page.getByLabel('Watchlist name').fill('Cinema Friends');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('heading', { name: 'Cinema Friends' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Cinema test movie from Cinema Friends' }).click();
  await expect(page.getByText('Nothing here yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Delete watchlist', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete watchlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Watchlists' })).toBeVisible();
  await expect(page.locator('.watchlist-card')).toHaveCount(1);
  await expect(page.locator('.watchlist-card')).toContainText('Weekend Movies');
});

test('favorites persist separately for movies and series; mobile actions fit and errors are retryable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'favorites');
  await page.goto('/?view=favorites');
  await expect(page.getByText('No favorites yet.', { exact: false })).toBeVisible();
  for (const id of [1, 2]) {
    await page.goto(`/?title=${id}`);
    await page.getByRole('button', { name: '♡ Add to favorites' }).click();
    await expect(page.getByRole('button', { name: '♥ Favorited' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: '♥ Favorited' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/?view=favorites');
  await expect(page.locator('.media-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove Cinema test movie from favorites' }).click();
  await expect(page.locator('.media-card')).toHaveCount(1);
  await page.goto('/?view=watchlist');
  await expect(page.getByText('No watchlists yet.', { exact: false })).toBeVisible();
  await page.route('**/api/account/watchlists?title_id=2', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary library outage.' }) }));
  await page.goto('/?title=2');
  await page.getByRole('button', { name: 'Add to watchlist', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary library outage.');
  await page.unroute('**/api/account/watchlists?title_id=2');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No watchlists yet.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('button', { name: 'My Watchlists', exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favorites', exact: false })).toBeVisible();
});
