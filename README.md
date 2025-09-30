# 🎨🧠🎵 Synesthesia Studio
**Express your emotions across modalities — from drawing to sound.**  
This prototype uses **AI** to interpret an uploaded drawing or image, extract its emotional tone and visual features, and generate corresponding **music parameters** and an **8-bar MIDI melody** using **Magenta**.

---

## ✨ Overview

Many people express themselves through different forms — some through **visual art**, others through **music**.  
This prototype bridges modalities:  
Step 1: **Upload a drawing**  
Step 2: **AI interprets its emotion and style**  
Step 3: **Extracts features** (e.g., color, balance, texture) 
Step 4: **Maps to music parameters** (e.g., tempo, mode, chords, articulation)  
Step 5: **Generates a primer melody**  
Step 6: **Runs Magenta** to create a full **MIDI piece** you can play or listen to.

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

