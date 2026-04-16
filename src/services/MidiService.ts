import { NovaSysEx } from "../lib/novaSysEx";
import { PatchData } from "../types";

export class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;
  private patchCallbacks: ((patch: PatchData) => void)[] = [];
  private sysExCallbacks: ((data: Uint8Array) => void)[] = [];
  private errorCallbacks: ((msg: string) => void)[] = [];
  private useNineByteHeader: boolean = false;
  private forceHeaderSize: number | null = null;
  private useExtraByte: boolean = false;
  private detectedHeaderSize: number = 8;
  private deviceId: number = 0x00;
  private productId: number = 0x64; // Default to Circuit Tracks

  async requestAccess(): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
        console.error("MIDI: Web MIDI API not supported");
        return false;
      }
      
      // If already have access, just return true
      if (this.midiAccess) return true;

      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.midiAccess.onstatechange = () => {
        console.log("MIDI: State change detected");
        this.autoDetect();
      };
      this.autoDetect();
      return true;
    } catch (e) {
      console.error("MIDI Access Denied or Failed", e);
      return false;
    }
  }

  async reconnect(): Promise<boolean> {
    this.midiAccess = null;
    this.useNineByteHeader = false; // Reset on reconnect
    return this.requestAccess();
  }

  private autoDetect() {
    if (!this.midiAccess) return;
    
    const inputs = Array.from(this.midiAccess.inputs.values());
    const outputs = Array.from(this.midiAccess.outputs.values());

    console.log("Available MIDI Outputs:", outputs.map(o => o.name));
    console.log("Available MIDI Inputs:", inputs.map(i => i.name));

    // Prefer ports that contain "Circuit Tracks" and "MIDI 1" or just "Circuit Tracks"
    const bestOutput = outputs.find(o => o.name?.toLowerCase().includes('circuit') && o.name?.toLowerCase().includes('midi 1')) || 
                       outputs.find(o => o.name?.toLowerCase().includes('circuit')) || 
                       (outputs.length > 0 ? outputs[0] : null);

    const bestInput = inputs.find(i => i.name?.toLowerCase().includes('circuit') && i.name?.toLowerCase().includes('midi 1')) || 
                      inputs.find(i => i.name?.toLowerCase().includes('circuit')) || 
                      (inputs.length > 0 ? inputs[0] : null);

    if (bestOutput) this.setOutput(bestOutput.id);
    if (bestInput) this.setInput(bestInput.id);
  }

  getDeviceName(): string {
    return this.output?.name || "No Circuit Detected";
  }

  getAvailablePorts() {
    if (!this.midiAccess) return { inputs: [], outputs: [] };
    return {
      inputs: Array.from(this.midiAccess.inputs.values()),
      outputs: Array.from(this.midiAccess.outputs.values())
    };
  }

  setInput(id: string) {
    if (!this.midiAccess) return;
    
    const newInput = this.midiAccess.inputs.get(id) || null;
    if (this.input === newInput && this.input?.onmidimessage) return;

    // Remove listener from old input
    if (this.input) {
      this.input.onmidimessage = null;
    }

    this.input = newInput;
    
    if (this.input) {
      console.log("MIDI: Input set to", this.input.name);
      // Attach global SysEx handler
      this.input.onmidimessage = (event: any) => {
        const data = event.data;
        if (data && data[0] === 0xF0) {
          this.handleSysEx(data);
        }
      };
    }
  }

  private handleSysEx(data: Uint8Array) {
    const hexData = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    
    // Notify SysEx monitors
    this.sysExCallbacks.forEach(cb => cb(data));

    const isNovation = data[0] === 0xF0 && data[1] === 0x00 && data[2] === 0x20 && data[3] === 0x29;
    const isCircuit = isNovation && data[4] === 0x01 && (data[5] === 0x64 || data[5] === 0x60);

    if (isCircuit) {
      this.productId = data[5];
      console.log(`%cMIDI RECV (Circuit - 0x${this.productId.toString(16).toUpperCase()}): %c${hexData}`, "color: #10b981; font-weight: bold", "color: #6ee7b7");
    } else {
      console.log(`%cMIDI RECV (Other): %c${hexData}`, "color: #6b7280; font-weight: bold", "color: #9ca3af");
    }

    // Patch dump response usually starts with F0 00 20 29 01 64 01 <loc> ...
    // or F0 00 20 29 01 64 40 <loc> ... depending on the request
    if (isCircuit && data.length >= 348) {
      console.log("%cMIDI: Valid Patch Dump detected, deserializing...", "color: #3b82f6; font-weight: bold");
      
      // Header: F0 00 20 29 01 64 <cmd> <loc>
      // cmd: 0x01 (Patch Data) or 0x40 (Response to Request)
      let headerSize = 8;
      let cmd = data[6];
      let loc = data[7];

      // Check if there's a Device ID byte at index 6 (making it a 9-byte header)
      // If index 6 is 0x00 and index 7 is a known command (0x01, 0x40, 0x04)
      if (cmd === 0x00 && (data[7] === 0x01 || data[7] === 0x40 || data[7] === 0x04)) {
        headerSize = 9;
        this.detectedHeaderSize = 9;
        this.deviceId = data[6];
        cmd = data[7];
        loc = data[8];
        this.useNineByteHeader = true;
        console.log(`%cMIDI: Detected 9-byte header format (Device ID: 0x${this.deviceId.toString(16).toUpperCase()})`, "color: #9333ea");
      } else if (data.length === 348) {
        // Special case: Circuit Tracks often sends 348 bytes for a patch dump
        // This means 7 bytes header + 340 bytes data + 1 byte F7
        // Header: F0 00 20 29 01 64 <cmd>
        headerSize = 7;
        this.detectedHeaderSize = 7;
        cmd = data[6];
        loc = 0; // Location not provided in 7-byte header
        console.log("%cMIDI: Detected 7-byte header format (348 bytes total)", "color: #9333ea");
      } else {
        this.detectedHeaderSize = 8;
      }
      
      if (cmd === 0x04) {
        const errorMsg = `Hardware Error (NACK): 0x${loc.toString(16).toUpperCase()}`;
        console.error(`%cMIDI: ${errorMsg}`, "color: #ef4444; font-weight: bold");
        this.errorCallbacks.forEach(cb => cb(errorMsg));
        return;
      }

      console.log(`%cMIDI: Header Info - CMD: 0x${cmd.toString(16).toUpperCase()}, LOC: 0x${loc.toString(16).toUpperCase()}`, "color: #9333ea");

      const patchData = data.slice(headerSize, headerSize + 340);
      try {
        const patch = NovaSysEx.deserialize(patchData);
        this.patchCallbacks.forEach(cb => cb(patch));
      } catch (e) {
        console.error("MIDI: Deserialization failed", e);
      }
    } else if (isCircuit && data.length < 348) {
      // Check for error messages (usually 11 bytes: F0 00 20 29 01 64 04 ...)
      if (data[6] === 0x04 || (data[6] === 0x00 && data[7] === 0x04)) {
        const errorCode = data[6] === 0x04 ? data[7] : data[8];
        const errorMsg = `Hardware Error: 0x${errorCode.toString(16).toUpperCase()}`;
        console.error(`%cMIDI: ${errorMsg}`, "color: #ef4444; font-weight: bold");
        this.errorCallbacks.forEach(cb => cb(errorMsg));
      } else {
        console.warn(`MIDI: Received Circuit SysEx but length is ${data.length} (expected >= 348). Data: ${hexData}`);
      }
    }
  }

  setOutput(id: string) {
    if (!this.midiAccess) return;
    this.output = this.midiAccess.outputs.get(id) || null;
    if (this.output) console.log("Manual MIDI Output:", this.output.name);
  }

  getSelectedPorts() {
    return {
      input: this.input?.id || null,
      output: this.output?.id || null
    };
  }

  sendSysEx(data: number[]) {
    if (!this.output) return;
    this.output.send(data);
  }

  // Novation Circuit Tracks Patch Dump Request
  requestPatchDump(synthIndex: number = 0): number {
    if (!this.output) {
      console.error("MIDI: Fetch failed - Output not found");
      return 0;
    }
    // Circuit Tracks Product ID is 0x64, Original Circuit is 0x60
    // Standard Request for Current Patch: F0 00 20 29 01 <prod> 40 <synth_index> F7
    // Or 9-byte: F0 00 20 29 01 <prod> <dev_id> 40 <synth_index> F7
    // synthIndex: 0 for Synth 1, 1 for Synth 2
    const msg = (this.useNineByteHeader || this.detectedHeaderSize === 9)
      ? [0xF0, 0x00, 0x20, 0x29, 0x01, this.productId, this.deviceId, 0x40, synthIndex, 0xF7]
      : [0xF0, 0x00, 0x20, 0x29, 0x01, this.productId, 0x40, synthIndex, 0xF7];
    
    const hexMsg = msg.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`%cMIDI SEND: Requesting Patch Dump for Synth ${synthIndex + 1} %c(HEX: ${hexMsg})`, "color: #f59e0b; font-weight: bold", "color: #fbbf24");
    this.output.send(msg);
    return msg.length;
  }

  sendPatch(patch: PatchData, synthIndex: number = 0): number {
    if (!this.output) {
      console.error("MIDI: Send failed - Output not found");
      return 0;
    }
    // Circuit Tracks "Replace Current Patch" SysEx:
    // F0 00 20 29 01 <prod> 01 <synth_index> <340 bytes> F7
    // Or 9-byte: F0 00 20 29 01 <prod> <dev_id> 01 <synth_index> <340 bytes> F7
    // Location: 00 for Synth 1 Current, 01 for Synth 2 Current
    
    let header: number[];
    // Standard Circuit Tracks header is 8 bytes. 
    // Only use 9 bytes if we explicitly detected a 9-byte header from the device or forced it.
    const headerSize = this.forceHeaderSize || (this.useNineByteHeader && this.detectedHeaderSize === 9 ? 9 : 8);
    
    if (headerSize === 9) {
      header = [0xF0, 0x00, 0x20, 0x29, 0x01, this.productId, this.deviceId, 0x01, synthIndex];
    } else {
      // DEFAULT: 8-byte header
      header = [0xF0, 0x00, 0x20, 0x29, 0x01, this.productId, 0x01, synthIndex];
    }
      
    const data = NovaSysEx.serialize(patch);
    
    // Some firmware versions expect an extra byte (0x00) before the 340 bytes
    const dataWithExtra = this.useExtraByte ? new Uint8Array([0x00, ...data]) : data;
    const footer = [0xF7];
    
    const fullMsg = new Uint8Array(header.length + dataWithExtra.length + footer.length);
    fullMsg.set(header, 0);
    fullMsg.set(dataWithExtra, header.length);
    fullMsg.set(footer, header.length + dataWithExtra.length);

    const hexHeader = Array.from(header).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`%cMIDI SEND: Sending Patch to Synth ${synthIndex + 1} %c(Header: ${hexHeader}, Total: ${fullMsg.length} bytes)`, "color: #f59e0b; font-weight: bold", "color: #fbbf24");
    this.output.send(fullMsg);
    return fullMsg.length;
  }

  // Hardware Note Preview
  playNoteOnHardware(note: number, synthIndex: number = 0) {
    if (!this.output) return;
    const channel = synthIndex; // Synth 1 = Ch 1 (0x90), Synth 2 = Ch 2 (0x91)
    const noteOn = 0x90 + channel;
    const noteOff = 0x80 + channel;
    
    this.output.send([noteOn, note, 100]); // Note On
    setTimeout(() => {
      if (this.output) this.output.send([noteOff, note, 0]); // Note Off
    }, 500);
  }

  playDrumOnHardware(drumIndex: number) {
    if (!this.output) return;
    // Drum notes for Circuit Tracks: 60, 62, 64, 65 on Channel 10
    const drumNotes = [60, 62, 64, 65];
    const note = drumNotes[drumIndex] || 60;
    const noteOn = 0x99; // Channel 10 Note On
    const noteOff = 0x89; // Channel 10 Note Off
    
    this.output.send([noteOn, note, 100]);
    setTimeout(() => {
      if (this.output) this.output.send([noteOff, note, 0]);
    }, 200);
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

  onPatchReceived(callback: (patch: PatchData) => void) {
    this.patchCallbacks.push(callback);
    return () => {
      this.patchCallbacks = this.patchCallbacks.filter(cb => cb !== callback);
    };
  }

  onSysExReceived(callback: (data: Uint8Array) => void) {
    this.sysExCallbacks.push(callback);
    return () => {
      this.sysExCallbacks = this.sysExCallbacks.filter(cb => cb !== callback);
    };
  }

  onMidiError(callback: (msg: string) => void) {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter(cb => cb !== callback);
    };
  }
}

export const midiService = new MidiService();
