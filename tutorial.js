export class SynthTutorial {
  constructor() {
    this.steps = [
      {
        title: "Welcome to JackSynth",
        content: "Learn how to create amazing sounds with this synthesizer!",
        highlight: null,
      },
      {
        title: "Oscillators",
        content: "Start with the basic waveforms. Try changing Oscillator 1.",
        highlight: "#waveform1",
      },
      {
        title: "ADSR Envelope",
        content: "Shape your sound with Attack, Decay, Sustain, and Release.",
        highlight: ".control-group.adsr",
      },
      // Add more tutorial steps
    ]

    this.currentStep = 0
    this.setupListeners()
  }

  setupListeners() {
    document.getElementById("prevTutorial").addEventListener("click", () => this.prevStep())
    document.getElementById("nextTutorial").addEventListener("click", () => this.nextStep())
    document.getElementById("skipTutorial").addEventListener("click", () => this.endTutorial())
  }

  start() {
    document.getElementById("tutorialOverlay").classList.remove("hidden")
    this.showStep(0)
  }

  showStep(index) {
    const step = this.steps[index]
    const content = document.getElementById("tutorialStep")
    content.innerHTML = `
      <h4>${step.title}</h4>
      <p>${step.content}</p>
    `

    // Remove previous highlights
    document.querySelectorAll(".highlight").forEach((el) => el.classList.remove("highlight"))

    // Add new highlight
    if (step.highlight) {
      document.querySelector(step.highlight)?.classList.add("highlight")
    }
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++
      this.showStep(this.currentStep)
    } else {
      this.endTutorial()
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--
      this.showStep(this.currentStep)
    }
  }

  endTutorial() {
    document.getElementById("tutorialOverlay").classList.add("hidden")
    document.querySelectorAll(".highlight").forEach((el) => el.classList.remove("highlight"))
  }
}

