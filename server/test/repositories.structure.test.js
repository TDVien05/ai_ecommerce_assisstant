import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// docs/ARCHITECTURE.md, "Repositories": one repository per model, both in the same feature folder.
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src')
const list = (dir, suffix) => fs.readdirSync(path.join(src, dir), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((folder) => fs.readdirSync(path.join(src, dir, folder.name)).filter((file) => file.endsWith(suffix)).map((file) => `${folder.name}/${file.slice(0, -suffix.length)}`))

test('every model has a repository in the same feature folder, and the reverse', () => {
  const models = list('models', '.js').map((name) => name.replace(/\/(.)/, (_, first) => `/${first.toLowerCase()}`)).sort()
  const repositories = list('repositories', '.repository.js').sort()
  assert.deepEqual(repositories, models)
})

test('db/ holds only infrastructure, and layer roots have no stray files', () => {
  assert.deepEqual(fs.readdirSync(path.join(src, 'db')).sort(), ['dataSource.js', 'migrate.js', 'migrations', 'pool.js', 'seed.js'])
  const files = (dir) => fs.readdirSync(path.join(src, dir), { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
  assert.deepEqual(files('repositories').sort(), ['database.js', 'guard.js'])
  assert.deepEqual(files('models'), ['index.js'])
  assert.deepEqual(files('validators'), ['validate.js'])
  assert.deepEqual(files('routes'), [], 'routers are registered in app.js, not routes/index.js')
  assert.deepEqual(fs.readdirSync(src).filter((name) => name.endsWith('.js')), ['app.js'], 'app.js is the only entry point')
})

test('services, controllers, routes and validators never touch the database directly', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : [])
  for (const layer of ['services', 'controllers', 'routes', 'validators', 'middlewares']) {
    for (const file of walk(path.join(src, layer))) {
      const text = fs.readFileSync(file, 'utf8')
      assert.doesNotMatch(text, /from '(?:\.\.\/)+db\//, `${file} imports db/; use a repository (or repositories/database.js)`)
      assert.doesNotMatch(text, /\.(?:query|connect)\(/, `${file} runs a query; move it into a repository`)
    }
  }
})

test('repositories reach the database only through config/database.js', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
  for (const file of walk(path.join(src, 'repositories'))) {
    const text = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /db\/(?:pool|dataSource)\.js/, `${file} imports db/; use config/database.js`)
    assert.doesNotMatch(text, /pool|getDataSource|\.(?:query|connect)\(/, `${file} uses a connection directly; use query() / getRepository() from config/database.js`)
  }
})

test('routers hold no zod schemas: every route input is validated in validators/', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
  for (const file of walk(path.join(src, 'routes'))) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /from 'zod'|validate\(/, file)
})
