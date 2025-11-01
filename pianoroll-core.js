// pianoroll-core.js

// Используем глобальные объекты вместо импортов
// Tone и Tonal должны быть загружены из глобальной области видимости
const Tone = window.Tone;
const Tonal = window.Tonal;

class PianoRollCore {
  constructor(options = {}) {
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
    
    this.synth = null;
    if (this.options.useSynth) {
      this._initSynth();
    }
    
    this.notes = [];
    this.noteSubscribers = [];
    this.transportSubscribers = [];
    this.isPlaying = false;
    this.isPaused = false;
    this.scheduledEvents = [];
    this.currentPosition = 0;
    this.duration = 0;
    
    // Transport state
    this.transportState = {
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
    
    this.positionUpdateInterval = null;
    
    // Initialize Tone.js transport settings
    if (Tone) {
      Tone.Transport.bpm.value = this.transportState.bpm;
      Tone.Transport.swing = this.transportState.swing;
      Tone.Transport.swingSubdivision = this.transportState.swingSubdivision;
    }
  }
  
  /**
   * Инициализация таблиц строев с соотношениями частот
   * для разных музыкальных систем
   */
  _initTuningTables() {
    const baseNote = 'C4';
    const baseFreq = Tone.Frequency(baseNote).toFrequency();
    
    const naturalRatios = {
      'C': 1,       'C#': 16/15,  'D': 9/8,     'D#': 6/5,    'E': 5/4,     'F': 4/3,     'F#': 45/32,  'G': 3/2,     'G#': 8/5,    'A': 5/3,     'A#': 9/5,    'B': 15/8
    };
    
    const pythagoreanRatios = {
      'C': 1,         'C#': 256/243,  'D': 9/8,       'D#': 32/27,    'E': 81/64,     'F': 4/3,       'F#': 729/512,  'G': 3/2,       'G#': 128/81,   'A': 27/16,     'A#': 16/9,     'B': 243/128
    };
    
    const pentatonicRatios = {
      'C': 1,     'D': 9/8,   'E': 5/4,   'G': 3/2,   'A': 5/3
    };
    
    for (let octave = 0; octave < 9; octave++) {
      const baseForOctave = baseFreq * Math.pow(2, octave - 4); // C4 = 261.63 Hz
      
      Object.keys(naturalRatios).forEach(noteName => {
        const noteId = `${noteName}${octave}`;
        
        this.tuningTables.equal[noteId] = Tone.Frequency(noteId).toFrequency();
        this.tuningTables.natural[noteId] = baseForOctave * naturalRatios[noteName];
        this.tuningTables.pythagorean[noteId] = baseForOctave * pythagoreanRatios[noteName];
        
        if (noteName in pentatonicRatios) {
          this.tuningTables.pentatonic[noteId] = baseForOctave * pentatonicRatios[noteName];
        }
      });
    }
  }
  
  /**
   * Инициализация синтезатора в зависимости от опций
   */
  _initSynth() {
    if (this.synth) {
      this.synth.dispose();
    }
    
    const synthOptions = {
      oscillator: {
        type: 'triangle'
      },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 0.5
      }
    };
    
    switch (this.options.synthType) {
      case 'fm':
        this.synth = new Tone.PolySynth(Tone.FMSynth, synthOptions).toDestination();
        break;
      case 'am':
        this.synth = new Tone.PolySynth(Tone.AMSynth, synthOptions).toDestination();
        break;
      case 'membrane':
        this.synth = new Tone.PolySynth(Tone.MembraneSynth, synthOptions).toDestination();
        break;
      case 'default':
      default:
        this.synth = new Tone.PolySynth(Tone.Synth, synthOptions).toDestination();
        break;
    }
  }
  
  /**
   * Преобразует ноту (строку) в частоту согласно выбранному строю
   * @param {string} note - Имя ноты (например, "C4")
   * @return {number} Частота в Гц
   */
  noteToFrequency(note) {
    const system = this.options.tuningSystem;
    
    // Если нота присутствует в таблице текущего строя
    if (system in this.tuningTables && note in this.tuningTables[system]) {
      return this.tuningTables[system][note];
    }
    
    // Для равномерно темперированного строя используем встроенный конвертер Tone.js
    if (system === 'equal') {
      return Tone.Frequency(note).toFrequency();
    }
    
    // Для пентатоники, если запрошена нота не из пентатоники,
    // находим ближайшую ноту в пентатонике (или возвращаем равномерно темперированную)
    if (system === 'pentatonic') {
      const noteName = Tonal.Note.pc(note); // Pitch class (C, D, E, etc.)
      const octave = Tonal.Note.octave(note);

      const pentatonicNotes = ['C', 'D', 'E', 'G', 'A'];
      
      if (pentatonicNotes.includes(noteName)) {
        const pentatonicNote = `${noteName}${octave}`;
        if (pentatonicNote in this.tuningTables.pentatonic) {
          return this.tuningTables.pentatonic[pentatonicNote];
        }
      }
      
      // Если нота не в пентатонике, возвращаем равномерно темперированную частоту
      // или можно реализовать логику "ближайшей" ноты
      return Tone.Frequency(note).toFrequency();
    }
    
    // Если ничего не сработало, возвращаем равномерно темперированную частоту
    return Tone.Frequency(note).toFrequency();
  }
  
