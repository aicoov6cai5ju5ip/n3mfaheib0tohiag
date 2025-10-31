import type {
	TuningSystem,
	SynthType,
	Note,
	MidiData,
	PianoRollOptions,
	NoteEvent,
	NoteEventCallback,
	TuningTables,
	TransportState,
	TransportControls,
	TransportEvent,
	TransportEventCallback
} from '../types/index.js';

// Global references to libraries loaded via script tags
declare global {
	interface Window {
		Tone: any;
		Tonal: any;
		Midi: any;
	}
}

/**
 * Core class for MIDI file processing with custom tuning systems
 * Handles parsing, tuning calculations, audio synthesis, and transport control
 */
export class PianoRollCore implements TransportControls {
	public options: Required<PianoRollOptions>;
	public tuningTables: TuningTables;
	public synth: any | null = null;
	public notes: Note[] = [];
	public noteSubscribers: NoteEventCallback[] = [];
	public transportSubscribers: TransportEventCallback[] = [];
	public isPlaying: boolean = false;
	public isPaused: boolean = false;
	public scheduledEvents: any[] = [];
	public currentPosition: number = 0;
	public duration: number = 0;
	
	// Transport state
	private transportState: TransportState = {
		bpm: 120,
		position: '0:0:0',
		positionSeconds: 0,
		isPlaying: false,
		isPaused: false,
		isLooping: false,
		loopStart: '0:0:0',
		loopEnd: '4:0:0',
		swing: 0,
		swingSubdivision: '8n'
	};
	
	private positionUpdateInterval: number | null = null;

	constructor(options: PianoRollOptions = {}) {
		this.options = {
			tuningSystem: 'equal',
			useSynth: true,
			synthType: 'default',
			...options
		};

		this.tuningTables = {
			equal: {},
			natural: {},
			pythagorean: {},
			pentatonic: {}
		};

		this._initTuningTables();

		if (this.options.useSynth) {
			this._initSynth();
		}
		
		// Initialize Tone.js transport settings if available
		if (typeof window !== 'undefined' && window.Tone) {
			window.Tone.Transport.bpm.value = this.transportState.bpm;
			window.Tone.Transport.swing = this.transportState.swing;
			window.Tone.Transport.swingSubdivision = this.transportState.swingSubdivision;
		}
	}

	/**
	 * Initialize tuning tables with frequency ratios for different musical systems
	 */
	private _initTuningTables(): void {
		if (typeof window === 'undefined' || !window.Tone || !window.Tonal) {
			console.warn('Tone.js or Tonal.js not loaded, using equal temperament as fallback');
			return;
		}

		const Tone = window.Tone;
		const baseNote = 'C4';
		const baseFreq = Tone.Frequency(baseNote).toFrequency();

		// Natural (just intonation) ratios
		const naturalRatios: Record<string, number> = {
			'C': 1, 'C#': 16/15, 'D': 9/8, 'D#': 6/5, 'E': 5/4, 'F': 4/3,
			'F#': 45/32, 'G': 3/2, 'G#': 8/5, 'A': 5/3, 'A#': 9/5, 'B': 15/8
		};

		// Pythagorean tuning ratios
		const pythagoreanRatios: Record<string, number> = {
			'C': 1, 'C#': 256/243, 'D': 9/8, 'D#': 32/27, 'E': 81/64, 'F': 4/3,
			'F#': 729/512, 'G': 3/2, 'G#': 128/81, 'A': 27/16, 'A#': 16/9, 'B': 243/128
		};

		// Pentatonic scale ratios (5-note scale)
		const pentatonicRatios: Record<string, number> = {
			'C': 1, 'D': 9/8, 'E': 5/4, 'G': 3/2, 'A': 5/3
		};

		// Generate tuning tables for all octaves (0-8)
		for (let octave = 0; octave <= 8; octave++) {
			// Equal temperament (12-TET)
			for (let semitone = 0; semitone < 12; semitone++) {
				const note = Tone.Frequency(baseFreq, 'hz').transpose(semitone + (octave - 4) * 12);
				const noteName = note.toNote();
				this.tuningTables.equal[noteName] = note.toFrequency();
			}

			// Natural tuning
			Object.entries(naturalRatios).forEach(([noteName, ratio]) => {
				const fullNoteName = `${noteName}${octave}`;
				const octaveMultiplier = Math.pow(2, octave - 4);
				this.tuningTables.natural[fullNoteName] = baseFreq * ratio * octaveMultiplier;
			});

			// Pythagorean tuning
			Object.entries(pythagoreanRatios).forEach(([noteName, ratio]) => {
				const fullNoteName = `${noteName}${octave}`;
				const octaveMultiplier = Math.pow(2, octave - 4);
				this.tuningTables.pythagorean[fullNoteName] = baseFreq * ratio * octaveMultiplier;
			});

			// Pentatonic tuning
			Object.entries(pentatonicRatios).forEach(([noteName, ratio]) => {
				const fullNoteName = `${noteName}${octave}`;
				const octaveMultiplier = Math.pow(2, octave - 4);
				this.tuningTables.pentatonic[fullNoteName] = baseFreq * ratio * octaveMultiplier;
			});
		}
	}

