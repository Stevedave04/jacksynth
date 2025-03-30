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
  C4: { freq: 261.63, key: "a" },
  "C#4": { freq: 277.18, key: "w" },
  D4: { freq: 293.66, key: "s" },
  "D#4": { freq: 311.13, key: "e" },
  E4: { freq: 329.63, key: "d" },
  F4: { freq: 349.23, key: "f" },
  "F#4": { freq: 369.99, key: "t" },
  G4: { freq: 392.0, key: "g" },
  "G#4": { freq: 415.3, key: "y" },
  A4: { freq: 440.0, key: "h" },
  "A#4": { freq: 466.16, key: "u" },
  B4: { freq: 493.88, key: "j" },
  C5: { freq: 523.25, key: "k" },
  "C#5": { freq: 554.37, key: "o" },
  D5: { freq: 587.33, key: "l" },
  "D#5": { freq: 622.25, key: "p" },
  E5: { freq: 659.25, key: ";" },
  F5: { freq: 698.46, key: "[" },
  "F#5": { freq: 739.99, key: "]" },
  G5: { freq: 783.99, key: "\\" },
  "G#5": { freq: 830.61, key: "/" },
  A5: { freq: 880.0, key: "." },
  "A#5": { freq: 932.33, key: "," },
  B5: { freq: 987.77, key: "m" },
  C6: { freq: 1046.5, key: "l" },
  "C#6": { freq: 1108.73, key: ";" },
  D6: { freq: 1174.66, key: "l" },
  "D#6": { freq: 1244.51, key: ";" },
  E6: { freq: 1318.51, key: "m" },
  F6: { freq: 1396.91, key: "l" },
  "F#6": { freq: 1479.98, key: ";" },
  G6: { freq: 1567.98, key: ";" },
  "G#6": { freq: 1661.22, key: "[" },
  A6: { freq: 1760.0, key: "]" },
  "A#6": { freq: 1864.66, key: "\\" },
  B6: { freq: 1975.53, key: "/" },
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

      let currentNote = null

      const handleKeyDown = (note) => {
        initAudioContext()
        startNote(note)
        key.classList.add("active")
        currentNote = note
      }

      const handleKeyUp = (note) => {
        stopNote(note)
        key.classList.remove("active")
        currentNote = null
      }

      key.addEventListener("mousedown", () => handleKeyDown(noteName))
      key.addEventListener("mouseup", () => handleKeyUp(noteName))
      key.addEventListener("mouseleave", () => {
        if (currentNote) handleKeyUp(noteName)
      })

      whiteKeysContainer.appendChild(key)
    })
  })

  // Calculate key dimensions for responsive positioning
  const whiteKeyWidth = 45 // Base width in pixels
  const whiteKeysPerOctave = 7

  // Create black keys with improved positioning
  octaves.forEach((octave, octaveIndex) => {
    octavePattern.forEach(({ note, hasSharp }, noteIndex) => {
      if (hasSharp) {
        const key = document.createElement("button")
        key.className = "black-key"
        const noteName = note + "#" + octave
        key.dataset.note = noteName

        // Calculate position based on white key index
        const octaveOffset = octaveIndex * whiteKeysPerOctave * whiteKeyWidth
        let noteOffset = 0

        // Calculate offset within the octave
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

        // Set position using calculated values
        const position = octaveOffset + noteOffset * whiteKeyWidth
        key.style.left = `${position}px`

        const label = document.createElement("div")
        label.className = "key-label"
        const keyboardKey = baseNoteFrequencies[noteName]?.key || ""
        label.innerHTML = `${noteName}\n(${keyboardKey})`
        key.appendChild(label)

        let currentNote = null

        const handleKeyDown = (note) => {
          initAudioContext()
          startNote(note)
          key.classList.add("active")
          currentNote = note
        }

        const handleKeyUp = (note) => {
          stopNote(note)
          key.classList.remove("active")
          currentNote = null
        }

        key.addEventListener("mousedown", () => handleKeyDown(noteName))
        key.addEventListener("mouseup", () => handleKeyUp(noteName))
        key.addEventListener("mouseleave", () => {
          if (currentNote) handleKeyUp(noteName)
        })

        blackKeysContainer.appendChild(key)
      }
    })
  })

  keyboardDiv.appendChild(whiteKeysContainer)
  keyboardDiv.appendChild(blackKeysContainer)

  // Add window resize handler for responsive keyboard
  window.addEventListener("resize", () => {
    // Recalculate positions of black keys on resize
    const blackKeys = blackKeysContainer.querySelectorAll(".black-key")
    const whiteKeys = whiteKeysContainer.querySelectorAll(".white-key")

    if (whiteKeys.length === 0) return

    // Get actual white key width from rendered element
    const actualWhiteKeyWidth = whiteKeys[0].offsetWidth

    blackKeys.forEach((key) => {
      const noteName = key.dataset.note
      const note = noteName.charAt(0)
      const octave = Number.parseInt(noteName.slice(-1))
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

      const position = octaveIndex * whiteKeysPerOctave * actualWhiteKeyWidth + noteOffset * actualWhiteKeyWidth
      key.style.left = `${position}px`
    })
  })
}

