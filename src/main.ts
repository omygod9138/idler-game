import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/press-start-2p'
import '@fontsource/vt323'
import './ui/style.css'
import App from './ui/App.vue'
import { loadArt } from './render/art'

// Art loads first so portraits and the battle canvas never show placeholders.
loadArt().finally(() => createApp(App).use(createPinia()).mount('#app'))
