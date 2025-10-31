<script lang="ts">
	import { onMount } from 'svelte';
	import { PianoRollCore } from '../lib/core/PianoRollCore.js';
	import type { MidiData, TuningSystem, SynthType, NoteEvent, TransportEvent } from '../lib/types/index.js';
	
	// Components
	import MidiUpload from '../lib/components/MidiUpload.svelte';
	import TuningSelector from '../lib/components/TuningSelector.svelte';
	import SynthControls from '../lib/components/SynthControls.svelte';
	import TransportControls from '../lib/components/TransportControls.svelte';
	import JsonDisplay from '../lib/components/JsonDisplay.svelte';

	// Application state
	let core: PianoRollCore | null = null;
	let midiData: MidiData | null = null;
	let currentFile: File | null = null;
	let tuningSystem: TuningSystem = 'equal';
	let synthType: SynthType = 'default';
	let useSynth = true;
	let isPlaying = false;
	let errorMessage = '';
	let jsonOutput = '';

	// Event tracking for visual feedback
	let currentNotes: string[] = [];
	let playingEvents: NoteEvent[] = [];
	
	// Transport control state
	let transportUnsubscribe: (() => void) | null = null;

	onMount(() => {
		// Initialize PianoRollCore
		core = new PianoRollCore({
			tuningSystem,
			useSynth,
			synthType
		});

		// Subscribe to note events for visual feedback
		const unsubscribe = core.subscribe((event: NoteEvent) => {
			playingEvents = [...playingEvents.slice(-10), event]; // Keep last 10 events
			
			if (event.type === 'noteOn' && event.note) {
				currentNotes = [...currentNotes, event.note];
			} else if (event.type === 'noteOff' && event.note) {
				currentNotes = currentNotes.filter(note => note !== event.note);
			} else if (event.type === 'stop') {
				currentNotes = [];
				isPlaying = false;
			}
		});
		
		// Subscribe to transport events
		transportUnsubscribe = core.subscribeToTransport((event: TransportEvent) => {
			if (event.type === 'play') {
				isPlaying = true;
			} else if (event.type === 'pause' || event.type === 'stop') {
				isPlaying = false;
				if (event.type === 'stop') {
					currentNotes = [];
				}
			}
		});

		return () => {
			unsubscribe();
			transportUnsubscribe?.();
			core?.dispose();
		};
	});

	function handleFileSelected(event: CustomEvent<{ file: File; data: MidiData }>) {
		clearError();
		const { file, data } = event.detail;
		
		currentFile = file;
		midiData = data;
		
		// Update JSON output
		updateJsonOutput();
		
		console.log('MIDI file loaded:', data);
	}

	function handleFileError(event: CustomEvent<{ message: string }>) {
		errorMessage = event.detail.message;
		setTimeout(clearError, 5000); // Clear after 5 seconds
	}

	function handleTuningChange(event: CustomEvent<TuningSystem>) {
		clearError();
		tuningSystem = event.detail;
		core?.updateTuningSystem(tuningSystem);
		updateJsonOutput();
	}

	function handleSynthTypeChange(event: CustomEvent<SynthType>) {
		clearError();
		synthType = event.detail;
		core?.updateSynthType(synthType);
	}

	function handleSynthEnableChange(event: CustomEvent<boolean>) {
		clearError();
		useSynth = event.detail;
		if (core) {
			core.options.useSynth = useSynth;
			if (useSynth) {
				core.updateSynthType(synthType);
			} else {
				core.stop();
			}
		}
	}

	// Transport control handlers
	async function handlePlay() {
		if (!core || !midiData) return;
		
		try {
			// Start Tone.js audio context if needed
			if (typeof window !== 'undefined' && window.Tone && window.Tone.context.state !== 'running') {
				await window.Tone.start();
			}
			
			core.play();
		} catch (error) {
			console.error('Error playing MIDI:', error);
			errorMessage = `Playback error: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}
	}

	function handlePause() {
		if (!core) return;
		core.pause();
	}

	function handleStop() {
		if (!core) return;
		core.stop();
	}
	
	function handleBPMChange(event: CustomEvent<{ bpm: number }>) {
		if (!core) return;
		core.setBPM(event.detail.bpm);
	}
	
	function handlePositionChange(event: CustomEvent<{ position: string }>) {
		if (!core) return;
		core.setPosition(event.detail.position);
	}
	
	function handleLoopChange(event: CustomEvent<{ enabled: boolean; start?: string; end?: string }>) {
		if (!core) return;
		const { enabled, start, end } = event.detail;
		core.setLoop(enabled, start, end);
	}
	
	function handleSwingChange(event: CustomEvent<{ amount: number; subdivision: string }>) {
		if (!core) return;
		const { amount, subdivision } = event.detail;
		core.setSwing(amount, subdivision);
	}

	function updateJsonOutput() {
		if (core) {
			jsonOutput = core.toJSON();
		}
	}

	function clearError() {
		errorMessage = '';
	}

	// Computed values
	$: hasNotes = midiData?.tracks.some(track => track.notes.length > 0) ?? false;
	$: noteCount = midiData?.tracks.reduce((sum, track) => sum + track.notes.length, 0) ?? 0;
	$: duration = midiData?.duration ?? 0;
	$: canPlay = hasNotes && useSynth && !isPlaying;
</script>

<svelte:head>
	<title>Piano Roll - MIDI Parser with Custom Tuning</title>
	<meta name="description" content="Upload and parse MIDI files with custom tuning systems including equal temperament, just intonation, pythagorean, and pentatonic scales." />
</svelte:head>

<div class="piano-roll-app">
	<!-- Error Banner -->
	{#if errorMessage}
		<div class="error-banner">
			<div class="error-content">
				<svg class="error-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
				</svg>
				<p class="error-text">{errorMessage}</p>
				<button class="error-close" on:click={clearError} aria-label="Dismiss error">
					<svg class="close-icon" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
		</div>
	{/if}

	<!-- Main Content Grid -->
	<div class="content-grid">
		<!-- Upload Section -->
		<section class="upload-section">
			<h2 class="section-title">1. Upload MIDI File</h2>
			<MidiUpload 
				on:fileSelected={handleFileSelected}
				on:error={handleFileError}
			/>
		</section>

		<!-- Configuration Section -->
		<section class="config-section">
			<h2 class="section-title">2. Configure Settings</h2>
			<div class="config-grid">
				<div class="config-item">
					<TuningSelector 
						bind:value={tuningSystem}
						disabled={!hasNotes}
						on:change={handleTuningChange}
					/>
				</div>
				<div class="config-item">
					<SynthControls
						bind:synthType
						bind:useSynth
						disabled={!hasNotes}
						on:typeChange={handleSynthTypeChange}
						on:enableChange={handleSynthEnableChange}
					/>
				</div>
			</div>
		</section>

		<!-- Playback Section -->
		<section class="playback-section">
			<h2 class="section-title">3. Playback & Control</h2>
			<TransportControls
				{hasNotes}
				{duration}
				disabled={!useSynth}
				on:play={handlePlay}
				on:pause={handlePause}
				on:stop={handleStop}
				on:bpmChange={handleBPMChange}
				on:positionChange={handlePositionChange}
				on:loopChange={handleLoopChange}
				on:swingChange={handleSwingChange}
			/>
			
			<!-- Real-time feedback -->
			{#if currentNotes.length > 0}
				<div class="note-feedback">
					<h4 class="feedback-title">Currently Playing:</h4>
					<div class="note-list">
						{#each currentNotes.slice(-8) as note (note)}
							<span class="note-item">{note}</span>
						{/each}
						{#if currentNotes.length > 8}
							<span class="note-more">+{currentNotes.length - 8} more</span>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<!-- Output Section -->
		<section class="output-section">
			<h2 class="section-title">4. JSON Output</h2>
			<JsonDisplay 
				{jsonOutput} 
				label="Parsed MIDI Data with Custom Tuning" 
				maxHeight="500px"
			/>
		</section>
	</div>

	<!-- Usage Guide -->
	<aside class="usage-guide">
		<h3 class="guide-title">How to Use</h3>
		<ol class="guide-steps">
			<li class="guide-step">
				<span class="step-number">1</span>
				<span class="step-text">Upload a MIDI file (.mid or .midi format)</span>
			</li>
			<li class="guide-step">
				<span class="step-number">2</span>
				<span class="step-text">Choose a tuning system (equal, natural, pythagorean, or pentatonic)</span>
			</li>
			<li class="guide-step">
				<span class="step-number">3</span>
				<span class="step-text">Select synthesizer type and enable audio playback</span>
			</li>
			<li class="guide-step">
				<span class="step-number">4</span>
				<span class="step-text">Press play to hear the differences in tuning systems</span>
			</li>
			<li class="guide-step">
				<span class="step-number">5</span>
				<span class="step-text">View and export the parsed JSON data</span>
			</li>
		</ol>
	</aside>
</div>

<style>
	.piano-roll-app {
		@apply space-y-8;
	}

	/* Error banner */
	.error-banner {
		@apply bg-red-50 border border-red-200 rounded-lg p-4 mb-6;
	}

	.error-content {
		@apply flex items-center space-x-3;
	}

	.error-icon {
		@apply w-5 h-5 text-red-500 flex-shrink-0;
	}

	.error-text {
		@apply flex-1 text-sm text-red-800;
	}

	.error-close {
		@apply text-red-500 hover:text-red-700;
		transition: color 200ms ease-in-out;
	}

	.close-icon {
		@apply w-4 h-4;
	}

	/* Content grid */
	.content-grid {
		@apply space-y-8;
	}

	.section-title {
		@apply text-xl font-bold text-surface-900 mb-4 flex items-center;
	}

	/* Configuration */
	.config-grid {
		@apply grid grid-cols-1 lg:grid-cols-2 gap-6;
	}

	.config-item {
		@apply space-y-4;
	}

	/* Real-time feedback */
	.note-feedback {
		@apply mt-4 p-4 bg-green-50 border border-green-200 rounded-lg;
	}

	.feedback-title {
		@apply text-sm font-semibold text-green-800 mb-2;
	}

	.note-list {
		@apply flex flex-wrap gap-1;
	}

	.note-item {
		@apply px-2 py-1 bg-green-200 text-green-800 text-xs font-mono rounded;
	}

	.note-more {
		@apply px-2 py-1 bg-green-100 text-green-600 text-xs rounded;
	}

	/* Usage guide */
	.usage-guide {
		@apply mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl;
	}

	.guide-title {
		@apply text-lg font-bold text-blue-900 mb-4;
	}

	.guide-steps {
		@apply space-y-3;
	}

	.guide-step {
		@apply flex items-start space-x-3;
	}

	.step-number {
		@apply flex items-center justify-center w-6 h-6 bg-blue-500 text-white text-sm font-bold rounded-full flex-shrink-0;
	}

	.step-text {
		@apply text-sm text-blue-800 leading-relaxed;
	}

	/* Dark mode styles */
	:global(.dark) .error-banner {
		@apply bg-red-950 border-red-800;
	}

	:global(.dark) .error-icon {
		@apply text-red-400;
	}

	:global(.dark) .error-text {
		@apply text-red-200;
	}

	:global(.dark) .error-close {
		@apply text-red-400 hover:text-red-300;
	}

	:global(.dark) .section-title {
		@apply text-surface-100;
	}

	:global(.dark) .note-feedback {
		@apply bg-green-950 border-green-800;
	}

	:global(.dark) .feedback-title {
		@apply text-green-200;
	}

	:global(.dark) .note-item {
		@apply bg-green-800 text-green-200;
	}

	:global(.dark) .note-more {
		@apply bg-green-900 text-green-300;
	}

	:global(.dark) .usage-guide {
		@apply bg-blue-950 border-blue-800;
	}

	:global(.dark) .guide-title {
		@apply text-blue-200;
	}

	:global(.dark) .step-number {
		@apply bg-blue-600;
	}

	:global(.dark) .step-text {
		@apply text-blue-300;
	}
</style>
