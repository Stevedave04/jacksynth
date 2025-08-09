// Base note frequencies and key mappings
const baseNoteFrequencies = {
  C3: { freq: 130.81, key: "z" },
  "C#3": { freq: 138.59, key: "s" },
  D3: { freq: 146.83, key: "x" },
  "D#3": { freq: 155.56, key: "d" },
  E3: { freq: 164.81, key: "c" },
  F3: { freq: 174.61, key: "v" },
  "F#3": { freq: 185.0, key: "g" },
  G3: { freq: 196.0, key: "b" },
  "G#3": { freq: 207.65, key: "h" },
  A3: { freq: 220.0, key: "n" },
  "A#3": { freq: 233.08, key: "j" },
  B3: { freq: 246.94, key: "m" },
  C4: { freq: 261.63, key: "q" },
  "C#4": { freq: 277.18, key: "2" },
  D4: { freq: 293.66, key: "w" },
  "D#4": { freq: 311.13, key: "3" },
  E4: { freq: 329.63, key: "e" },
  F4: { freq: 349.23, key: "r" },
  "F#4": { freq: 369.99, key: "5" },
  G4: { freq: 392.0, key: "t" },
  "G#4": { freq: 415.3, key: "6" },
  A4: { freq: 440.0, key: "y" },
  "A#4": { freq: 466.16, key: "7" },
  B4: { freq: 493.88, key: "u" },
  C5: { freq: 523.25, key: "i" },
  "C#5": { freq: 554.37, key: "9" },
  D5: { freq: 587.33, key: "o" },
  "D#5": { freq: 622.25, key: "0" },
  E5: { freq: 659.25, key: "p" },
  F5: { freq: 698.46, key: "[" },
  "F#5": { freq: 739.99, key: "=" },
  G5: { freq: 783.99, key: "]" },
  "G#5": { freq: 830.61, key: "\\" },
  A5: { freq: 880.0, key: "a" },
  "A#5": { freq: 932.33, key: "l" },
  B5: { freq: 987.77, key: ";" }
}

// Step Sequencer Configuration
const sequencer = {
  steps: Array(16).fill(0),
  currentStep: 0,
  isPlaying: false,
  interval: null,
  target: "pitch",
  stepValues: [-12, -7, -5, 0, 2, 4, 7, 12],
}

