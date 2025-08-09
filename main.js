import { Visualizer } from "./visualization.js"
import { SynthTutorial } from "./tutorial.js"
import { createKeyboard, baseNoteFrequencies, initializeStepSequencer, initializeDrumSequencer } from "./keyboard.js"
import { DrumMachine } from './drumMachine.js';

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed")

  let audioContext
  let masterCompressor
  let mediaRecorder
  let audioChunks = []
  let drumMachine
  let lfoOscillator = null
  let lfoGain = null

  // Track active keyboard notes
  const activeKeyboardNotes = new Set()
  const activeMouseNotes = new Set()

  // Effect Nodes (declared globally)
  const effectsChain = {} // To hold references to nodes in the chain

  // Arpeggiator state
  let arpeggiatorActive = false
  let arpeggiatorNotes = []
  let arpeggiatorIndex = 0
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

  // Audio Context and Nodes
  const activeOscillators = {}

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

      // Setup LFO
      setupLFO()

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

  function setupLFO() {
    if (!audioContext) return

    lfoOscillator = audioContext.createOscillator()
    lfoGain = audioContext.createGain()
    
    lfoOscillator.type = 'sine'
    lfoOscillator.frequency.value = 1
    lfoGain.gain.value = 0
    
    lfoOscillator.connect(lfoGain)
    lfoOscillator.start()
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
    const filterType = document.getElementById("filterType")?.value || "lowpass"
    effectsChain.filterNode.frequency.value = filterCutoff
    effectsChain.filterNode.Q.value = filterResonance
    effectsChain.filterNode.type = filterType

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
    let currentNode = effectsChain.filterNode // Start with filter (always enabled)
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
      updateLFO()
    }

    console.log("Reset to default values")
    alert("All settings have been reset to default values")
  }

  function updateLFO() {
    if (!lfoOscillator || !lfoGain) return

    const frequency = Number.parseFloat(lfoFrequencySlider.value)
    const amount = Number.parseFloat(lfoAmountSlider.value)
    const target = lfoTargetSelect.value
    const waveform = lfoWaveformSelect.value

    lfoOscillator.frequency.value = frequency
    lfoOscillator.type = waveform

    // Disconnect previous connections
    try {
      lfoGain.disconnect()
    } catch (e) {
      // Ignore disconnection errors
    }

    // Connect to target parameter
    switch (target) {
      case 'filterCutoff':
        if (effectsChain.filterNode) {
          lfoGain.gain.value = amount
          lfoGain.connect(effectsChain.filterNode.frequency)
        }
        break
      case 'oscillatorFrequency':
        // This would need to be connected to active oscillators
        lfoGain.gain.value = amount / 100 // Scale down for frequency modulation
        break
    }
  }

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

    // Apply volume control
    const volumeGain = audioContext.createGain()
    volumeGain.gain.value = Number.parseFloat(volumeSlider.value)
    adsrGain.connect(volumeGain)

    // Connect to the first node in the effects chain
    volumeGain.connect(effectsChain.filterNode)

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
      volumeGain: volumeGain,
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
      try {
        osc1.stop()
        osc2.stop()
        osc1.disconnect()
        osc2.disconnect()
        adsrGain.disconnect()
        oscillatorData.volumeGain.disconnect()
      } catch (e) {
        // Ignore disconnection errors
      }
      delete activeOscillators[note]
    }, releaseTime * 1000)
    
    // Clean up tracking sets
    activeKeyboardNotes.delete(note)
    activeMouseNotes.delete(note)
  }

  function stopAllNotes() {
    // Stop all active oscillators
    Object.keys(activeOscillators).forEach(note => {
      stopNote(note)
    })
    
    // Clear all tracking sets
    activeKeyboardNotes.clear()
    activeMouseNotes.clear()
    
    // Remove visual feedback from all keys
    document.querySelectorAll('.white-key, .black-key').forEach(key => {
      key.classList.remove('active')
    })
  }

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

    // Start processing envelope follower
    function processLoop() {
      processEnvelopeFollower()
      requestAnimationFrame(processLoop)
    }
    processLoop()
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
    
    console.log('Drum machine initialized with synthetic samples');

    document.addEventListener('drumpad-toggle', (e) => {
      const { row, step } = e.detail;
      drumMachine.toggleStep(row, step);
    });

    document.getElementById('playDrums')?.addEventListener('click', () => {
      drumMachine.start();
      document.getElementById('playDrums').disabled = true;
      document.getElementById('stopDrums').disabled = false;
    });

    document.getElementById('stopDrums')?.addEventListener('click', () => {
      drumMachine.stop();
      document.getElementById('playDrums').disabled = false;
      document.getElementById('stopDrums').disabled = true;
    });

    document.getElementById('clearDrums')?.addEventListener('click', () => {
      drumMachine.clear();
    });

    document.getElementById('drumTempo')?.addEventListener('input', (e) => {
      drumMachine.setTempo(parseInt(e.target.value));
      e.target.nextElementSibling.textContent = e.target.value;
    });
  }

  // Patch Management Functions
  function getCurrentPatch() {
    return {
      name: patchNameInput?.value || 'Untitled',
      waveform1: waveformSelect1.value,
      waveform2: waveformSelect2.value,
      detune: Number.parseFloat(detuneSlider.value),
      oscMix: Number.parseFloat(oscMixSlider.value),
      volume: Number.parseFloat(volumeSlider.value),
      attack: Number.parseFloat(attackSlider.value),
      decay: Number.parseFloat(decaySlider.value),
      sustain: Number.parseFloat(sustainSlider.value),
      release: Number.parseFloat(releaseSlider.value),
      filterCutoff: Number.parseFloat(filterCutoffSlider.value),
      filterResonance: Number.parseFloat(filterResonanceSlider.value),
      filterType: filterTypeSelect?.value || 'lowpass',
      lfoWaveform: lfoWaveformSelect.value,
      lfoFrequency: Number.parseFloat(lfoFrequencySlider.value),
      lfoAmount: Number.parseFloat(lfoAmountSlider.value),
      lfoTarget: lfoTargetSelect.value,
      arpEnabled: arpEnabledToggle.checked,
      arpPattern: arpPatternSelect.value,
      arpRate: Number.parseInt(arpRateSlider.value),
      arpOctaves: Number.parseInt(arpOctavesSlider.value),
      reverbEnabled: reverbEnabledToggle.checked,
      reverbMix: Number.parseFloat(reverbMixSlider.value),
      reverbDecay: Number.parseFloat(reverbDecaySlider.value),
      delayEnabled: delayEnabledToggle.checked,
      delayTime: Number.parseFloat(delayTimeSlider.value),
      delayFeedback: Number.parseFloat(delayFeedbackSlider.value),
      delayMix: Number.parseFloat(delayMixSlider.value),
      distortionEnabled: distortionEnabledToggle.checked,
      distortionAmount: Number.parseFloat(distortionAmountSlider.value),
      compressorEnabled: compressorEnabledToggle.checked,
      compressorThreshold: Number.parseFloat(compressorThresholdSlider.value),
      compressorRatio: Number.parseFloat(compressorRatioSlider.value),
      compressorAttack: Number.parseFloat(compressorAttackSlider.value),
      compressorRelease: Number.parseFloat(compressorReleaseSlider.value),
      timestamp: Date.now()
    }
  }

  function loadPatch(patch) {
    waveformSelect1.value = patch.waveform1 || 'sine'
    waveformSelect2.value = patch.waveform2 || 'sine'
    detuneSlider.value = patch.detune || 0
    oscMixSlider.value = patch.oscMix || 0.5
    volumeSlider.value = patch.volume || 0.5
    attackSlider.value = patch.attack || 0.1
    decaySlider.value = patch.decay || 0.1
    sustainSlider.value = patch.sustain || 0.8
    releaseSlider.value = patch.release || 0.5
    filterCutoffSlider.value = patch.filterCutoff || 20000
    filterResonanceSlider.value = patch.filterResonance || 1
    if (filterTypeSelect) filterTypeSelect.value = patch.filterType || 'lowpass'
    lfoWaveformSelect.value = patch.lfoWaveform || 'sine'
    lfoFrequencySlider.value = patch.lfoFrequency || 1
    lfoAmountSlider.value = patch.lfoAmount || 10
    lfoTargetSelect.value = patch.lfoTarget || 'filterCutoff'
    arpEnabledToggle.checked = patch.arpEnabled || false
    arpPatternSelect.value = patch.arpPattern || 'up'
    arpRateSlider.value = patch.arpRate || 4
    arpOctavesSlider.value = patch.arpOctaves || 1
    reverbEnabledToggle.checked = patch.reverbEnabled !== undefined ? patch.reverbEnabled : true
    reverbMixSlider.value = patch.reverbMix || 0.3
    reverbDecaySlider.value = patch.reverbDecay || 2
    delayEnabledToggle.checked = patch.delayEnabled !== undefined ? patch.delayEnabled : true
    delayTimeSlider.value = patch.delayTime || 0.3
    delayFeedbackSlider.value = patch.delayFeedback || 0.4
    delayMixSlider.value = patch.delayMix || 0.3
    distortionEnabledToggle.checked = patch.distortionEnabled || false
    distortionAmountSlider.value = patch.distortionAmount || 20
    compressorEnabledToggle.checked = patch.compressorEnabled !== undefined ? patch.compressorEnabled : true
    compressorThresholdSlider.value = patch.compressorThreshold || -24
    compressorRatioSlider.value = patch.compressorRatio || 4
    compressorAttackSlider.value = patch.compressorAttack || 5
    compressorReleaseSlider.value = patch.compressorRelease || 250

    setupValueDisplays()
    if (audioContext) {
      updateEffectsChain()
      updateLFO()
    }
  }

  function savePatch() {
    const patch = getCurrentPatch()
    if (!patch.name.trim()) {
      alert('Please enter a patch name')
      return
    }

    const patches = JSON.parse(localStorage.getItem('jacksynth-patches') || '[]')
    
    // Check if patch name already exists
    const existingIndex = patches.findIndex(p => p.name === patch.name)
    if (existingIndex >= 0) {
      if (!confirm('A patch with this name already exists. Overwrite?')) {
        return
      }
      patches[existingIndex] = patch
    } else {
      patches.push(patch)
    }

    localStorage.setItem('jacksynth-patches', JSON.stringify(patches))
    updatePatchList()
    patchNameInput.value = ''
    alert('Patch saved successfully!')
  }

  function deletePatch(patchName) {
    if (!confirm(`Delete patch "${patchName}"?`)) return

    const patches = JSON.parse(localStorage.getItem('jacksynth-patches') || '[]')
    const filteredPatches = patches.filter(p => p.name !== patchName)
    localStorage.setItem('jacksynth-patches', JSON.stringify(filteredPatches))
    updatePatchList()
  }

  function updatePatchList() {
    const patches = JSON.parse(localStorage.getItem('jacksynth-patches') || '[]')
    
    if (patches.length === 0) {
      patchList.innerHTML = '<div class="no-patches">No patches saved yet</div>'
      return
    }

    patchList.innerHTML = patches.map(patch => `
      <div class="patch-item">
        <div class="patch-name">${patch.name}</div>
        <div class="patch-actions">
          <button class="patch-button" onclick="loadPatchByName('${patch.name}')">Load</button>
          <button class="patch-button" onclick="deletePatchByName('${patch.name}')">Delete</button>
        </div>
      </div>
    `).join('')
  }

  // Make functions globally available for onclick handlers
  window.loadPatchByName = function(patchName) {
    const patches = JSON.parse(localStorage.getItem('jacksynth-patches') || '[]')
    const patch = patches.find(p => p.name === patchName)
    if (patch) {
      loadPatch(patch)
      alert(`Loaded patch: ${patchName}`)
    }
  }

  window.deletePatchByName = function(patchName) {
    deletePatch(patchName)
  }

  // Step Sequencer Functions
  function startSequencer() {
    if (sequencer.isPlaying) return
    
    sequencer.isPlaying = true
    sequencer.currentStep = 0
    
    const bpm = 120 // Fixed BPM for now
    const stepTime = (60 / bpm) / 4 // 16th notes
    
    sequencer.interval = setInterval(() => {
      playSequencerStep()
      updateSequencerVisual()
      sequencer.currentStep = (sequencer.currentStep + 1) % 16
    }, stepTime * 1000)
  }

  function stopSequencer() {
    if (!sequencer.isPlaying) return
    
    sequencer.isPlaying = false
    clearInterval(sequencer.interval)
    sequencer.currentStep = 0
    updateSequencerVisual()
  }

  function playSequencerStep() {
    const stepValue = sequencer.steps[sequencer.currentStep]
    if (stepValue === 0) return

    switch (sequencer.target) {
      case 'pitch':
        // Play a note based on step value
        const baseNote = 'C4'
        const baseFreq = noteFrequencies[baseNote]
        const semitoneOffset = sequencer.stepValues[stepValue - 1]
        const frequency = baseFreq * Math.pow(2, semitoneOffset / 12)
        startNote(baseNote, frequency)
        setTimeout(() => stopNote(baseNote), 100)
        break
    }
  }

  function updateSequencerVisual() {
    const steps = document.querySelectorAll('.sequencer-step')
    steps.forEach((step, index) => {
      step.classList.toggle('playing', index === sequencer.currentStep && sequencer.isPlaying)
    })
  }

  // Event Listeners
  document.addEventListener("keydown", (event) => {
    // Prevent default for keys we handle to avoid browser shortcuts
    if (keyNoteMap[event.key]) {
      event.preventDefault()
    }
    
    const note = keyNoteMap[event.key]
    if (note && !event.repeat) {
      if (arpEnabledToggle.checked) {
        handleArpeggiatorNote(note, true)
      } else {
        // Only start the note if it's not already playing
        if (!activeKeyboardNotes.has(note)) {
          startNote(note)
          activeKeyboardNotes.add(note)
          // Update visual feedback
          const key = document.querySelector(`[data-note="${note}"]`)
          if (key) key.classList.add('active')
        }
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
        // Update visual feedback
        const key = document.querySelector(`[data-note="${note}"]`)
        if (key) key.classList.remove('active')
      }
    }
  })

  // Add event listeners to handle cases when window loses focus or visibility
  window.addEventListener('blur', () => {
    stopAllNotes()
  })
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAllNotes()
    }
  })
  
  // Add panic button functionality
  document.addEventListener('keydown', (event) => {
    // Escape key acts as panic button
    if (event.key === 'Escape') {
      event.preventDefault()
      stopAllNotes()
      console.log('Panic button activated - all notes stopped')
    }
  })

  // Recording Controls
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

  // Synth Control Event Listeners
  arpOctavesSlider?.addEventListener("input", () => {
    if (arpeggiatorActive) {
      stopArpeggiator()
      startArpeggiator()
    }
  })

  // LFO Control Event Listeners
  ;[lfoWaveformSelect, lfoFrequencySlider, lfoAmountSlider, lfoTargetSelect].forEach((control) => {
    if (control) {
      control.addEventListener("change", updateLFO)
      control.addEventListener("input", updateLFO)
    }
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
    filterTypeSelect,
  ].forEach((control) => {
    if (control) {
      control.addEventListener("change", updateEffectsChain)
      control.addEventListener("input", updateEffectsChain)
    }
  })

  // Patch Management Event Listeners
  savePatchButton?.addEventListener('click', savePatch)

  // Step Sequencer Event Listeners
  document.getElementById('playSequencer')?.addEventListener('click', () => {
    if (sequencer.isPlaying) {
      stopSequencer()
      document.getElementById('playSequencer').textContent = 'Play'
    } else {
      startSequencer()
      document.getElementById('playSequencer').textContent = 'Stop'
    }
  })

  document.getElementById('sequencerTarget')?.addEventListener('change', (e) => {
    sequencer.target = e.target.value
  })

  // Envelope Follower Event Listeners
  document.getElementById('envFollowSensitivity')?.addEventListener('input', (e) => {
    envelopeFollower.sensitivity = Number.parseFloat(e.target.value)
  })

  document.getElementById('envFollowTarget')?.addEventListener('change', (e) => {
    envelopeFollower.target = e.target.value
  })

  resetButton?.addEventListener("click", resetToDefaultValues)

  // Initialize tutorial after ensuring SynthTutorial is available
  const tutorial = new SynthTutorial()
  document.getElementById("startTutorial")?.addEventListener("click", () => {
    tutorial.start()
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

  // Initialize components
  initAudioContext()
  initializeKeyboard()
  initializeStepSequencer()
  setupValueDisplays()
  updatePatchList()

  console.log("JackSynth initialized successfully")
})