console.log('Testing MIDI creation...');
// Простой MIDI файл вручную - заголовок MThd + один трек MTrk с одной нотой C4
const header = new Uint8Array([
  0x4D, 0x54, 0x68, 0x64, // MThd
  0x00, 0x00, 0x00, 0x06, // header length
  0x00, 0x00, // format 0
  0x00, 0x01, // 1 track
  0x00, 0x60  // 96 ticks per quarter note
]);

const track = new Uint8Array([
  0x4D, 0x54, 0x72, 0x6B, // MTrk
  0x00, 0x00, 0x00, 0x0B, // track length
  0x00, 0x90, 0x3C, 0x40, // delta=0, note on C4, velocity 64
  0x60, 0x80, 0x3C, 0x40, // delta=96, note off C4, velocity 64
  0x00, 0xFF, 0x2F, 0x00  // end of track
]);

const midiArray = new Uint8Array(header.length + track.length);
midiArray.set(header, 0);
midiArray.set(track, header.length);

// Кодируем в base64
const base64 = btoa(String.fromCharCode(...midiArray));
console.log('Simple MIDI base64:', base64);
