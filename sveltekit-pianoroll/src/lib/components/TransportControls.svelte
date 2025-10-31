<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import type { TransportState, TransportEvent } from '../types/index.js';

	const dispatch = createEventDispatcher<{
		play: void;
		pause: void;
		stop: void;
		bpmChange: { bpm: number };
		positionChange: { position: string };
		loopChange: { enabled: boolean; start?: string; end?: string };
		swingChange: { amount: number; subdivision: string };
	}>();

	// Props
	export let disabled = false;
	export let hasNotes = false;
	export let duration = 0;

	// Transport state
	let transportState: TransportState = {
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

	// UI state
	let bpmInput = transportState.bpm;
	let showAdvanced = false;
	let positionSlider = 0;
	let maxPosition = 100;

	// Format helpers
	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const ms = Math.floor((seconds % 1) * 100);
		return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
	}

	function formatPosition(position: string): string {
		return position;
	}

	// Control handlers
	function handlePlay() {
		if (!disabled && hasNotes && !transportState.isPlaying) {
			dispatch('play');
			transportState.isPlaying = true;
			transportState.isPaused = false;
		}
	}

	function handlePause() {
		if (!disabled && transportState.isPlaying) {
			dispatch('pause');
			transportState.isPlaying = false;
			transportState.isPaused = true;
		}
	}

	function handleStop() {
		if (!disabled) {
			dispatch('stop');
			transportState.isPlaying = false;
			transportState.isPaused = false;
			positionSlider = 0;
		}
	}

	function handleBPMChange() {
		if (bpmInput >= 20 && bpmInput <= 300) {
			transportState.bpm = bpmInput;
			dispatch('bpmChange', { bpm: bpmInput });
		}
	}

	function handlePositionChange() {
		const percentage = positionSlider / 100;
		const seconds = duration * percentage;
		// Convert to bars:beats:sixteenths format (simplified)
		const bars = Math.floor(seconds / (60 / transportState.bpm * 4));
		const position = `${bars}:0:0`;
		transportState.position = position;
		transportState.positionSeconds = seconds;
		dispatch('positionChange', { position });
	}

	function handleLoopToggle() {
		transportState.isLooping = !transportState.isLooping;
		dispatch('loopChange', {
			enabled: transportState.isLooping,
			start: transportState.loopStart,
			end: transportState.loopEnd
		});
	}

	function handleSwingChange(event: Event) {
		const target = event.target as HTMLInputElement;
		transportState.swing = parseFloat(target.value);
		dispatch('swingChange', {
			amount: transportState.swing,
			subdivision: transportState.swingSubdivision
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === ' ') {
			event.preventDefault();
			if (transportState.isPlaying) {
				handlePause();
			} else {
				handlePlay();
			}
		}
	}

	// Update max position when duration changes
	$: if (duration > 0) {
		maxPosition = duration;
	}

	// Reactive state calculations
	$: canPlay = !disabled && hasNotes && !transportState.isPlaying;
	$: canPause = !disabled && transportState.isPlaying;
	$: canStop = !disabled && (transportState.isPlaying || transportState.isPaused);
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="transport-controls">
	<!-- Main Transport Controls -->
	<div class="transport-buttons">
		<button
			class="transport-btn play-btn"
			class:active={transportState.isPlaying}
			disabled={!canPlay}
			on:click={handlePlay}
			aria-label="Play"
			title="Play (Space)"
		>
			<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
				<path d="M8 5v14l11-7z" />
			</svg>
		</button>

		<button
			class="transport-btn pause-btn"
			disabled={!canPause}
			on:click={handlePause}
			aria-label="Pause"
			title="Pause"
		>
			<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
				<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
			</svg>
		</button>

		<button
			class="transport-btn stop-btn"
			disabled={!canStop}
			on:click={handleStop}
			aria-label="Stop"
			title="Stop"
		>
			<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
				<path d="M6 6h12v12H6z" />
			</svg>
		</button>
	</div>

	<!-- Tempo Control -->
	<div class="tempo-control">
		<label class="control-label" for="bpm">BPM</label>
		<div class="bpm-input-group">
			<button
				class="bpm-adjust"
				disabled={disabled || bpmInput <= 20}
				on:click={() => { bpmInput = Math.max(20, bpmInput - 1); handleBPMChange(); }}
				aria-label="Decrease BPM"
			>
				-
			</button>
			<input
				id="bpm"
				class="bpm-input"
				type="number"
				min="20"
				max="300"
				bind:value={bpmInput}
				on:input={handleBPMChange}
				disabled={disabled}
			/>
			<button
				class="bpm-adjust"
				disabled={disabled || bpmInput >= 300}
				on:click={() => { bpmInput = Math.min(300, bpmInput + 1); handleBPMChange(); }}
				aria-label="Increase BPM"
			>
				+
			</button>
		</div>
	</div>

	<!-- Position Display and Scrubber -->
	<div class="position-control">
		<div class="position-display">
			<span class="position-time">{formatTime(transportState.positionSeconds)}</span>
			<span class="position-bars">{formatPosition(transportState.position)}</span>
		</div>
		{#if duration > 0}
			<div class="position-scrubber">
				<input
					type="range"
					min="0"
					max="100"
					bind:value={positionSlider}
					on:input={handlePositionChange}
					class="scrubber-slider"
					disabled={disabled}
				/>
			</div>
		{/if}
	</div>

	<!-- Advanced Controls Toggle -->
	<button
		class="advanced-toggle"
		on:click={() => showAdvanced = !showAdvanced}
		aria-label="Toggle advanced controls"
	>
		<svg
			class="toggle-icon"
			class:rotated={showAdvanced}
			viewBox="0 0 24 24"
			fill="currentColor"
		>
			<path d="M7.41 8.58L12 13.17l4.59-4.59L18 10l-6 6-6-6 1.41-1.42z" />
		</svg>
	</button>
</div>

<!-- Advanced Controls -->
{#if showAdvanced}
	<div class="advanced-controls" transition:slide={{ duration: 200 }}>
		<!-- Loop Controls -->
		<div class="control-section">
			<h4 class="section-title">Loop</h4>
			<div class="loop-controls">
				<label class="checkbox-label">
					<input
						type="checkbox"
						bind:checked={transportState.isLooping}
						on:change={handleLoopToggle}
						disabled={disabled}
					/>
					<span class="checkmark"></span>
					Enable Loop
				</label>

				{#if transportState.isLooping}
					<div class="loop-points">
						<div class="loop-input-group">
							<label class="loop-label">Start</label>
							<input
								type="text"
								class="loop-input"
								bind:value={transportState.loopStart}
								placeholder="0:0:0"
								disabled={disabled}
							/>
						</div>
						<div class="loop-input-group">
							<label class="loop-label">End</label>
							<input
								type="text"
								class="loop-input"
								bind:value={transportState.loopEnd}
								placeholder="4:0:0"
								disabled={disabled}
							/>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Swing Controls -->
		<div class="control-section">
			<h4 class="section-title">Swing</h4>
			<div class="swing-controls">
				<div class="swing-input-group">
					<label class="control-label">Amount</label>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={transportState.swing}
						on:input={handleSwingChange}
						class="swing-slider"
						disabled={disabled}
					/>
					<span class="swing-value">{Math.round(transportState.swing * 100)}%</span>
				</div>

				<div class="swing-subdivision-group">
					<label class="control-label">Subdivision</label>
					<select
						class="swing-subdivision"
						bind:value={transportState.swingSubdivision}
						disabled={disabled}
					>
						<option value="8n">8th notes</option>
						<option value="16n">16th notes</option>
						<option value="32n">32nd notes</option>
					</select>
				</div>
			</div>
		</div>

		<!-- Transport Info -->
		<div class="control-section">
			<h4 class="section-title">Info</h4>
			<div class="transport-info">
				<div class="info-row">
					<span class="info-label">State:</span>
					<span class="info-value" class:playing={transportState.isPlaying} class:paused={transportState.isPaused}>
						{transportState.isPlaying ? 'Playing' : transportState.isPaused ? 'Paused' : 'Stopped'}
					</span>
				</div>
				{#if duration > 0}
					<div class="info-row">
						<span class="info-label">Duration:</span>
						<span class="info-value">{formatTime(duration)}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.transport-controls {
		@apply flex flex-col sm:flex-row items-center justify-between
			gap-4 p-4 bg-surface-50 border border-surface-200 rounded-lg;
	}

	.transport-buttons {
		@apply flex items-center space-x-2;
	}

	.transport-btn {
		@apply flex items-center justify-center w-10 h-10 rounded-full
			transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2;
	}

	.play-btn {
		@apply bg-green-500 text-white hover:bg-green-600 focus:ring-green-500;
	}

	.play-btn.active {
		@apply bg-green-600 shadow-lg animate-pulse;
	}

	.pause-btn {
		@apply bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-500;
	}

	.stop-btn {
		@apply bg-red-500 text-white hover:bg-red-600 focus:ring-red-500;
	}

	.transport-btn:disabled {
		@apply bg-surface-300 text-surface-500 cursor-not-allowed
			hover:bg-surface-300;
	}

	.btn-icon {
		@apply w-5 h-5;
	}

	/* Tempo Control */
	.tempo-control {
		@apply flex flex-col items-center space-y-1;
	}

	.control-label {
		@apply text-xs font-medium text-surface-600 uppercase tracking-wide;
	}

	.bpm-input-group {
		@apply flex items-center space-x-1;
	}

	.bpm-adjust {
		@apply w-6 h-6 bg-surface-200 hover:bg-surface-300 rounded text-xs
			font-bold flex items-center justify-center transition-colors;
	}

	.bpm-input {
		@apply w-16 text-center text-sm border border-surface-300 rounded px-2 py-1
			focus:outline-none focus:ring-2 focus:ring-primary-500;
	}

	/* Position Control */
	.position-control {
		@apply flex flex-col items-center space-y-2 min-w-[120px];
	}

	.position-display {
		@apply flex flex-col items-center space-y-1;
	}

	.position-time {
		@apply text-lg font-mono font-medium;
	}

	.position-bars {
		@apply text-xs text-surface-500 font-mono;
	}

	.position-scrubber {
		@apply w-full;
	}

	.scrubber-slider {
		@apply w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer;
	}

	.scrubber-slider::-webkit-slider-thumb {
		@apply appearance-none w-4 h-4 bg-primary-500 rounded-full cursor-pointer;
	}

	.scrubber-slider::-moz-range-thumb {
		@apply w-4 h-4 bg-primary-500 rounded-full cursor-pointer border-none;
	}

	/* Advanced Toggle */
	.advanced-toggle {
		@apply p-1 text-surface-400 hover:text-surface-600 transition-colors
			focus:outline-none;
	}

	.toggle-icon {
		@apply w-5 h-5 transition-transform duration-200;
	}

	.toggle-icon.rotated {
		@apply rotate-180;
	}

	/* Advanced Controls */
	.advanced-controls {
		@apply mt-4 p-4 bg-surface-100 border border-surface-200 rounded-lg
			space-y-4;
	}

	.control-section {
		@apply space-y-2;
	}

	.section-title {
		@apply text-sm font-semibold text-surface-700 uppercase tracking-wide;
	}

	/* Loop Controls */
	.loop-controls {
		@apply space-y-3;
	}

	.checkbox-label {
		@apply flex items-center space-x-2 text-sm cursor-pointer;
	}

	.checkmark {
		@apply w-4 h-4 border border-surface-400 rounded flex-shrink-0;
	}

	input[type="checkbox"]:checked + .checkmark {
		@apply bg-primary-500 border-primary-500;
	}

	.loop-points {
		@apply flex space-x-4;
	}

	.loop-input-group {
		@apply flex flex-col space-y-1;
	}

	.loop-label {
		@apply text-xs font-medium text-surface-600;
	}

	.loop-input {
		@apply w-20 text-xs border border-surface-300 rounded px-2 py-1
			font-mono focus:outline-none focus:ring-2 focus:ring-primary-500;
	}

	/* Swing Controls */
	.swing-controls {
		@apply space-y-3;
	}

	.swing-input-group {
		@apply flex items-center space-x-3;
	}

	.swing-slider {
		@apply flex-1 h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer;
	}

	.swing-value {
		@apply text-sm font-medium min-w-[3rem] text-right;
	}

	.swing-subdivision-group {
		@apply flex items-center space-x-3;
	}

	.swing-subdivision {
		@apply text-sm border border-surface-300 rounded px-2 py-1
			focus:outline-none focus:ring-2 focus:ring-primary-500;
	}

	/* Transport Info */
	.transport-info {
		@apply space-y-2;
	}

	.info-row {
		@apply flex justify-between items-center text-sm;
	}

	.info-label {
		@apply font-medium text-surface-600;
	}

	.info-value {
		@apply font-mono;
	}

	.info-value.playing {
		@apply text-green-600 font-semibold;
	}

	.info-value.paused {
		@apply text-yellow-600 font-semibold;
	}

	/* Dark mode */
	:global(.dark) .transport-controls {
		@apply bg-surface-800 border-surface-700;
	}

	:global(.dark) .transport-btn:disabled {
		@apply bg-surface-700 text-surface-400;
	}

	:global(.dark) .control-label {
		@apply text-surface-300;
	}

	:global(.dark) .bpm-adjust {
		@apply bg-surface-700 hover:bg-surface-600;
	}

	:global(.dark) .bpm-input {
		@apply bg-surface-700 border-surface-600 text-surface-100;
	}

	:global(.dark) .advanced-controls {
		@apply bg-surface-900 border-surface-700;
	}

	:global(.dark) .section-title {
		@apply text-surface-300;
	}

	:global(.dark) .checkmark {
		@apply border-surface-500;
	}

	:global(.dark) .loop-input {
		@apply bg-surface-700 border-surface-600 text-surface-100;
	}

	:global(.dark) .swing-subdivision {
		@apply bg-surface-700 border-surface-600 text-surface-100;
	}

	:global(.dark) .info-label {
		@apply text-surface-400;
	}
</style>

<script>
	import { slide } from 'svelte/transition';
</script>
