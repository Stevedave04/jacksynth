import { Visualizer } from "./visualization.js"
import { SynthTutorial } from "./tutorial.js"
import { createKeyboard, baseNoteFrequencies, initializeStepSequencer, initializeDrumSequencer } from "./keyboard.js"
import { DrumMachine } from './drumMachine.js';

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed")

  let audioContext
  let masterCompressor
  const stepSequencerTimer = null
  let mediaRecorder
  let audioChunks = []
  let drumMachine

  // Effect Nodes (declared globally)
  const effectsChain = {} // To hold references to nodes in the chain

  /**
   * Initializes the audio context and sets up the master compressor.
   * This should be called only once.
   */
  function initAudioContext() {
    if (audioContext) return audioContext

    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      masterCompressor = audioContext.createDynamicsCompressor()
      masterCompressor.connect(audioContext.destination)

      // Initialize visualizer
      const visualizer = new Visualizer(audioContext, masterCompressor)

      // Setup effects chain
      setupEffectsChain()

      // Setup envelope follower
      setupEnvelopeFollower()

      console.log("Audio context initialized successfully")
    } catch (error) {
      console.error("Failed to initialize audio context:", error)
    }

    return audioContext
  }

  /**
   * Initializes the audio effect nodes and sets up a default connection chain.
   * This should be called once after the AudioContext is created.
   */
  function setupEffectsChain() {
    if (!audioContext) {
      console.error("AudioContext not initialized before setting up effects chain.")
      return
    }

    // Create core effect nodes
    effectsChain.filterNode = audioContext.createBiquadFilter()
    effectsChain.filterNode.type = "lowpass"
    effectsChain.filterNode.frequency.value = 20000
    effectsChain.filterNode.Q.value = 1

    effectsChain.distortionNode = audioContext.createWaveShaper()
    // Basic Distortion Curve
    const k = 50 // Amount of distortion
    const n_samples = 44100
    const curve = new Float32Array(n_samples)
    const deg = Math.PI / 180
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x))
    }
    effectsChain.distortionNode.curve = curve
    effectsChain.distortionNode.oversample = "4x"

    effectsChain.delayNode = audioContext.createDelay(5.0)
    effectsChain.delayNode.delayTime.value = 0.3

    effectsChain.delayFeedbackNode = audioContext.createGain()
    effectsChain.delayFeedbackNode.gain.value = 0.4

    effectsChain.delayDryNode = audioContext.createGain()
    effectsChain.delayDryNode.gain.value = 0.7

    effectsChain.delayWetNode = audioContext.createGain()
    effectsChain.delayWetNode.gain.value = 0.3

    // Create a convolver for reverb
    effectsChain.reverbNode = audioContext.createConvolver()

    // Create a simple impulse response for reverb
    const reverbLength = 2 // seconds
    const sampleRate = audioContext.sampleRate
    const impulseResponse = audioContext.createBuffer(
      2, // stereo
      reverbLength * sampleRate,
      sampleRate,
    )

    // Fill the impulse response buffer
    for (let channel = 0; channel < impulseResponse.numberOfChannels; channel++) {
      const channelData = impulseResponse.getChannelData(channel)
      for (let i = 0; i < channelData.length; i++) {
        // Exponential decay
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / channelData.length, 2)
      }
    }

    effectsChain.reverbNode.buffer = impulseResponse

    effectsChain.reverbDryNode = audioContext.createGain()
    effectsChain.reverbDryNode.gain.value = 0.7

    effectsChain.reverbWetNode = audioContext.createGain()
    effectsChain.reverbWetNode.gain.value = 0.3

    // Connect the default chain
    updateEffectsChain()

    console.log("Effects chain initialized successfully")
  }

  /**
   * Updates the effects chain based on user settings.
   * This should be called whenever effect settings change.
   */
  function updateEffectsChain() {
    if (!audioContext || !effectsChain.filterNode) {
      console.error("Effects chain not initialized")
      return
    }

    // Disconnect all nodes first
    Object.values(effectsChain).forEach((node) => {
      if (node && node.disconnect) {
        try {
          node.disconnect()
        } catch (e) {
          // Ignore disconnection errors
        }
      }
    })

    // Get effect settings from UI
    const filterEnabled = true // Filter is always enabled
    const distortionEnabled = document.getElementById("distortion-enabled")?.checked || false
    const delayEnabled = document.getElementById("delay-enabled")?.checked || false
    const reverbEnabled = document.getElementById("reverb-enabled")?.checked || false
    const compressorEnabled = document.getElementById("compressor-enabled")?.checked || false

    // Update filter settings
    const filterCutoff = Number.parseFloat(document.getElementById("filterCutoff")?.value || 20000)
    const filterResonance = Number.parseFloat(document.getElementById("filterResonance")?.value || 1)
    effectsChain.filterNode.frequency.value = filterCutoff
    effectsChain.filterNode.Q.value = filterResonance

    // Update distortion settings
    if (distortionEnabled) {
      const distortionAmount = Number.parseFloat(document.getElementById("distortion-amount")?.value || 20)
      // Update distortion curve based on amount
      const k = distortionAmount
      const n_samples = 44100
      const curve = new Float32Array(n_samples)
      const deg = Math.PI / 180
      for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x))
      }
      effectsChain.distortionNode.curve = curve
    }

    // Update delay settings
    if (delayEnabled) {
      const delayTime = Number.parseFloat(document.getElementById("delay-time")?.value || 0.3)
      const delayFeedback = Number.parseFloat(document.getElementById("delay-feedback")?.value || 0.4)
      const delayMix = Number.parseFloat(document.getElementById("delay-mix")?.value || 0.3)

      effectsChain.delayNode.delayTime.value = delayTime
      effectsChain.delayFeedbackNode.gain.value = delayFeedback
      effectsChain.delayWetNode.gain.value = delayMix
      effectsChain.delayDryNode.gain.value = 1 - delayMix
    }

    // Update reverb settings
    if (reverbEnabled) {
      const reverbDecay = Number.parseFloat(document.getElementById("reverb-decay")?.value || 2)
      const reverbMix = Number.parseFloat(document.getElementById("reverb-mix")?.value || 0.3)

      // Update reverb impulse response based on decay time
      const sampleRate = audioContext.sampleRate
      const impulseLength = reverbDecay * sampleRate
      const impulseResponse = audioContext.createBuffer(
        2, // stereo
        impulseLength,
        sampleRate,
      )

      // Fill the impulse response buffer
      for (let channel = 0; channel < impulseResponse.numberOfChannels; channel++) {
        const channelData = impulseResponse.getChannelData(channel)
        for (let i = 0; i < channelData.length; i++) {
          // Exponential decay
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / channelData.length, 2)
        }
      }

      effectsChain.reverbNode.buffer = impulseResponse
      effectsChain.reverbWetNode.gain.value = reverbMix
      effectsChain.reverbDryNode.gain.value = 1 - reverbMix
    }

    // Update compressor settings
    if (compressorEnabled) {
      const threshold = Number.parseFloat(document.getElementById("compressor-threshold")?.value || -24)
      const ratio = Number.parseFloat(document.getElementById("compressor-ratio")?.value || 4)
      const attack = Number.parseFloat(document.getElementById("compressor-attack")?.value || 5) / 1000 // Convert to seconds
      const release = Number.parseFloat(document.getElementById("compressor-release")?.value || 250) / 1000 // Convert to seconds

      masterCompressor.threshold.value = threshold
      masterCompressor.ratio.value = ratio
      masterCompressor.attack.value = attack
      masterCompressor.release.value = release
    }

    // Build the effects chain based on enabled effects
    const currentNode = effectsChain.filterNode // Start with filter (always enabled)
    let lastNode = currentNode

    // Add distortion if enabled
    if (distortionEnabled) {
      lastNode.connect(effectsChain.distortionNode)
      lastNode = effectsChain.distortionNode
    }

    // Add delay if enabled
    if (delayEnabled) {
      // Create a split for dry/wet
      lastNode.connect(effectsChain.delayDryNode)
      lastNode.connect(effectsChain.delayNode)
      effectsChain.delayNode.connect(effectsChain.delayFeedbackNode)
      effectsChain.delayFeedbackNode.connect(effectsChain.delayNode)
      effectsChain.delayNode.connect(effectsChain.delayWetNode)

      // Create a gain node to sum the dry and wet signals
      const delayMixNode = audioContext.createGain()
      effectsChain.delayDryNode.connect(delayMixNode)
      effectsChain.delayWetNode.connect(delayMixNode)

      lastNode = delayMixNode
    }

    // Add reverb if enabled
    if (reverbEnabled) {
      // Create a split for dry/wet
      lastNode.connect(effectsChain.reverbDryNode)
      lastNode.connect(effectsChain.reverbNode)
      effectsChain.reverbNode.connect(effectsChain.reverbWetNode)

      // Create a gain node to sum the dry and wet signals
      const reverbMixNode = audioContext.createGain()
      effectsChain.reverbDryNode.connect(reverbMixNode)
      effectsChain.reverbWetNode.connect(reverbMixNode)

      lastNode = reverbMixNode
    }

    // Connect the last node to the master compressor
    lastNode.connect(masterCompressor)

    console.log("Effects chain updated successfully")
  }

  function initRecording() {
    const dest = audioContext.createMediaStreamDestination()
    masterCompressor.connect(dest)
    mediaRecorder = new MediaRecorder(dest.stream)

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" })
      const audioUrl = URL.createObjectURL(audioBlob)
      const downloadButton = document.getElementById("downloadButton")
      downloadButton.href = audioUrl
      downloadButton.download = "recording.wav"
      downloadButton.disabled = false
    }
  }

  document.getElementById("recordButton")?.addEventListener("click", () => {
    if (!audioContext) initAudioContext()
    if (!mediaRecorder) initRecording()

    audioChunks = []
    mediaRecorder.start()
    document.getElementById("recordButton").classList.add("recording")
    document.getElementById("recordButton").disabled = true
    document.getElementById("stopButton").disabled = false
  })

  document.getElementById("stopButton")?.addEventListener("click", () => {
    mediaRecorder.stop()
    document.getElementById("recordButton").classList.remove("recording")
    document.getElementById("recordButton").disabled = false
    document.getElementById("stopButton").disabled = true
  })

  try {
    const keyboardDiv = document.getElementById("keyboard")
    if (!keyboardDiv) {
      throw new Error("Keyboard div not found")
    }

    console.log("Keyboard div found")
  } catch (error) {
    console.error("Failed to find keyboard div:", error)
    const errorDiv = document.getElementById("keyboard-error")
    if (errorDiv) {
      errorDiv.style.display = "block"
    }
  }

  // DOM Elements - Synth Controls
  const keyboardDiv = document.getElementById("keyboard")
  const resetButton = document.getElementById("resetToDefault")
  const waveformSelect1 = document.getElementById("waveform1")
  const waveformSelect2 = document.getElementById("waveform2")
  const detuneSlider = document.getElementById("detune")
  const oscMixSlider = document.getElementById("oscMix")
  const volumeSlider = document.getElementById("volume")
  const attackSlider = document.getElementById("attack")
  const decaySlider = document.getElementById("decay")
  const sustainSlider = document.getElementById("sustain")
  const releaseSlider = document.getElementById("release")
  const filterCutoffSlider = document.getElementById("filterCutoff")
  const filterResonanceSlider = document.getElementById("filterResonance")
  const lfoWaveformSelect = document.getElementById("lfoWaveform")
  const lfoFrequencySlider = document.getElementById("lfoFrequency")
  const lfoAmountSlider = document.getElementById("lfoAmount")
  const lfoTargetSelect = document.getElementById("lfoTarget")

  const arpEnabledToggle = document.getElementById("arpEnabled")
  const arpPatternSelect = document.getElementById("arpPattern")
  const arpRateSlider = document.getElementById("arpRate")
  const arpOctavesSlider = document.getElementById("arpOctaves")

  // DOM Elements - Effects Controls
  const reverbEnabledToggle = document.getElementById("reverb-enabled")
  const reverbMixSlider = document.getElementById("reverb-mix")
  const reverbDecaySlider = document.getElementById("reverb-decay")

  const delayEnabledToggle = document.getElementById("delay-enabled")
  const delayTimeSlider = document.getElementById("delay-time")
  const delayFeedbackSlider = document.getElementById("delay-feedback")
  const delayMixSlider = document.getElementById("delay-mix")

  const distortionEnabledToggle = document.getElementById("distortion-enabled")
  const distortionAmountSlider = document.getElementById("distortion-amount")
  const distortionToneSlider = document.getElementById("distortion-tone")

  const chorusEnabledToggle = document.getElementById("chorus-enabled")
  const chorusRateSlider = document.getElementById("chorus-rate")
  const chorusDepthSlider = document.getElementById("chorus-depth")
  const chorusMixSlider = document.getElementById("chorus-mix")

  const compressorEnabledToggle = document.getElementById("compressor-enabled")
  const compressorThresholdSlider = document.getElementById("compressor-threshold")
  const compressorRatioSlider = document.getElementById("compressor-ratio")
  const compressorAttackSlider = document.getElementById("compressor-attack")
  const compressorReleaseSlider = document.getElementById("compressor-release")

  const filterTypeSelect = document.getElementById("filterType")

  // DOM Elements - Patch Controls
  const patchNameInput = document.getElementById("patchName")
  const savePatchButton = document.getElementById("savePatch")
  const patchList = document.getElementById("patchList")

  // Tab Navigation
  const tabButtons = document.querySelectorAll(".tab-button")
  const tabContents = document.querySelectorAll(".tab-content")

  // Audio Context and Nodes
  const activeOscillators = {}

  // Arpeggiator state
  let arpeggiatorActive = false
  let arpeggiatorNotes = []
  const arpeggiatorIndex = 0
  let arpeggiatorTimer = null

  // Step Sequencer Configuration
  const sequencer = {
    steps: Array(16).fill(0),
    currentStep: 0,
    isPlaying: false,
    interval: null,
    target: "pitch",
    stepValues: [-12, -7, -5, 0, 2, 4, 7, 12],
  }

  // Envelope Follower
  const envelopeFollower = {
    sensitivity: 0.5,
    target: "filter",
    analyser: null,
    dataArray: null,
    lastValue: 0,
  }

  const noteFrequencies = Object.fromEntries(
    Object.entries(baseNoteFrequencies).map(([note, data]) => [note, data.freq]),
  )

  const microtonalSettings = {}

  const keyNoteMap = {}
  Object.entries(baseNoteFrequencies).forEach(([note, data]) => {
    if (data.key) {
      keyNoteMap[data.key] = note
    }
  })

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      console.log("Tab clicked:", button.dataset.tab)

      tabButtons.forEach((btn) => btn.classList.remove("active"))
      tabContents.forEach((content) => content.classList.remove("active"))

      button.classList.add("active")
      const tabId = button.dataset.tab
      const tabContent = document.getElementById(`${tabId}-tab`)

      if (tabContent) {
        tabContent.classList.add("active")
        console.log("Activated tab content:", tabId)
        if (tabId === "drum-machine") {
          initializeDrumSequencer()
          initDrumMachine()
        }
      } else {
        console.error("Tab content not found:", tabId)
      }
    })
  })

  function setupValueDisplays() {
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
      const valueDisplay = slider.nextElementSibling
      if (valueDisplay && valueDisplay.classList.contains("value-display")) {
        valueDisplay.textContent = slider.value
        slider.addEventListener("input", () => {
          valueDisplay.textContent = slider.value
        })
      }
    })
  }

  function resetToDefaultValues() {
    waveformSelect1.value = "sine"
    waveformSelect2.value = "sine"
    detuneSlider.value = "0"
    oscMixSlider.value = "0.5"
    volumeSlider.value = "0.5"

    attackSlider.value = "0.1"
    decaySlider.value = "0.1"
    sustainSlider.value = "0.8"
    releaseSlider.value = "0.5"

    filterCutoffSlider.value = "20000"
    filterResonanceSlider.value = "1"
    if (filterTypeSelect) filterTypeSelect.value = "lowpass"

    lfoWaveformSelect.value = "sine"
    lfoFrequencySlider.value = "1"
    lfoAmountSlider.value = "10"
    lfoTargetSelect.value = "filterCutoff"

    arpEnabledToggle.checked = false
    arpPatternSelect.value = "up"
    arpRateSlider.value = "4"
    arpOctavesSlider.value = "1"

    reverbEnabledToggle.checked = true
    reverbMixSlider.value = "0.3"
    reverbDecaySlider.value = "2"

    delayEnabledToggle.checked = true
    delayTimeSlider.value = "0.3"
    delayFeedbackSlider.value = "0.4"
    delayMixSlider.value = "0.3"

    distortionEnabledToggle.checked = false
    distortionAmountSlider.value = "20"
    distortionToneSlider.value = "4000"

    chorusEnabledToggle.checked = false
    chorusRateSlider.value = "1.5"
    chorusDepthSlider.value = "0.7"
    chorusMixSlider.value = "0.5"

    compressorEnabledToggle.checked = true
    compressorThresholdSlider.value = "-24"
    compressorRatioSlider.value = "4"
    compressorAttackSlider.value = "5"
    compressorReleaseSlider.value = "250"

    stopArpeggiator()

    Object.keys(microtonalSettings).forEach((note) => {
      microtonalSettings[note] = 0
    })
    updateNoteFrequencies()

    setupValueDisplays()

    if (audioContext) {
      updateEffectsChain()
    }

    console.log("Reset to default values")
    alert("All settings have been reset to default values")
  }

  arpOctavesSlider?.addEventListener("input", () => {
    if (arpeggiatorActive) {
      stopArpeggiator()
      startArpeggiator()
    }
  })

  function startNote(note, frequencyOverride = null) {
    if (!audioContext) {
      initAudioContext()
    }

    // Clean up existing note if it's somehow still active
    if (activeOscillators[note]) {
      console.log(`Cleaning up existing note ${note}`)
      stopNote(note)
      // Wait a tiny bit for cleanup
      return setTimeout(() => startNote(note, frequencyOverride), 1)
    }

    const frequency = frequencyOverride || noteFrequencies[note]
    if (!frequency) {
      console.warn(`Note frequency not found for ${note}`)
      return
    }

    const osc1 = audioContext.createOscillator()
    const osc2 = audioContext.createOscillator()
    osc1.type = waveformSelect1.value
    osc2.type = waveformSelect2.value

    osc1.frequency.setValueAtTime(frequency, audioContext.currentTime)
    osc2.frequency.setValueAtTime(frequency * Math.pow(2, detuneSlider.value / 1200), audioContext.currentTime)

    const gainNode1 = audioContext.createGain()
    const gainNode2 = audioContext.createGain()

    const oscMixValue = Number.parseFloat(oscMixSlider.value)
    gainNode1.gain.setValueAtTime(oscMixValue, audioContext.currentTime)
    gainNode2.gain.setValueAtTime(1 - oscMixValue, audioContext.currentTime)

    osc1.connect(gainNode1)
    osc2.connect(gainNode2)

    const adsrGain = audioContext.createGain()
    adsrGain.gain.setValueAtTime(0, audioContext.currentTime)
    gainNode1.connect(adsrGain)
    gainNode2.connect(adsrGain)

    // Connect to the first node in the effects chain
    adsrGain.connect(effectsChain.filterNode)

    const attackTime = Number.parseFloat(attackSlider.value)
    const decayTime = Number.parseFloat(decaySlider.value)
    const sustainLevel = Number.parseFloat(sustainSlider.value)
    const releaseTime = Number.parseFloat(releaseSlider.value)

    adsrGain.gain.linearRampToValueAtTime(1, audioContext.currentTime + attackTime)
    adsrGain.gain.linearRampToValueAtTime(sustainLevel, audioContext.currentTime + attackTime + decayTime)

    osc1.start()
    osc2.start()

    activeOscillators[note] = {
      osc1: osc1,
      osc2: osc2,
      gainNode1: gainNode1,
      gainNode2: gainNode2,
      adsrGain: adsrGain,
    }
  }

  function stopNote(note) {
    if (!audioContext || !activeOscillators[note]) return

    const oscillatorData = activeOscillators[note]
    const { osc1, osc2, adsrGain } = oscillatorData
    const releaseTime = Number.parseFloat(releaseSlider.value)

    adsrGain.gain.cancelScheduledValues(audioContext.currentTime)
    adsrGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + releaseTime)

    setTimeout(() => {
      osc1.stop()
      osc2.stop()
      osc1.disconnect()
      osc2.disconnect()
      adsrGain.disconnect()
      delete activeOscillators[note]
    }, releaseTime * 1000)
  }

  document.addEventListener("keydown", (event) => {
    const note = keyNoteMap[event.key]
    if (note && !event.repeat) {
      if (arpEnabledToggle.checked) {
        handleArpeggiatorNote(note, true)
      } else {
        startNote(note)
      }
    }
  })

  document.addEventListener("keyup", (event) => {
    const note = keyNoteMap[event.key]
    if (note) {
      if (arpEnabledToggle.checked) {
        handleArpeggiatorNote(note, false)
      } else {
        stopNote(note)
      }
    }
  })

  function updateNoteFrequencies() {
    Object.keys(microtonalSettings).forEach((note) => {
      noteFrequencies[note] = baseNoteFrequencies[note].freq * Math.pow(2, microtonalSettings[note] / 1200)
    })
  }

  function startArpeggiator() {
    if (!audioContext) initAudioContext()

    arpeggiatorActive = true
    const bpm = Number.parseInt(arpRateSlider.value) * 15
    const interval = (60 / bpm) * 1000
    const pattern = arpPatternSelect.value
    const octaves = Number.parseInt(arpOctavesSlider.value)

    let currentStep = 0

    arpeggiatorTimer = setInterval(() => {
      if (arpeggiatorNotes.length === 0) return

      let noteToPlay
      const totalSteps = arpeggiatorNotes.length * octaves

      switch (pattern) {
        case "up":
          noteToPlay = arpeggiatorNotes[currentStep % arpeggiatorNotes.length]
          const octaveShift = Math.floor(currentStep / arpeggiatorNotes.length)
          const frequency = noteFrequencies[noteToPlay] * Math.pow(2, octaveShift)
          startNote(noteToPlay, frequency)
          setTimeout(() => stopNote(noteToPlay), interval * 0.9)
          currentStep = (currentStep + 1) % totalSteps
          break

        case "down":
          currentStep = (totalSteps + currentStep - 1) % totalSteps
          noteToPlay = arpeggiatorNotes[currentStep % arpeggiatorNotes.length]
          startNote(noteToPlay)
          setTimeout(() => stopNote(noteToPlay), interval * 0.9)
          break

        case "random":
          noteToPlay = arpeggiatorNotes[Math.floor(Math.random() * arpeggiatorNotes.length)]
          const randomOctave = Math.floor(Math.random() * octaves)
          const randomFreq = noteFrequencies[noteToPlay] * Math.pow(2, randomOctave)
          startNote(noteToPlay, randomFreq)
          setTimeout(() => stopNote(noteToPlay), interval * 0.9)
          break
      }
    }, interval)
  }

  function handleArpeggiatorNote(note, isKeyDown) {
    if (!arpEnabledToggle.checked) return

    if (isKeyDown && !arpeggiatorNotes.includes(note)) {
      arpeggiatorNotes.push(note)
      if (!arpeggiatorActive) startArpeggiator()
    } else if (!isKeyDown) {
      arpeggiatorNotes = arpeggiatorNotes.filter((n) => n !== note)
      if (arpeggiatorNotes.length === 0) stopArpeggiator()
    }
  }

  function stopArpeggiator() {
    if (arpeggiatorTimer) {
      clearInterval(arpeggiatorTimer)
      arpeggiatorTimer = null
    }
    arpeggiatorActive = false
  }

  function setupEnvelopeFollower() {
    if (!audioContext) return

    envelopeFollower.analyser = audioContext.createAnalyser()
    envelopeFollower.analyser.fftSize = 2048
    envelopeFollower.dataArray = new Float32Array(envelopeFollower.analyser.frequencyBinCount)
    masterCompressor.connect(envelopeFollower.analyser)
  }

  function processEnvelopeFollower() {
    if (!envelopeFollower.analyser) return

    envelopeFollower.analyser.getFloatTimeDomainData(envelopeFollower.dataArray)
    let sum = 0
    for (let i = 0; i < envelopeFollower.dataArray.length; i++) {
      sum += Math.abs(envelopeFollower.dataArray[i])
    }
    const average = sum / envelopeFollower.dataArray.length
    const value = average * envelopeFollower.sensitivity

    applyEnvelopeFollower(value)
  }

  function applyEnvelopeFollower(value) {
    switch (envelopeFollower.target) {
      case "filter":
        if (effectsChain.filterNode) {
          const baseCutoff = Number.parseFloat(filterCutoffSlider.value)
          // Map the envelope value (0-1 range approx) to a frequency range
          const modulatedCutoff = baseCutoff + value * baseCutoff
          // Clamp the value to avoid extreme frequencies
          const clampedCutoff = Math.max(20, Math.min(20000, modulatedCutoff))
          effectsChain.filterNode.frequency.setTargetAtTime(clampedCutoff, audioContext.currentTime, 0.01)
        }
        break
    }
  }

  function initializeKeyboard() {
    const options = {
      keyboardDiv: document.getElementById("keyboard"),
      octaves: [3, 4, 5],
      baseNoteFrequencies: baseNoteFrequencies,
      initAudioContext: initAudioContext,
      startNote: startNote,
      stopNote: stopNote,
    }

    createKeyboard(options)
    console.log("Keyboard initialized")
  }

  function initDrumMachine() {
    if (!audioContext) initAudioContext();
    drumMachine = new DrumMachine(audioContext);
    drumMachine.loadSamples().then(() => {
      console.log('Drum samples loaded');
    });

    document.addEventListener('drumpad-toggle', (e) => {
      const { row, step } = e.detail;
      drumMachine.toggleStep(row, step);
    });

    document.getElementById('playDrums')?.addEventListener('click', () => {
      drumMachine.start();
    });

    document.getElementById('stopDrums')?.addEventListener('click', () => {
      drumMachine.stop();
    });

    document.getElementById('drumTempo')?.addEventListener('input', (e) => {
      drumMachine.setTempo(parseInt(e.target.value));
      e.target.nextElementSibling.textContent = e.target.value;
    });
  }

  // Initialize tutorial after ensuring SynthTutorial is available
  const tutorial = new SynthTutorial()
  document
    .getElementById("startTutorial")
    ?.addEventListener("click", () => {
      tutorial.start()
    })

  // Add event listeners for effect controls
  ;[
    reverbEnabledToggle,
    reverbMixSlider,
    reverbDecaySlider,
    delayEnabledToggle,
    delayTimeSlider,
    delayFeedbackSlider,
    delayMixSlider,
    distortionEnabledToggle,
    distortionAmountSlider,
    distortionToneSlider,
    compressorEnabledToggle,
    compressorThresholdSlider,
    compressorRatioSlider,
    compressorAttackSlider,
    compressorReleaseSlider,
  ].forEach((control) => {
    if (control) {
      control.addEventListener("change", updateEffectsChain)
      control.addEventListener("input", updateEffectsChain)
    }
  })

  resetButton?.addEventListener("click", resetToDefaultValues)

  // Initialize components
  initAudioContext()
  initializeKeyboard()
  initializeStepSequencer()
  setupValueDisplays()

  // Remove the duplicate HTML file
  console.log("JackSynth initialized successfully")
})

