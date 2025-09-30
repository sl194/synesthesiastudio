# 🎨🧠🎵 Synesthesia Studio
**Express your emotions across modalities — from drawing to sound.**  
This prototype uses **AI** to interpret an uploaded drawing or image, extract its emotional tone and visual features, and generate corresponding **music parameters** and an **8-bar MIDI melody** using **Magenta**.

---

## ✨ Overview

Many people express themselves through different forms — some through **visual art**, others through **music**.  
This prototype bridges modalities:  
- **Upload a drawing** →  
- **AI interprets its emotion and style** →  
- **Extracts features** (color, balance, texture) →  
- **Maps to music parameters** (tempo, mode, chords, articulation) →  
- **Generates a primer melody** →  
- **Runs Magenta** to create a full **MIDI piece** you can play.

---

## 🧠 System Architecture

```plaintext
User Uploads Image
       ↓
[ Next.js Frontend (page.js) ]
  - Upload + GPT analysis
  - Extract visual features
  - Map to music parameters
  - Build 8-bar primer JSON
       ↓
[ API Route (route.js) ]
  - Receives JSON
  - Calls Python Magenta script
       ↓
[ Python Script (generatemelody.py) ]
  - Runs `melody_rnn_generate`
  - Saves MIDI file
       ↓
[ Output MIDI ]
  - Shown/downloadable on web