  /**
   * Загружает MIDI-JSON объект и преобразует его в формат нот для пианоролла
   * @param {Object} midiJson - MIDI в формате JSON (от @tonejs/midi)
   */
  loadMidiJson(midiJson) {
    this.notes = [];
    
    midiJson.tracks.forEach((track, trackIndex) => {
      track.notes.forEach(note => {
        this.notes.push({
          name: note.name,             
          midi: note.midi,             
          time: note.time,             
          duration: note.duration,     
          velocity: note.velocity,     
          frequency: this.noteToFrequency(note.name), 
          trackIndex: trackIndex       
        });
      });
    });
    
    this.notes.sort((a, b) => a.time - b.time);
    
    // Update duration and reset transport state
    this.duration = midiJson.duration || 0;
    this.transportState.positionSeconds = 0;
    this.transportState.position = '0:0:0';
    this.currentPosition = 0;
    
    return this.notes;
  }
  
  /**
   * Запускает воспроизведение загруженных нот
   */
  play() {
    if (this.isPlaying) {
      return;
    }
    
    if (this.isPaused) {
      // Resume from pause
      this._resumeFromPause();
      return;
    }
    
    if (!this.notes.length) {
      console.warn("No notes loaded to play.");
      return;
    }
    
    this.isPlaying = true;
    this.isPaused = false;
    this.transportState.isPlaying = true;
    this.transportState.isPaused = false;
    
    // Start position tracking
    this._startPositionTracking();
    
    // Сбрасываем все предыдущие запланированные события
    this.scheduledEvents.forEach(id => Tone.Transport.clear(id));
    this.scheduledEvents = [];

    const now = Tone.now() + 0.1; // Небольшая задержка
    const startTime = this.currentPosition;
    
    // Schedule all notes from current position
    const filteredNotes = this.notes.filter(note => note.time >= startTime);
    
    filteredNotes.forEach(note => {
      const noteStartTime = now + (note.time - startTime);

      // Планируем событие noteOn
      const noteOnEventId = Tone.Transport.schedule((time) => {
          // Если используем встроенный синтезатор
          if (this.options.useSynth && this.synth) {
            this.synth.triggerAttack(note.frequency, time, note.velocity);
          }
          // Уведомляем всех подписчиков о ноте
          this._notifySubscribers({
            type: 'noteOn',
            note: note.name,
            frequency: note.frequency,
            time: time,
            duration: note.duration,
            velocity: note.velocity
          });
      }, noteStartTime);
      this.scheduledEvents.push(noteOnEventId);
      
      // Планируем событие noteOff
      const noteOffTime = noteStartTime + note.duration;
      const noteOffEventId = Tone.Transport.schedule((time) => {
          if (this.options.useSynth && this.synth) {
            this.synth.triggerRelease(note.frequency, time);
          }
          this._notifySubscribers({
            type: 'noteOff',
            note: note.name,
            frequency: note.frequency,
            time: time,
            velocity: note.velocity
          });
      }, noteOffTime);
      this.scheduledEvents.push(noteOffEventId);
    });

    // Запускаем транспорт Tone.js, если он еще не запущен
    if (Tone.Transport.state !== 'started') {
        Tone.Transport.start();
    }
    
    // Notify transport event
    this._notifyTransportSubscribers({
      type: 'play',
      data: { position: startTime },
      timestamp: Date.now()
    });
  }
  
  /**
   * Пауза воспроизведения
   */
  pause() {
    if (!this.isPlaying) {
      return this;
    }
    
    Tone.Transport.pause();
    
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
    
    return this;
  }
  
