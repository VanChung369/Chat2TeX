import { defineManifest } from '@crxjs/vite-plugin'

const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

export default defineManifest({
  manifest_version: 3,
  name: 'Chat2TeX',
  description: 'Chrome Extension Manifest V3 scaffold.',
  version: '0.1.0',
  icons,
  action: {
    default_title: 'Chat2TeX',
    default_popup: 'src/popup/index.html',
    default_icon: icons,
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
})
