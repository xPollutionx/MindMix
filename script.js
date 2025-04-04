// Frequency ranges for different brain wave states
const FREQUENCY_RANGES = {
    delta: { min: 1, max: 4 },
    theta: { min: 4, max: 8 },
    alpha: { min: 8, max: 12 },
    beta: { min: 13, max: 30 }
};

// DOM Elements
const audioInput = document.getElementById('audioInput');
const processBtn = document.getElementById('processBtn');
const statusDiv = document.getElementById('status');
const freqButtons = document.querySelectorAll('.freq-btn');

let selectedRange = null;
let audioContext = null;
let audioBuffer = null;

// Initialize Web Audio API context
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Handle file selection
audioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    statusDiv.textContent = 'Loading audio file...';
    processBtn.disabled = true;

    try {
        initAudioContext();
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        statusDiv.textContent = 'Audio file loaded successfully!';
        processBtn.disabled = false;
    } catch (error) {
        statusDiv.textContent = 'Error loading audio file: ' + error.message;
        processBtn.disabled = true;
    }
});

// Handle frequency range selection
freqButtons.forEach(button => {
    button.addEventListener('click', () => {
        freqButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        selectedRange = button.dataset.range;
    });
});

// Process audio with selected frequency range
processBtn.addEventListener('click', async () => {
    if (!audioBuffer || !selectedRange) {
        statusDiv.textContent = 'Please select an audio file and frequency range.';
        return;
    }

    statusDiv.textContent = 'Processing audio...';
    processBtn.disabled = true;

    try {
        // Create a preview of the processed audio
        const audioElement = document.createElement('audio');
        audioElement.controls = true;
        
        // Process the audio
        const blob = await createBinauralAudio(audioBuffer, selectedRange);
        const url = URL.createObjectURL(blob);
        
        // Set up audio preview
        audioElement.src = url;
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = 'binaural_audio.wav';
        a.textContent = 'Download Processed Audio';
        a.className = 'download-link';
        
        // Clear previous elements
        const existingLink = document.querySelector('.download-link');
        if (existingLink) {
            existingLink.remove();
        }
        
        const existingAudio = document.querySelector('.preview-audio');
        if (existingAudio) {
            existingAudio.remove();
        }
        
        // Add preview and download link
        audioElement.className = 'preview-audio';
        document.querySelector('.controls').appendChild(audioElement);
        document.querySelector('.controls').appendChild(a);
        
        statusDiv.textContent = 'Audio processed successfully! Preview:';
    } catch (error) {
        statusDiv.textContent = 'Error processing audio: ' + error.message;
        console.error(error);
    } finally {
        processBtn.disabled = false;
    }
});

// Create binaural audio using frequency shifting
async function createBinauralAudio(buffer, range) {
    const rangeInfo = FREQUENCY_RANGES[range];
    const ctx = new OfflineAudioContext(2, buffer.length, buffer.sampleRate);
    
    // Create buffer source
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Create stereo channels
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    
    // Connect source to splitter
    source.connect(splitter);
    
    // Route left channel directly (unchanged)
    splitter.connect(merger, 0, 0);
    
    // Route right channel through pitch shifter
    const freqDiff = (rangeInfo.min + rangeInfo.max) / 2;
    
    // Calculate semitone shift for the desired frequency difference
    // This is an approximation, as exact Hz shifts depend on the original frequency
    const semitoneShift = freqDiff / 100; // Small shift to create binaural effect
    
    // Set up pitch shifting for right channel
    const rightChannel = ctx.createGain();
    splitter.connect(rightChannel, 1);
    
    // Apply pitch shift
    pitchShift(rightChannel, merger, 1, semitoneShift, ctx);
    
    // Connect merger to destination
    merger.connect(ctx.destination);
    
    // Start source and render
    source.start(0);
    const renderedBuffer = await ctx.startRendering();
    
    // Convert to WAV
    return audioBufferToWav(renderedBuffer);
}

// Pitch shifting function
function pitchShift(input, output, outputChannel, semitones, context) {
    const shiftFactor = Math.pow(2, semitones/12);
    
    // Delay node for phase shifting
    const delayNode = context.createDelay();
    const maxDelayTime = 1.0;
    delayNode.delayTime.value = 0;
    
    // Gain for mixing
    const gainNode = context.createGain();
    gainNode.gain.value = 0.5;
    
    // Connect nodes
    input.connect(delayNode);
    input.connect(gainNode);
    delayNode.connect(gainNode);
    
    // Small LFO for subtle frequency modulation
    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = semitones; // LFO frequency matches desired beat frequency
    
    // Connect LFO to delay time
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.0002; // Very small modulation amount
    lfo.connect(lfoGain);
    lfoGain.connect(delayNode.delayTime);
    
    // Start LFO
    lfo.start(0);
    
    // Connect output
    gainNode.connect(output, 0, outputChannel);
}

// Convert AudioBuffer to WAV
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length * numChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16; 
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * bytesPerSample;
    
    // Create the buffer for the WAV file
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);
    
    // Write the WAV container header
    writeString(view, 0, 'RIFF');                     // RIFF identifier
    view.setUint32(4, 36 + dataSize, true);           // File length
    writeString(view, 8, 'WAVE');                     // WAVE identifier
    
    // Write the format chunk
    writeString(view, 12, 'fmt ');                    // Format chunk identifier
    view.setUint32(16, 16, true);                     // Format chunk length
    view.setUint16(20, 1, true);                      // Sample format (1 for PCM)
    view.setUint16(22, numChannels, true);            // Number of channels
    view.setUint32(24, sampleRate, true);             // Sample rate
    view.setUint32(28, byteRate, true);               // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, blockAlign, true);             // Block align (NumChannels * BitsPerSample/8)
    view.setUint16(34, bitsPerSample, true);          // Bits per sample
    
    // Write the data chunk
    writeString(view, 36, 'data');                    // Data chunk identifier
    view.setUint32(40, dataSize, true);               // Data chunk length
    
    // Write interleaved audio data
    const offset = 44;
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }
    
    let sample = 0;
    let sampleOffset;
    
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            // Clamp the sample values to -1.0..1.0
            sample = Math.max(-1, Math.min(1, channels[channel][i]));
            // Convert to 16-bit value
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            // Calculate sample byte offset
            sampleOffset = offset + ((i * numChannels + channel) * bytesPerSample);
            // Write 16-bit sample values
            view.setInt16(sampleOffset, sample, true);
        }
    }
    
    // Create the WAV file as a blob
    return new Blob([view], { type: 'audio/wav' });
}

// Helper function to write strings to DataView
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Initialize audio context when user interacts with the page
document.addEventListener('click', () => {
    initAudioContext();
}, { once: true }); 