  /**
   * Resume from pause
   */
  _resumeFromPause() {
    Tone.Transport.start();
    
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
   * Останавливает воспроизведение и отменяет все запланированные события
   */
  stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    
    this.scheduledEvents.forEach(id => {
      Tone.Transport.clear(id);
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
    
    if (this.options.useSynth && this.synth) {
      this.synth.releaseAll();
    }
    
    this._notifyTransportSubscribers({
      type: 'stop',
      data: { position: 0 },
      timestamp: Date.now()
    });
    
    this._notifySubscribers({ type: 'stop' });
    
    return this;
  }
  
  /**
   * Подписывает внешний обработчик на события нот
   * @param {Function} callback - Функция, вызываемая при событиях нот
   */
  subscribe(callback) {
    if (typeof callback === 'function' && !this.noteSubscribers.includes(callback)) {
      this.noteSubscribers.push(callback);
    }
    return this; 
  }
  
  /**
   * Отписывает обработчик от событий нот
   * @param {Function} callback - Функция, которую нужно отписать
   */
  unsubscribe(callback) {
    this.noteSubscribers = this.noteSubscribers.filter(cb => cb !== callback);
    return this;
  }
  
  /**
   * Уведомляет всех подписчиков о событии
   * @param {Object} event - Информация о событии
   */
  _notifySubscribers(event) {
    this.noteSubscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in note subscriber:', error);
      }
    });
  }
  
  /**
   * Отправляет события всем подписчикам транспорта
   * @param {Object} event - Объект события
   */
  _notifyTransportSubscribers(event) {
    this.transportSubscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in transport subscriber:', error);
      }
    });
  }
  
  /**
   * Подписывает внешний обработчик на события транспорта
   * @param {Function} callback - Функция, вызываемая при событиях транспорта
   * @returns {Function} Функция для отмены подписки
   */
  subscribeToTransport(callback) {
    if (typeof callback === 'function' && !this.transportSubscribers.includes(callback)) {
      this.transportSubscribers.push(callback);
    }
    
    // Возвращаем функцию для отмены подписки
    return () => {
      const index = this.transportSubscribers.indexOf(callback);
      if (index > -1) {
        this.transportSubscribers.splice(index, 1);
      }
    };
  }
  
  /**
   * Изменяет строй и перерасчитывает частоты для всех нот
   * @param {string} tuningSystem - Строй ('equal', 'natural', 'pythagorean', 'pentatonic')
   */
  setTuningSystem(tuningSystem) {
    if (!(tuningSystem in this.tuningTables)) {
      console.warn(`Unknown tuning system: ${tuningSystem}. Using 'equal' instead.`);
      tuningSystem = 'equal';
    }
    
    this.options.tuningSystem = tuningSystem;
    
    this.notes.forEach(note => {
      note.frequency = this.noteToFrequency(note.name);
    });
    
    // Если воспроизведение активно, перезапустить с новыми частотами
    if (this.isPlaying) {
        this.stop();
        this.play();
    }

    return this;
  }
  
  /**
   * Включает или выключает встроенный синтезатор
   * @param {boolean} useSynth - Использовать ли встроенный синтезатор
   */
  toggleSynth(useSynth) {
    this.options.useSynth = !!useSynth;
    
    if (this.options.useSynth && !this.synth) {
      this._initSynth();
    } else if (!this.options.useSynth && this.synth) {
        this.synth.dispose();
        this.synth = null;
    }
    
    return this;
  }
  
  /**
   * Изменяет тип встроенного синтезатора
   * @param {string} synthType - Тип синтезатора
   */
  setSynthType(synthType) {
    this.options.synthType = synthType;
    
    if (this.options.useSynth) {
      this._initSynth();
    }
    
    return this;
  }
  
  /**
   * Возвращает информацию о всех нотах в простом формате
   * для использования во внешних синтезаторах
   * @return {Array} Массив объектов нот
   */
  getNotes() {
    return this.notes.map(note => ({
      name: note.name,
      frequency: note.frequency,
      time: note.time,
      duration: note.duration,
      velocity: note.velocity
    }));
  }
  
  /**
   * Возвращает JSON строку с данными нот
   * @returns {string} JSON представление нот
   */
  toJSON() {
    return JSON.stringify(this.getNotes(), null, 2);
  }
  
  /**
   * Очищает все ноты
   */
  clear() {
    this.stop();
    this.notes = [];
    return this;
  }
  
  /**
   * Устанавливает BPM (темп)
   * @param {number} bpm - Темп в ударах в минуту (20-300)
   */
  setBPM(bpm) {
    if (typeof bpm !== 'number' || bpm < 20 || bpm > 300) {
      console.warn(`Invalid BPM value: ${bpm}. Must be between 20 and 300.`);
      return this;
    }
    
    this.transportState.bpm = bpm;
    
    if (Tone) {
      Tone.Transport.bpm.value = bpm;
      console.log(`BPM set to ${bpm}`);
    }
    
    this._notifyTransportSubscribers({
      type: 'bpm',
      data: { bpm: bpm },
      timestamp: Date.now()
    });
    
    return this;
  }
  
  /**
   * Устанавливает позицию воспроизведения
   * @param {string|number} position - Позиция в формате Tone.js или секундах
   */
  setPosition(position) {
    if (typeof position === 'number') {
      this.currentPosition = Math.max(0, Math.min(position, this.duration));
      this.transportState.positionSeconds = this.currentPosition;
      // Convert seconds to bars:beats:sixteenths format
      const bars = Math.floor(this.currentPosition / (240 / this.transportState.bpm));
      const beats = 0;
      const sixteenths = 0;
      this.transportState.position = `${bars}:${beats}:${sixteenths}`;
    } else if (typeof position === 'string') {
      this.transportState.position = position;
      // Convert to seconds (approximate)
      const parts = position.split(':');
      const bars = parseInt(parts[0]) || 0;
      this.currentPosition = bars * (240 / this.transportState.bpm);
      this.transportState.positionSeconds = this.currentPosition;
    }
    
    if (Tone) {
      Tone.Transport.position = this.transportState.position;
    }
    
    this._notifyTransportSubscribers({
      type: 'position',
      data: { 
        position: this.transportState.position,
        positionSeconds: this.transportState.positionSeconds
      },
      timestamp: Date.now()
    });
    
    return this;
  }
  
  /**
   * Устанавливает настройки петли
   * @param {boolean} enabled - Включить петлю
   * @param {string} start - Начальная позиция петли (опционально)
   * @param {string} end - Конечная позиция петли (опционально)
   */
  setLoop(enabled, start, end) {
    this.transportState.isLooping = !!enabled;
    
    if (start) {
      this.transportState.loopStart = start;
    }
    if (end) {
      this.transportState.loopEnd = end;
    }
    
    if (Tone) {
      Tone.Transport.loop = this.transportState.isLooping;
      if (this.transportState.isLooping) {
        Tone.Transport.loopStart = this.transportState.loopStart;
        Tone.Transport.loopEnd = this.transportState.loopEnd;
      }
    }
    
    console.log(`Loop ${enabled ? 'enabled' : 'disabled'}`, {
      start: this.transportState.loopStart,
      end: this.transportState.loopEnd
    });
    
    this._notifyTransportSubscribers({
      type: 'loop',
      data: { 
        enabled: this.transportState.isLooping,
        start: this.transportState.loopStart,
        end: this.transportState.loopEnd
      },
      timestamp: Date.now()
    });
    
    return this;
  }
  
  /**
   * Устанавливает swing (качание ритма)
   * @param {number} amount - Количество swing (0-1)
   * @param {string} subdivision - Деление для swing ('8n', '16n' и т.д.)
   */
  setSwing(amount, subdivision = '8n') {
    if (typeof amount !== 'number' || amount < 0 || amount > 1) {
      console.warn(`Invalid swing amount: ${amount}. Must be between 0 and 1.`);
      return this;
    }
    
    this.transportState.swing = amount;
    this.transportState.swingSubdivision = subdivision;
    
    if (Tone) {
      Tone.Transport.swing = amount;
      Tone.Transport.swingSubdivision = subdivision;
    }
    
    console.log(`Swing set to ${amount} with subdivision ${subdivision}`);
    
    this._notifyTransportSubscribers({
      type: 'swing',
      data: { 
        amount: amount,
        subdivision: subdivision
      },
      timestamp: Date.now()
    });
    
    return this;
  }
  
  /**
   * Возвращает текущее состояние транспорта
   * @returns {Object} Объект с состоянием транспорта
   */
  getTransportState() {
    return {
      ...this.transportState,
      positionSeconds: this.currentPosition,
      duration: this.duration
    };
  }
  
  /**
   * Освобождает ресурсы (синтезаторы и т.д.)
   */
  dispose() {
    this.stop();
    
    // Stop position tracking
    this._stopPositionTracking();
    
    if (this.synth) {
      this.synth.dispose();
      this.synth = null;
    }
    
    this.notes = [];
    this.noteSubscribers = [];
    this.transportSubscribers = [];
    
    return this;
  }
}

// PianoRollCore доступен как глобальный класс
window.PianoRollCore = PianoRollCore;