export function initializeStepSequencer() {
  const sequencerGrid = document.getElementById("stepSequencer")
  if (!sequencerGrid) return

  sequencerGrid.innerHTML = "" // Clear existing content

  sequencer.steps.forEach((step, index) => {
    const stepElement = document.createElement("div")
    stepElement.className = "sequencer-step"
    stepElement.textContent = step === 0 ? "" : step
    stepElement.addEventListener("click", () => {
      sequencer.steps[index] = (sequencer.steps[index] + 1) % 9 // 0-8 values
      stepElement.textContent = sequencer.steps[index] === 0 ? "" : sequencer.steps[index]
    })
    sequencerGrid.appendChild(stepElement)
  })

  // Create start and stop buttons
  const sequencerStartButton = document.createElement("button")
  sequencerStartButton.id = "startSequencer"
  sequencerStartButton.textContent = "Start"
  sequencerStartButton.addEventListener("click", startSequencer)

  const sequencerStopButton = document.createElement("button")
  sequencerStopButton.id = "stopSequencer"
  sequencerStopButton.textContent = "Stop"
  sequencerStopButton.addEventListener("click", stopSequencer)

  // Append buttons to the sequencer grid
  sequencerGrid.appendChild(sequencerStartButton)
  sequencerGrid.appendChild(sequencerStopButton)
}

export function startSequencer() {
  if (sequencer.isPlaying) return
  sequencer.isPlaying = true
  sequencer.interval = setInterval(() => {
    playStep(sequencer.currentStep)
    sequencer.currentStep = (sequencer.currentStep + 1) % sequencer.steps.length
  }, 60000 / 120) // 120 BPM
}

export function stopSequencer() {
  if (!sequencer.isPlaying) return
  sequencer.isPlaying = false
  clearInterval(sequencer.interval)
}

export function playStep(step) {
  // This is a placeholder - the actual implementation will be in main.js
  console.log(`Playing step ${step}: ${sequencer.steps[step]}`)
}

export function initializeDrumSequencer() {
  const drumGrid = document.getElementById("drum-machine-grid");
  if (!drumGrid) return;

  drumGrid.innerHTML = "";
  drumGrid.className = "drum-grid";

  const drums = ['Kick', 'Snare', 'HiHat', 'Clap'];
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
        // Trigger event for drum machine
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
    <button id="playDrums">Play</button>
    <button id="stopDrums">Stop</button>
    <div class="control-group">
      <label for="drumTempo">Tempo:</label>
      <input type="range" id="drumTempo" min="60" max="200" value="120">
      <span class="value-display">120</span>
    </div>
  `;
  drumGrid.appendChild(controls);
}

export { baseNoteFrequencies }

