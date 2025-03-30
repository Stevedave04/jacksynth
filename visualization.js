export class Visualizer {
  constructor(audioContext, sourceNode) {
    this.audioContext = audioContext
    this.analyzer = audioContext.createAnalyser()
    this.analyzer.fftSize = 2048
    this.analyzer.smoothingTimeConstant = 0.85

    sourceNode.connect(this.analyzer)

    // Initialize canvases
    this.spectrumCanvas = document.getElementById("spectrumAnalyzer")
    this.scopeCanvas = document.getElementById("oscilloscope")
    this.spectrumCtx = this.spectrumCanvas.getContext("2d")
    this.scopeCtx = this.scopeCanvas.getContext("2d")

    // Set canvas dimensions
    this.resizeCanvases()
    window.addEventListener("resize", () => this.resizeCanvases())

    // Initialize data arrays
    this.spectrumData = new Uint8Array(this.analyzer.frequencyBinCount)
    this.scopeData = new Uint8Array(this.analyzer.frequencyBinCount)

    this.isActive = true
    this.visualizationType = "both" // 'spectrum', 'scope', or 'both'

    // Start animation
    this.draw = this.draw.bind(this)
    requestAnimationFrame(this.draw)

    // Setup visualization controls
    this.setupControls()
  }

  resizeCanvases() {
    const container = document.querySelector(".visualization-container")
    const width = container.clientWidth - 30 // Account for padding
    const height = 150
    ;[this.spectrumCanvas, this.scopeCanvas].forEach((canvas) => {
      canvas.width = width
      canvas.height = height
      canvas.style.width = width + "px"
      canvas.style.height = height + "px"
    })
  }

  setupControls() {
    const toggleBtn = document.getElementById("toggleViz")
    const vizTypeSelect = document.getElementById("vizType")

    toggleBtn.addEventListener("click", () => {
      this.isActive = !this.isActive
      if (this.isActive) requestAnimationFrame(this.draw)
      toggleBtn.textContent = this.isActive ? "Pause Visualization" : "Resume Visualization"
    })

    vizTypeSelect.addEventListener("change", (e) => {
      this.visualizationType = e.target.value
      this.updateCanvasVisibility()
    })
  }

  updateCanvasVisibility() {
    switch (this.visualizationType) {
      case "spectrum":
        this.spectrumCanvas.style.display = "block"
        this.scopeCanvas.style.display = "none"
        break
      case "scope":
        this.spectrumCanvas.style.display = "none"
        this.scopeCanvas.style.display = "block"
        break
      case "both":
        this.spectrumCanvas.style.display = "block"
        this.scopeCanvas.style.display = "block"
        break
    }
  }

  drawSpectrum() {
    const ctx = this.spectrumCtx
    const width = this.spectrumCanvas.width
    const height = this.spectrumCanvas.height
    const barWidth = (width / this.analyzer.frequencyBinCount) * 2.5
    const bars = Math.min(this.analyzer.frequencyBinCount, width / barWidth)

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.8)")
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.2)")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // Get frequency data
    this.analyzer.getByteFrequencyData(this.spectrumData)

    // Draw bars
    for (let i = 0; i < bars; i++) {
      const barHeight = (this.spectrumData[i] / 255) * height
      const hue = (i / bars) * 270 + 180 // Blue to purple gradient
      ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.85)`

      // Draw rounded bars
      ctx.beginPath()
      ctx.roundRect(i * barWidth, height - barHeight, barWidth - 1, barHeight, [2, 2, 0, 0])
      ctx.fill()
    }
  }

  drawOscilloscope() {
    const ctx = this.scopeCtx
    const width = this.scopeCanvas.width
    const height = this.scopeCanvas.height

    // Clear canvas
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
    ctx.fillRect(0, 0, width, height)

    // Get time domain data
    this.analyzer.getByteTimeDomainData(this.scopeData)

    // Draw waveform
    ctx.beginPath()
    ctx.lineWidth = 2
    ctx.strokeStyle = "#00ff88"

    const sliceWidth = width / this.scopeData.length
    let x = 0

    for (let i = 0; i < this.scopeData.length; i++) {
      const v = this.scopeData[i] / 128.0
      const y = (v * height) / 2

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }

      x += sliceWidth
    }

    // Add glow effect
    ctx.shadowBlur = 10
    ctx.shadowColor = "#00ff88"
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  draw() {
    if (!this.isActive) return

    if (this.visualizationType === "spectrum" || this.visualizationType === "both") {
      this.drawSpectrum()
    }
    if (this.visualizationType === "scope" || this.visualizationType === "both") {
      this.drawOscilloscope()
    }

    requestAnimationFrame(this.draw)
  }

  getAnalyzerNode() {
    return this.analyzer
  }
}