export function createKeyboard(options) {
  const { keyboardDiv, octaves, initAudioContext, startNote, stopNote } = options

  if (!keyboardDiv) {
    console.error("Keyboard div not found!")
    return
  }

  keyboardDiv.innerHTML = ""
  const whiteKeysContainer = document.createElement("div")
  whiteKeysContainer.className = "white-keys"
  const blackKeysContainer = document.createElement("div")
  blackKeysContainer.className = "black-keys"

  const octavePattern = [
    { note: "C", hasSharp: true },
    { note: "D", hasSharp: true },
    { note: "E", hasSharp: false },
    { note: "F", hasSharp: true },
    { note: "G", hasSharp: true },
    { note: "A", hasSharp: true },
    { note: "B", hasSharp: false },
  ]

  // Track active notes and mouse state
  const activeNotes = new Set()
  let isMouseDown = false
  let draggedNote = null

  // Add mouse down/up listeners to the keyboard div
  keyboardDiv.addEventListener('mousedown', (e) => {
    isMouseDown = true
    e.preventDefault() // Prevent text selection
  })
  
  keyboardDiv.addEventListener('mouseup', (e) => {
    isMouseDown = false
    draggedNote = null
    // Clean up any stuck notes
    activeNotes.forEach(note => {
      stopNote(note)
      const key = document.querySelector(`[data-note="${note}"]`)
      if (key) key.classList.remove('active')
    })
    activeNotes.clear()
  })
  
  keyboardDiv.addEventListener('mouseleave', (e) => {
    if (isMouseDown) {
      isMouseDown = false
      draggedNote = null
      // Clean up any stuck notes
      activeNotes.forEach(note => {
        stopNote(note)
        const key = document.querySelector(`[data-note="${note}"]`)
        if (key) key.classList.remove('active')
      })
      activeNotes.clear()
    }
  })
  
  // Add global mouse up listener to catch mouse releases outside the keyboard
  document.addEventListener('mouseup', () => {
    if (isMouseDown) {
      isMouseDown = false
      draggedNote = null
      activeNotes.forEach(note => {
        stopNote(note)
        const key = document.querySelector(`[data-note="${note}"]`)
        if (key) key.classList.remove('active')
      })
      activeNotes.clear()
    }
  })

  // Create white keys
  octaves.forEach((octave) => {
    octavePattern.forEach(({ note }) => {
      const key = document.createElement("button")
      key.className = "white-key"
      const noteName = note + octave
      key.dataset.note = noteName

      const label = document.createElement("div")
      label.className = "key-label"
      const keyboardKey = baseNoteFrequencies[noteName]?.key || ""
      label.innerHTML = `${noteName}\n(${keyboardKey})`
      key.appendChild(label)

      key.addEventListener("mousedown", () => {
        if (activeNotes.has(noteName)) return // Prevent double-triggering
        initAudioContext()
        startNote(noteName)
        key.classList.add("active")
        activeNotes.add(noteName)
        draggedNote = noteName
      })

      key.addEventListener("mouseup", () => {
        if (activeNotes.has(noteName)) {
          stopNote(noteName)
          key.classList.remove("active")
          activeNotes.delete(noteName)
        }
      })

      key.addEventListener("mouseleave", () => {
        if (activeNotes.has(noteName)) {
          stopNote(noteName)
          key.classList.remove("active")
          activeNotes.delete(noteName)
        }
      })

      key.addEventListener("mouseenter", () => {
        if (isMouseDown && !activeNotes.has(noteName)) {
          initAudioContext()
          startNote(noteName)
          key.classList.add("active")
          activeNotes.add(noteName)
          // Stop the previously dragged note if different
          if (draggedNote && draggedNote !== noteName && activeNotes.has(draggedNote)) {
            stopNote(draggedNote)
            const prevKey = document.querySelector(`[data-note="${draggedNote}"]`)
            if (prevKey) prevKey.classList.remove('active')
            activeNotes.delete(draggedNote)
          }
          draggedNote = noteName
        }
      })

      whiteKeysContainer.appendChild(key)
    })
  })

  // Create black keys
  octaves.forEach((octave) => {
    octavePattern.forEach(({ note, hasSharp }, index) => {
      if (hasSharp) {
        const key = document.createElement("button")
        key.className = "black-key"
        const noteName = note + "#" + octave
        key.dataset.note = noteName

        const label = document.createElement("div")
        label.className = "key-label"
        const keyboardKey = baseNoteFrequencies[noteName]?.key || ""
        label.innerHTML = `${noteName}\n(${keyboardKey})`
        key.appendChild(label)

        key.addEventListener("mousedown", () => {
          if (activeNotes.has(noteName)) return // Prevent double-triggering
          initAudioContext()
          startNote(noteName)
          key.classList.add("active")
          activeNotes.add(noteName)
          draggedNote = noteName
        })

        key.addEventListener("mouseup", () => {
          if (activeNotes.has(noteName)) {
            stopNote(noteName)
            key.classList.remove("active")
            activeNotes.delete(noteName)
          }
        })

        key.addEventListener("mouseleave", () => {
          if (activeNotes.has(noteName)) {
            stopNote(noteName)
            key.classList.remove("active")
            activeNotes.delete(noteName)
          }
        })

        key.addEventListener("mouseenter", () => {
          if (isMouseDown && !activeNotes.has(noteName)) {
            initAudioContext()
            startNote(noteName)
            key.classList.add("active")
            activeNotes.add(noteName)
            // Stop the previously dragged note if different
            if (draggedNote && draggedNote !== noteName && activeNotes.has(draggedNote)) {
              stopNote(draggedNote)
              const prevKey = document.querySelector(`[data-note="${draggedNote}"]`)
              if (prevKey) prevKey.classList.remove('active')
              activeNotes.delete(draggedNote)
            }
            draggedNote = noteName
          }
        })

        blackKeysContainer.appendChild(key)
      }
    })
  })

  keyboardDiv.appendChild(whiteKeysContainer)
  keyboardDiv.appendChild(blackKeysContainer)

  // Add window resize handler for responsive keyboard
  window.addEventListener("resize", () => {
    const blackKeys = blackKeysContainer.querySelectorAll(".black-key")
    const whiteKeys = whiteKeysContainer.querySelectorAll(".white-key")

    if (whiteKeys.length === 0) return

    // Get actual white key width from rendered element
    const actualWhiteKeyWidth = whiteKeys[0].offsetWidth

    blackKeys.forEach((key) => {
      const noteName = key.dataset.note
      const note = noteName.charAt(0)
      const octave = parseInt(noteName.slice(-1))
      const octaveIndex = octaves.indexOf(octave)

      let noteOffset = 0
      switch (note) {
        case "C":
          noteOffset = 0.5
          break
        case "D":
          noteOffset = 1.5
          break
        case "F":
          noteOffset = 3.5
          break
        case "G":
          noteOffset = 4.5
          break
        case "A":
          noteOffset = 5.5
          break
      }

      const position = (octaveIndex * 7 + noteOffset) * actualWhiteKeyWidth
      key.style.left = `${position}px`
    })
  })
}