	/**
	 * Initialize synthesizer based on synthType
	 */
	private _initSynth(): void {
		if (typeof window === 'undefined' || !window.Tone) {
			console.warn('Tone.js not loaded, synth disabled');
			return;
		}

		const Tone = window.Tone;

		switch (this.options.synthType) {
			case 'fm':
				this.synth = new Tone.FMSynth({
					harmonicity: 3,
					modulationIndex: 10,
					oscillator: { type: 'sine' },
					envelope: { attack: 0.01, decay: 0.01, sustain: 1, release: 0.5 },
					modulation: { type: 'square' },
					modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
				}).toDestination();
				break;

			case 'am':
				this.synth = new Tone.AMSynth({
					harmonicity: 2,
					oscillator: { type: 'sine' },
					envelope: { attack: 0.01, decay: 0.01, sustain: 1, release: 0.5 },
					modulation: { type: 'square' },
					modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
				}).toDestination();
				break;

			case 'membrane':
				this.synth = new Tone.MembraneSynth({
					pitchDecay: 0.05,
					octaves: 10,
					oscillator: { type: 'sine' },
					envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }
				}).toDestination();
				break;

			default: // 'default'
				this.synth = new Tone.Synth({
					oscillator: { type: 'triangle' },
					envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 }
				}).toDestination();
				break;
		}
	}

	/**
	 * Parse MIDI file from File object
	 */
	async parseMIDI(file: File): Promise<MidiData> {
		if (typeof window === 'undefined' || !window.Midi) {
			throw new Error('Midi.js not loaded');
		}

		const Midi = window.Midi;
		const arrayBuffer = await file.arrayBuffer();
		const midi = new Midi(arrayBuffer);

		const midiData: MidiData = {
			name: file.name,
			duration: midi.duration,
			tracks: []
		};

		midi.tracks.forEach((track: any, trackIndex: number) => {
			const notes: Note[] = track.notes.map((note: any) => ({
				name: note.name,
				midi: note.midi,
				time: note.time,
				duration: note.duration,
				velocity: note.velocity,
				frequency: this.getNoteFrequency(note.name),
				trackIndex
			}));

			midiData.tracks.push({
				name: track.name || `Track ${trackIndex + 1}`,
				notes
			});
		});

		// Flatten all notes for easy access
		this.notes = midiData.tracks.flatMap(track => track.notes);
		
		// Update duration and reset transport state
		this.duration = midi.duration;
		this.transportState.positionSeconds = 0;
		this.transportState.position = '0:0:0';
		this.currentPosition = 0;

		return midiData;
	}

	/**
	 * Get frequency for a note name using current tuning system
	 */
	getNoteFrequency(noteName: string): number {
		const tuningTable = this.tuningTables[this.options.tuningSystem];
		
		if (tuningTable[noteName] !== undefined) {
			return tuningTable[noteName];
		}

		// Fallback to equal temperament if note not found
		if (this.tuningTables.equal[noteName] !== undefined) {
			return this.tuningTables.equal[noteName];
		}

		// Final fallback: use Tone.js if available
		if (typeof window !== 'undefined' && window.Tone) {
			try {
				return window.Tone.Frequency(noteName).toFrequency();
			} catch {
				console.warn(`Unknown note: ${noteName}, using 440Hz`);
				return 440; // A4 fallback
			}
		}

		return 440; // Final fallback
	}

	/**
	 * Update tuning system and recalculate frequencies
	 */
	updateTuningSystem(tuningSystem: TuningSystem): void {
		this.options.tuningSystem = tuningSystem;
		
		// Recalculate frequencies for existing notes
		this.notes = this.notes.map(note => ({
			...note,
			frequency: this.getNoteFrequency(note.name)
		}));

		// Notify subscribers
		this._notifySubscribers({
			type: 'stop',
			time: Date.now()
		});
	}

	/**
	 * Update synthesizer type
	 */
	updateSynthType(synthType: SynthType): void {
		this.options.synthType = synthType;
		
		if (this.options.useSynth) {
			// Dispose old synth
			if (this.synth?.dispose) {
				this.synth.dispose();
			}
			
			// Create new synth
			this._initSynth();
		}
	}

	/**
	 * Transport Control Methods
	 */
	play(): void {
		if (typeof window === 'undefined' || !window.Tone) {
			console.warn('Tone.js not loaded, cannot play');
			return;
		}

		const Tone = window.Tone;
		
		if (this.isPlaying) {
			return;
		}
		
		if (this.isPaused) {
			// Resume from pause
			this._resumeFromPause();
			return;
		}

		if (!this.options.useSynth || !this.synth) {
			console.warn('Synth not available');
			return;
		}

		this.isPlaying = true;
		this.isPaused = false;
		this.transportState.isPlaying = true;
		this.transportState.isPaused = false;
		
		// Start position tracking
		this._startPositionTracking();
		
		const now = Tone.now();
		const startTime = this.currentPosition;

		// Schedule all notes from current position
		const filteredNotes = this.notes.filter(note => note.time >= startTime);
		
		filteredNotes.forEach(note => {
			const noteStartTime = now + (note.time - startTime);
			const frequency = note.frequency;

			// Schedule note on
			const noteOnEvent = Tone.Transport.schedule((time: number) => {
				if (this.isPlaying) {
					this.synth.triggerAttack(frequency, time, note.velocity);
					this._notifySubscribers({
						type: 'noteOn',
						note: note.name,
						frequency,
						time,
						duration: note.duration,
						velocity: note.velocity
					});
				}
			}, noteStartTime);

			// Schedule note off
			const noteOffEvent = Tone.Transport.schedule((time: number) => {
				if (this.isPlaying) {
					this.synth.triggerRelease(frequency, time);
					this._notifySubscribers({
						type: 'noteOff',
						note: note.name,
						frequency,
						time
					});
				}
			}, noteStartTime + note.duration);

			this.scheduledEvents.push(noteOnEvent, noteOffEvent);
		});

		// Start transport
		Tone.Transport.start();
		
		// Notify transport event
		this._notifyTransportSubscribers({
			type: 'play',
			data: { position: startTime },
			timestamp: Date.now()
		});
	}

	/**
	 * Stop playback
	 */
	stop(): void {
		if (typeof window !== 'undefined' && window.Tone) {
			window.Tone.Transport.stop();
			window.Tone.Transport.cancel();
		}

		// Clear scheduled events
		this.scheduledEvents.forEach(event => {
			if (typeof window !== 'undefined' && window.Tone) {
				window.Tone.Transport.clear(event);
			}
		});
		this.scheduledEvents = [];

		this.isPlaying = false;
		this.isPaused = false;
		this.transportState.isPlaying = false;
		this.transportState.isPaused = false;
		
		// Reset position to beginning
		this.currentPosition = 0;
		this.transportState.positionSeconds = 0;
		this.transportState.position = '0:0:0';
		
		// Stop position tracking
		this._stopPositionTracking();
		
		this._notifyTransportSubscribers({
			type: 'stop',
			data: { position: 0 },
			timestamp: Date.now()
		});
		
		this._notifySubscribers({
			type: 'stop',
			time: Date.now()
		});
	}

	/**
	 * Subscribe to note events
	 */
	subscribe(callback: NoteEventCallback): () => void {
		this.noteSubscribers.push(callback);
		
		// Return unsubscribe function
		return () => {
			const index = this.noteSubscribers.indexOf(callback);
			if (index > -1) {
				this.noteSubscribers.splice(index, 1);
			}
		};
	}

	/**
	 * Notify all subscribers of note events
	 */
	private _notifySubscribers(event: NoteEvent): void {
		this.noteSubscribers.forEach(callback => {
			try {
				callback(event);
			} catch (error) {
				console.error('Error in note subscriber:', error);
			}
		});
	}

	/**
	 * Get JSON representation of current notes
	 */
	toJSON(): string {
		return JSON.stringify({
			options: this.options,
			notes: this.notes,
			isPlaying: this.isPlaying
		}, null, 2);
	}

	/**
	 * Cleanup resources
	 */
	dispose(): void {
		this.stop();
		
		// Stop position tracking
		this._stopPositionTracking();
		
		if (this.synth?.dispose) {
			this.synth.dispose();
			this.synth = null;
		}
		
		this.notes = [];
		this.noteSubscribers = [];
		this.transportSubscribers = [];
	}
}

