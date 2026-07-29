import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const distDirectory = resolve('dist')
const manifestPath = join(distDirectory, 'manifest.json')

function readManifest() {
  assert.ok(
    existsSync(manifestPath),
    'dist/manifest.json must exist after the production build',
  )

  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function resolveExtensionFile(relativePath) {
  return join(distDirectory, ...relativePath.split('/'))
}

function readPngDimensions(filePath) {
  const contents = readFileSync(filePath)

  assert.equal(
    contents.subarray(1, 4).toString('ascii'),
    'PNG',
    `${filePath} must be a PNG file`,
  )

  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  }
}

test('production build emits a permission-free Manifest V3 extension', () => {
  const manifest = readManifest()

  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.name, 'Chat2TeX')
  assert.equal(manifest.version, '0.1.0')
  assert.equal(manifest.action.default_popup, 'src/popup/index.html')
  assert.equal(typeof manifest.background.service_worker, 'string')
  assert.equal(manifest.background.type, 'module')
  assert.ok(!Object.hasOwn(manifest, 'permissions'))
  assert.ok(!Object.hasOwn(manifest, 'host_permissions'))
  assert.ok(!Object.hasOwn(manifest, 'content_scripts'))

  const referencedFiles = new Set([
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ])

  for (const relativePath of referencedFiles) {
    assert.ok(
      existsSync(resolveExtensionFile(relativePath)),
      `${relativePath} must exist in dist`,
    )
  }
})

test('production build contains correctly sized PNG icons', () => {
  const manifest = readManifest()

  for (const [size, relativePath] of Object.entries(manifest.icons)) {
    assert.deepEqual(
      readPngDimensions(resolveExtensionFile(relativePath)),
      { width: Number(size), height: Number(size) },
    )
  }
})
