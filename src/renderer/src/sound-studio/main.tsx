import React from 'react'
import ReactDOM from 'react-dom/client'
import { SoundStudio } from './SoundStudio'
import './SoundStudio.css'

ReactDOM.createRoot(document.getElementById('sound-studio-root')!).render(
  <React.StrictMode>
    <SoundStudio />
  </React.StrictMode>
)
