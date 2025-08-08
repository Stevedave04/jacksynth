export class DrumMachine {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.samples = new Map();
    this.pattern = Array(4).fill().map(() => Array(16).fill(false));
    this.playing = false;
    this.currentStep = 0;
    this.tempo = 120;
    this.intervalId = null;
    
    // Define drum types - we'll create synthetic sounds instead of loading samples
    this.drumTypes = {
      'kick': { type: 'kick', frequency: 60 },
      'snare': { type: 'snare', frequency: 200 },
      'hihat': { type: 'hihat', frequency: 8000 },
      'clap': { type: 'clap', frequency: 1000 }
    };
    
    this.createSyntheticSamples();
  }

  createSyntheticSamples() {
    // Create synthetic drum sounds using Web Audio API
    Object.entries(this.drumTypes).forEach(([name, config]) => {
      this.samples.set(name, config);
    });
  }

  playSample(name) {
    const drumConfig = this.samples.get(name);
    if (!drumConfig) return;

    const now = this.audioContext.currentTime;
    
    switch (drumConfig.type) {
      case 'kick':
        this.playKick(now);
        break;
      case 'snare':
        this.playSnare(now);
        break;
      case 'hihat':
        this.playHiHat(now);
        break;
      case 'clap':
        this.playClap(now);
        break;
    }
  }

  playKick(startTime) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, startTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, startTime + 0.5);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(100, startTime);
    
    gain.gain.setValueAtTime(0.8, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.5);
  }

  playSnare(startTime) {
    // Noise component
    const bufferSize = this.audioContext.sampleRate * 0.2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.audioContext.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, startTime);
    
    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.5, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
    
    // Tone component
    const osc = this.audioContext.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, startTime);
    
    const oscGain = this.audioContext.createGain();
    oscGain.gain.setValueAtTime(0.3, startTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.audioContext.destination);
    
    osc.connect(oscGain);
    oscGain.connect(this.audioContext.destination);
    
    noise.start(startTime);
    noise.stop(startTime + 0.2);
    osc.start(startTime);
    osc.stop(startTime + 0.1);
  }

  playHiHat(startTime) {
    const bufferSize = this.audioContext.sampleRate * 0.1;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, startTime);
    
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);
    
    noise.start(startTime);
    noise.stop(startTime + 0.1);
  }

  playClap(startTime) {
    // Multiple short bursts to simulate hand clap
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.01;
      const bufferSize = this.audioContext.sampleRate * 0.05;
      const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const output = buffer.getChannelData(0);
      
      for (let j = 0; j < bufferSize; j++) {
        output[j] = Math.random() * 2 - 1;
      }
      
      const noise = this.audioContext.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, startTime + delay);
      filter.Q.setValueAtTime(1, startTime + delay);
      
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.4, startTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + delay + 0.05);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioContext.destination);
      
      noise.start(startTime + delay);
      noise.stop(startTime + delay + 0.05);
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

    const stepTime = (60 / this.tempo) / 4; // 16th notes
    this.intervalId = setInterval(() => {
      this.playStep();
      this.updateStepIndicator();
      this.currentStep = (this.currentStep + 1) % 16;
    }, stepTime * 1000);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.intervalId);
    this.currentStep = 0;
    this.updateStepIndicator();
  }

  playStep() {
    const drums = ['kick', 'snare', 'hihat', 'clap'];
    drums.forEach((drum, row) => {
      if (this.pattern[row][this.currentStep]) {
        this.playSample(drum);
      }
    });
  }

  updateStepIndicator() {
    // Update visual indicator for current step
    const pads = document.querySelectorAll('.drum-pad');
    pads.forEach((pad, index) => {
      const step = index % 16;
      pad.classList.toggle('playing', step === this.currentStep && this.playing);
    });
  }

  setTempo(tempo) {
    this.tempo = tempo;
    if (this.playing) {
      this.stop();
      this.start();
    }
  }

  clear() {
    this.pattern = Array(4).fill().map(() => Array(16).fill(false));
    this.stop();
    this.updateGrid();
  }

  updateGrid() {
    const pads = document.querySelectorAll('.drum-pad');
    pads.forEach((pad) => {
      const row = parseInt(pad.dataset.row);
      const step = parseInt(pad.dataset.step);
      pad.classList.toggle('active', this.pattern[row][step]);
    });
  }
}