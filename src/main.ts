import { createApp } from 'vue'
import App from './App.vue'
import '@codeless/ui/styles.css'

createApp(App)
  .mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })
