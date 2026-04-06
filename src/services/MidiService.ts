export class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;

  async requestAccess(): Promise<boolean> {
    try {
      if (!navigator.requestMIDIAccess) return false;
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.autoDetect();
      return true;
    } catch (e) {
      console.error("MIDI Access Denied", e);
      return false;
    }
  }

  private autoDetect() {
    if (!this.midiAccess) return;
    
    const inputs = Array.from(this.midiAccess.inputs.values());
    const outputs = Array.from(this.midiAccess.outputs.values());

    this.input = inputs.find(i => i.name?.toLowerCase().includes('circuit')) || null;
    this.output = outputs.find(o => o.name?.toLowerCase().includes('circuit')) || null;
  }

  getDeviceName(): string {
    return this.output?.name || "No Circuit Detected";
  }

  sendSysEx(data: number[]) {
    if (!this.output) return;
    this.output.send(data);
  }

  // Novation Circuit Tracks Patch Dump Request
  requestPatchDump(synthIndex: number = 0) {
    if (!this.output) return;
    // F0 00 20 29 01 60 00 40 00 F7 (Synth 1)
    // F0 00 20 29 01 60 00 41 00 F7 (Synth 2)
    const msg = [0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x00, 0x40 + synthIndex, 0x00, 0xF7];
    this.output.send(msg);
  }

  sendPatch(patch: any, synthIndex: number = 0) {
    if (!this.output) return;
    // In a real implementation, we would convert the patch object to the 340-byte Nova SysEx format
    // For this demo, we'll send a dummy valid SysEx header + some data
    const header = [0xF0, 0x00, 0x20, 0x29, 0x01, 0x60, 0x00, 0x00 + synthIndex, 0x00];
    const dummyData = new Array(340).fill(0).map(() => Math.floor(Math.random() * 127));
    const footer = [0xF7];
    this.output.send([...header, ...dummyData, ...footer]);
  }

  // Drum Controls via CC (Standard for Circuit Tracks)
  // Drum 1: CC 12-16, Drum 2: 17-21, Drum 3: 22-26, Drum 4: 27-31
  sendDrumParam(drumIndex: number, paramIndex: number, value: number) {
    if (!this.output) return;
    const baseCC = 12 + (drumIndex * 5);
    const cc = baseCC + paramIndex;
    // Send CC on MIDI Channel 10 (Drum channel)
    this.output.send([0xB9, cc, value]);
  }

  requestDrumDump(drumIndex: number) {
    // Circuit Tracks doesn't easily "dump" drum settings via SysEx in the same way as synths
    // but we can simulate it or use specific request if available in firmware
    console.log(`Requesting drum ${drumIndex + 1} state...`);
  }

  onPatchReceived(callback: (data: Uint8Array) => void) {
    if (!this.input) return () => {};
    const handler = (event: any) => {
      // Check for Novation SysEx header
      if (event.data[0] === 0xF0 && event.data[2] === 0x20 && event.data[3] === 0x29) {
        callback(event.data);
      }
    };
    this.input.addEventListener('midimessage', handler);
    return () => this.input?.removeEventListener('midimessage', handler);
  }
}

export const midiService = new MidiService();
