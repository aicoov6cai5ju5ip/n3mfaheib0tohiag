export type TuningSystem = 'equal' | 'natural' | 'pythagorean' | 'pentatonic';

export type SynthType = 'default' | 'fm' | 'am' | 'membrane';

export interface Note {
	name: string;
	midi: number;
	time: number;
	duration: number;
	velocity: number;
	frequency: number;
	trackIndex?: number;
}

export interface MidiTrack {
	name: string;
	notes: Note[];
}

export interface MidiData {
	name: string;
	duration: number;
	tracks: MidiTrack[];
}

export interface PianoRollOptions {
	tuningSystem?: TuningSystem;
	useSynth?: boolean;
	synthType?: SynthType;
}

export interface NoteEvent {
	type: 'noteOn' | 'noteOff' | 'stop';
	note?: string;
	frequency?: number;
	time?: number;
	duration?: number;
	velocity?: number;
}

export type NoteEventCallback = (event: NoteEvent) => void;

export interface TuningTables {
	equal: Record<string, number>;
	natural: Record<string, number>;
	pythagorean: Record<string, number>;
	pentatonic: Record<string, number>;
}

export interface ThemeMode {
	mode: 'light' | 'dark' | 'system';
}

export interface AppSettings {
	theme: ThemeMode['mode'];
	tuningSystem: TuningSystem;
	synthType: SynthType;
	useSynth: boolean;
	useExternalSynth: boolean;
}

// Transport Control Types
export interface TransportState {
	bpm: number;
	position: string; // Tone.js time format (bars:beats:sixteenths)
	positionSeconds: number;
	isPlaying: boolean;
	isPaused: boolean;
	isLooping: boolean;
	loopStart: string;
	loopEnd: string;
	swing: number; // 0-1
	swingSubdivision: string; // '8n', '16n', etc.
}

export interface TransportControls {
	play(): void;
	pause(): void;
	stop(): void;
	setBPM(bpm: number): void;
	setPosition(position: string): void;
	setLoop(enabled: boolean, start?: string, end?: string): void;
	setSwing(amount: number, subdivision?: string): void;
	getState(): TransportState;
}

export interface TransportEventCallback {
	(event: TransportEvent): void;
}

export interface TransportEvent {
	type: 'play' | 'pause' | 'stop' | 'position' | 'bpm' | 'loop';
	data?: any;
	timestamp: number;
}
