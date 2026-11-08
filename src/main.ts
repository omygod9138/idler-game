import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/press-start-2p'
import '@fontsource/vt323'
import './ui/style.css'
import App from './ui/App.vue'

createApp(App).use(createPinia()).mount('#app')