// Export for use in Svelte components
export default PianoRollCore;

	/**
	 * Pause playback
	 */
	pause(): void {
		if (!this.isPlaying || this.isPaused) {
			return;
		}
		
		if (typeof window !== 'undefined' && window.Tone) {
			window.Tone.Transport.pause();
		}
		
		this.isPlaying = false;
		this.isPaused = true;
		this.transportState.isPlaying = false;
		this.transportState.isPaused = true;
		
		// Stop position tracking
		this._stopPositionTracking();
		
		this._notifyTransportSubscribers({
			type: 'pause',
			data: { position: this.currentPosition },
			timestamp: Date.now()
		});
		
		this._notifySubscribers({
			type: 'stop',
			time: Date.now()
		});
	}
	
	/**
	 * Resume from pause
	 */
	private _resumeFromPause(): void {
		if (typeof window !== 'undefined' && window.Tone) {
			window.Tone.Transport.start();
		}
		
		this.isPlaying = true;
		this.isPaused = false;
		this.transportState.isPlaying = true;
		this.transportState.isPaused = false;
		
		// Resume position tracking
		this._startPositionTracking();
		
		this._notifyTransportSubscribers({
			type: 'play',
			data: { position: this.currentPosition },
			timestamp: Date.now()
		});
	}
	/**
	 * Set BPM (tempo)
	 */
	setBPM(bpm: number): void {
		if (bpm < 20 || bpm > 300) {
			console.warn('BPM must be between 20 and 300');
			return;
		}
		
		this.transportState.bpm = bpm;
		
		if (typeof window !== 'undefined' && window.Tone) {
			window.Tone.Transport.bpm.value = bpm;
		}
		
		this._notifyTransportSubscribers({
			type: 'bpm',
			data: { bpm },
			timestamp: Date.now()
		});
	}
	
	/**
	 * Set playback position
	 */
	setPosition(position: string): void {
		if (typeof window !== 'undefined' && window.Tone) {
			try {
				// Convert position to seconds
				const positionSeconds = window.Tone.Time(position).toSeconds();
				
				// Clamp to valid range
				const clampedSeconds = Math.max(0, Math.min(positionSeconds, this.duration));
				
				this.currentPosition = clampedSeconds;
				this.transportState.position = position;
				this.transportState.positionSeconds = clampedSeconds;
				
				// If playing, need to reschedule from new position
				if (this.isPlaying) {
					this.stop();
					this.play();
				}
				
				this._notifyTransportSubscribers({
					type: 'position',
					data: { position, positionSeconds: clampedSeconds },
					timestamp: Date.now()
				});
			} catch (error) {
				console.warn('Invalid position format:', position);
			}
		}
	}
	
	/**
	 * Set loop parameters
	 */
	setLoop(enabled: boolean, start?: string, end?: string): void {
		this.transportState.isLooping = enabled;
		
		if (start !== undefined) {
			this.transportState.loopStart = start;
		}
		if (end !== undefined) {
			this.transportState.loopEnd = end;
		}
		
		if (typeof window !== 'undefined' && window.Tone) {
			if (enabled) {
				window.Tone.Transport.loopStart = this.transportState.loopStart;
				window.Tone.Transport.loopEnd = this.transportState.loopEnd;
				window.Tone.Transport.loop = true;
			} else {
				window.Tone.Transport.loop = false;
			}
		}
		
		this._notifyTransportSubscribers({
			type: 'loop',
			data: {
				enabled,
				start: this.transportState.loopStart,
				end: this.transportState.loopEnd
			},
			timestamp: Date.now()
		});
	}
	
	/**
	 * Set swing parameters
	 */
	setSwing(amount: number, subdivision: string = '8n'): void {
		this.transportState.swing = Math.max(0, Math.min(1, amount));
		this.transportState.swingSubdivision = subdivision;
		
		if (typeof window !== 'undefined' && window.Tone) {
			window.Tone.Transport.swing = this.transportState.swing;
			window.Tone.Transport.swingSubdivision = subdivision;
		}
		
		this._notifyTransportSubscribers({
			type: 'bpm', // Swing affects timing like BPM
			data: { swing: this.transportState.swing, subdivision },
			timestamp: Date.now()
		});
	}
	
	/**
	 * Get current transport state
	 */
	getState(): TransportState {
		return { ...this.transportState };
	}
	/**
	 * Subscribe to transport events
	 */
	subscribeToTransport(callback: TransportEventCallback): () => void {
		this.transportSubscribers.push(callback);
		
		// Return unsubscribe function
		return () => {
			const index = this.transportSubscribers.indexOf(callback);
			if (index > -1) {
				this.transportSubscribers.splice(index, 1);
			}
		};
	}
	
	/**
	 * Private method to notify transport subscribers
	 */
	private _notifyTransportSubscribers(event: TransportEvent): void {
		this.transportSubscribers.forEach(callback => {
			try {
				callback(event);
			} catch (error) {
				console.error('Error in transport subscriber:', error);
			}
		});
	}
	
	/**
	 * Start position tracking during playback
	 */
	private _startPositionTracking(): void {
		if (this.positionUpdateInterval) {
			clearInterval(this.positionUpdateInterval);
		}
		
		const startTime = Date.now();
		const startPosition = this.currentPosition;
		
		this.positionUpdateInterval = setInterval(() => {
			if (!this.isPlaying || this.isPaused) {
				return;
			}
			
			const elapsed = (Date.now() - startTime) / 1000;
			this.currentPosition = startPosition + elapsed;
			this.transportState.positionSeconds = this.currentPosition;
			
			// Convert to bars:beats:sixteenths format
			if (typeof window !== 'undefined' && window.Tone) {
				try {
					const transport = window.Tone.Transport;
					const bpm = this.transportState.bpm;
					const beatsPerSecond = bpm / 60;
					const totalBeats = this.currentPosition * beatsPerSecond;
					const bars = Math.floor(totalBeats / 4);
					const beats = Math.floor(totalBeats % 4);
					const sixteenths = Math.floor((totalBeats % 1) * 4);
					
					this.transportState.position = `${bars}:${beats}:${sixteenths}`;
				} catch (error) {
					// Fallback to simple time format
					this.transportState.position = `${Math.floor(this.currentPosition)}s`;
				}
			}
			
			// Check if we've reached the end
			if (this.currentPosition >= this.duration) {
				if (this.transportState.isLooping) {
					// Loop back to start (or loop start point)
					this.currentPosition = 0; // Simplified - could use loopStart
					this.transportState.positionSeconds = 0;
					this.transportState.position = '0:0:0';
				} else {
					// Stop at end
					this.stop();
				}
			}
			
			// Notify position update
			this._notifyTransportSubscribers({
				type: 'position',
				data: {
					position: this.transportState.position,
					positionSeconds: this.transportState.positionSeconds
				},
				timestamp: Date.now()
			});
		}, 100); // Update every 100ms
	}
	
	/**
	 * Stop position tracking
	 */
	private _stopPositionTracking(): void {
		if (this.positionUpdateInterval) {
			clearInterval(this.positionUpdateInterval);
			this.positionUpdateInterval = null;
		}
	}