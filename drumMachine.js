export class DrumMachine {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.samples = new Map();
    this.pattern = Array(4).fill().map(() => Array(16).fill(false));
    this.playing = false;
    this.currentStep = 0;
    this.tempo = 120;
    this.intervalId = null;
    
    // Define drum types and their sample URLs
    this.drumTypes = {
      'kick': 'samples/kick.mp3',
      'snare': 'samples/snare.mp3',
      'hihat': 'samples/hihat.mp3',
      'clap': 'samples/clap.mp3'
    };
  }

  async loadSamples() {
    for (const [name, url] of Object.entries(this.drumTypes)) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.samples.set(name, audioBuffer);
    }
  }

  playSample(name) {
    const buffer = this.samples.get(name);
    if (buffer) {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start();
    }
  }

  toggleStep(row, col) {
    this.pattern[row][col] = !this.pattern[row][col];
    return this.pattern[row][col];
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.currentStep = 0;

    const stepTime = (60 / this.tempo) / 4;
    this.intervalId = setInterval(() => {
      this.playStep();
      this.currentStep = (this.currentStep + 1) % 16;
    }, stepTime * 1000);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.intervalId);
    this.currentStep = 0;
  }

  playStep() {
    const drums = ['kick', 'snare', 'hihat', 'clap'];
    drums.forEach((drum, row) => {
      if (this.pattern[row][this.currentStep]) {
        this.playSample(drum);
      }
    });
  }

  setTempo(tempo) {
    this.tempo = tempo;
    if (this.playing) {
      this.stop();
      this.start();
    }
  }
}