export function initializeStepSequencer() {
  const sequencerGrid = document.getElementById("stepSequencer")
  if (!sequencerGrid) return

  sequencerGrid.innerHTML = ""

  sequencer.steps.forEach((step, index) => {
    const stepElement = document.createElement("div")
    stepElement.className = "sequencer-step"
    stepElement.textContent = step === 0 ? "" : step
    stepElement.addEventListener("click", () => {
      sequencer.steps[index] = (sequencer.steps[index] + 1) % 9
      stepElement.textContent = sequencer.steps[index] === 0 ? "" : sequencer.steps[index]
    })
    sequencerGrid.appendChild(stepElement)
  })
}

export function initializeDrumSequencer() {
  const drumGrid = document.getElementById("drum-machine-grid");
  if (!drumGrid) return;

  drumGrid.innerHTML = "";
  drumGrid.className = "drum-grid";

  const drums = ['Kick', 'Snare', 'Hi-Hat', 'Clap'];
  drums.forEach((drum, row) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'drum-row';
    
    const label = document.createElement('div');
    label.className = 'drum-row-label';
    label.textContent = drum;
    rowDiv.appendChild(label);

    for (let step = 0; step < 16; step++) {
      const pad = document.createElement('div');
      pad.className = 'drum-pad';
      pad.dataset.row = row;
      pad.dataset.step = step;
      pad.addEventListener('click', (e) => {
        pad.classList.toggle('active');
        const event = new CustomEvent('drumpad-toggle', {
          detail: { row, step }
        });
        document.dispatchEvent(event);
      });
      rowDiv.appendChild(pad);
    }
    drumGrid.appendChild(rowDiv);
  });

  const controls = document.createElement('div');
  controls.className = 'drum-controls';
  controls.innerHTML = `
    <button id="playDrums">▶ Play</button>
    <button id="stopDrums">⏹ Stop</button>
    <button id="clearDrums">🗑 Clear</button>
    <div class="control-group">
      <label for="drumTempo">Tempo:</label>
      <input type="range" id="drumTempo" min="60" max="200" value="120">
      <span class="value-display">120</span>
    </div>
  `;
  drumGrid.appendChild(controls);
}

export { baseNoteFrequencies }