import { NovaSysEx } from "../lib/novaSysEx";
import { PatchData } from "../types";

export class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;
  private patchCallbacks: ((patch: PatchData) => void)[] = [];
  private sysExCallbacks: ((data: Uint8Array) => void)[] = [];
  private errorCallbacks: ((msg: string) => void)[] = [];
  private productId: number = 0x64; // Default to Circuit Tracks
  private deviceId: number = 0x00;
  private detectedHeaderSize: number = 8;
  private useNineByteHeader: boolean = false;
  private lastSentPatch: PatchData | null = null;
  private lastSentRaw: number[] | null = null;
  private lastReceivedRaw: number[] | null = null;
  private lastReceivedName: string | null = null;
  private lastAlignmentInfo: { header: number; matches: number } | null = null;

  private retryCount: number = 0;
  private maxRetries: number = 2;
  private verificationSynthIndex: number = 0;
  private hasReceivedAnyMidi: boolean = false;

  private logMidiError(context: string, error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.group(`%cMIDI ERROR: ${context}`, "color: #ef4444; font-weight: bold");
    console.error("Message:", errorMsg);
    
    console.log("Port State:");
    console.log(`  Input:  ${this.input?.name || "None"} (${this.input?.state || "N/A"})`);
    console.log(`  Output: ${this.output?.name || "None"} (${this.output?.state || "N/A"})`);
    
    if (this.lastSentRaw) {
      const hex = this.lastSentRaw.length > 64 
        ? this.lastSentRaw.slice(0, 64).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ') + " ..."
        : this.lastSentRaw.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      console.log(`Last Sent SysEx: ${hex}`);
    }

    if (this.lastReceivedRaw) {
      const hex = this.lastReceivedRaw.length > 64
        ? this.lastReceivedRaw.slice(0, 64).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ') + " ..."
        : this.lastReceivedRaw.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      console.log(`Last Received SysEx: ${hex}`);
    }

    if (this.lastReceivedName) {
      console.log(`Last Received Patch Name: "${this.lastReceivedName}"`);
    }

    if (this.lastAlignmentInfo) {
      console.log(`Last Alignment: Header=${this.lastAlignmentInfo.header}, Matches=${this.lastAlignmentInfo.matches}`);
    }
    
    if (this.midiAccess) {
      console.log("Available Outputs:", Array.from(this.midiAccess.outputs.values()).map(o => o.name));
      console.log("Available Inputs:", Array.from(this.midiAccess.inputs.values()).map(i => i.name));
    }
    console.groupEnd();
    
    this.errorCallbacks.forEach(cb => cb(`${context}: ${errorMsg}`));
  }

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
      this.logMidiError("Access Denied or Failed", e);
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

    if (bestOutput) {
      this.setOutput(bestOutput.id);
      // Immediately request identity to confirm model/deviceId
      setTimeout(() => this.sendIdentityRequest(), 500);
    }
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
      const data: Uint8Array = event.data;
      if (!data || data[0] >= 0xF8) return; // Ignore Real-Time messages (Clock, Start, Stop, etc.)

      if (!this.hasReceivedAnyMidi) {
        this.hasReceivedAnyMidi = true;
        console.log("%cMIDI: First message received from hardware!", "color: #10b981; font-weight: bold");
      }
      if (data[0] === 0xF0) {
        this.handleSysEx(data);
      } else {
        // Log non-sysex for debugging
        const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`%cMIDI RECV (Short): %c${hex}`, "color: #9ca3af", "color: #d1d5db");
      }
    };
    }
  }

  private handleSysEx(data: Uint8Array) {
    this.lastReceivedRaw = Array.from(data);
    const hexData = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`%cMIDI RECV (Raw ${data.length} bytes): %c${hexData}`, "color: #9ca3af", "color: #d1d5db");
    
    // Notify SysEx monitors
    this.sysExCallbacks.forEach(cb => cb(data));

    const isNovation = data[0] === 0xF0 && data[1] === 0x00 && data[2] === 0x20 && data[3] === 0x29;
    const isCircuit = isNovation && data[4] === 0x01 && (data[5] === 0x64 || data[5] === 0x60);

    // Identity Reply: F0 7E <dev_id> 06 02 <manuf> <fam_L> <fam_H> <mod_L> <mod_H> ... F7
    if (data[0] === 0xF0 && data[1] === 0x7E && data[3] === 0x06 && data[4] === 0x02) {
      const manuf = data[5];
      const family = data[6] | (data[7] << 8);
      const model = data[8] | (data[9] << 8);
      this.deviceId = data[2];
      console.log(`%cMIDI: Identity Reply - Manuf: 0x${manuf.toString(16)}, Family: 0x${family.toString(16)}, Model: 0x${model.toString(16)}, DeviceID: 0x${this.deviceId.toString(16)}`, "color: #10b981; font-weight: bold");
      
      // If we got an identity reply, we know the device is listening
      this.hasReceivedAnyMidi = true;
      
      if (model === 0x64 || family === 0x64) {
        this.productId = 0x64;
        console.log("%cMIDI: Confirmed Circuit Tracks", "color: #10b981");
      } else if (model === 0x60 || family === 0x60) {
        this.productId = 0x60;
        console.log("%cMIDI: Confirmed Original Circuit", "color: #10b981");
      }
      return;
    }

    if (isNovation) {
      const prodId = data[5];
      // If header is 9 bytes, cmd is at index 7. If 8 bytes, cmd is at index 6.
      const isNineByte = data.length >= 9 && data[6] === 0x00;
      const cmd = isNineByte ? data[7] : data[6];
      const loc = isNineByte ? data[8] : data[7];
      
      console.log(`%cMIDI RECV (Novation 0x${prodId.toString(16).toUpperCase()} CMD:0x${cmd.toString(16).toUpperCase()} LOC:0x${loc.toString(16).toUpperCase()}): %c${hexData.slice(0, 100)}...`, "color: #10b981; font-weight: bold", "color: #6ee7b7");
    } else {
      console.log(`%cMIDI RECV (Other): %c${hexData.slice(0, 100)}...`, "color: #6b7280; font-weight: bold", "color: #9ca3af");
    }

    // Patch dump response usually starts with F0 00 20 29 01 64 01 <loc> ...
    // or F0 00 20 29 01 64 40 <loc> ... depending on the request
    if (isCircuit && data.length >= 348) {
      const totalLength = data.length;
      console.log(`%cMIDI: Valid Patch Dump detected (${totalLength} bytes), analyzing alignment...`, "color: #3b82f6; font-weight: bold");
      
      // 1. Find the Novation Header Signature (00 20 29)
      let sigIndex = -1;
      for (let i = 0; i < data.length - 4; i++) {
        if (data[i] === 0x00 && data[i+1] === 0x20 && data[i+2] === 0x29) {
          sigIndex = i;
          break;
        }
      }

      // Initial guess based on signature or length
      // For Circuit Tracks, the header is usually 8 or 9 bytes
      let headerSize = (isCircuit && sigIndex === 1) ? 8 : (sigIndex !== -1 ? sigIndex + 7 : totalLength - 341);
      if (isCircuit && sigIndex === 1 && data[6] === 0x00) {
        headerSize = 9; // Found Device ID byte (F0 00 20 29 01 64 00 ...)
      }
      
      // 2. Brute-force alignment check if we have a reference patch
      if (this.lastSentPatch) {
        const sentData = NovaSysEx.serialize(this.lastSentPatch);
        const mappedOffsets = NovaSysEx.getMappedOffsets();
        let bestSize = headerSize;
        let bestScore = -1;
        let bestMatches = 0;

        // Check a wide range around our signature (Sig+4 to Sig+20)
        // Novation headers can be quite long depending on the message type
        const startSearch = sigIndex !== -1 ? sigIndex + 4 : 5;
        const endSearch = sigIndex !== -1 ? sigIndex + 20 : 32;

        for (let testSize = startSearch; testSize <= endSearch; testSize++) {
          if (testSize + 340 > data.length) break;
          
          let score = 0;
          let matches = 0;
          const testSlice = data.slice(testSize, testSize + 340);
          
          // Weighted scoring:
          // 1. Check for Name Match (Huge bonus)
          const sentName = this.lastSentPatch.name.trim().toLowerCase();
          if (sentName.length > 2) {
            // Circuit Tracks Name is at offset 1-16
            const recvNameBytes = testSlice.slice(1, 17);
            const recvName = Array.from(recvNameBytes).map(b => b > 31 && b < 127 ? String.fromCharCode(b) : ".").join("").trim().toLowerCase();
            if (recvName.includes(sentName) || sentName.includes(recvName)) {
              score += 5000; // Even higher priority for name match
            }
          }

          // 2. Check parameter matches
          for (const i of mappedOffsets) {
            if (sentData[i] === testSlice[i]) {
              matches++;
              // Bonus for non-zero matches (avoids being fooled by empty patches)
              score += (sentData[i] !== 0) ? 20 : 2;
            } else {
              // Penalty for mismatch on non-zero values
              if (sentData[i] !== 0) score -= 5;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatches = matches;
            bestSize = testSize;
          }
        }

        if (bestMatches > (mappedOffsets.length * 0.05)) { // Lowered threshold slightly but rely on score
          console.log(`%cMIDI: Alignment Verified - Header Size: ${bestSize} (${bestMatches}/${mappedOffsets.length} params match, Score: ${bestScore})`, "color: #10b981; font-weight: bold");
          headerSize = bestSize;
          this.detectedHeaderSize = headerSize;
        } else {
          console.warn(`%cMIDI: Poor alignment match (${bestMatches}/${mappedOffsets.length}). Using guess: ${headerSize}`, "color: #ef4444");
        }
      }

      // 3. Extract metadata from the confirmed header
      // Header is usually: F0 00 20 29 01 <prod> [<dev>] <cmd> <loc>
      let cmd = data[headerSize - 2];
      let loc = data[headerSize - 1];
      
      // If it looks like a 7-byte header (no loc), adjust
      if (headerSize === 7) {
        cmd = data[6];
        loc = 0;
      }
      
      if (cmd === 0x04) {
        const errorMsg = `Hardware Error (NACK): 0x${(loc ?? 0).toString(16).toUpperCase()}`;
        console.error(`%cMIDI: ${errorMsg}`, "color: #ef4444; font-weight: bold");
        this.lastSentPatch = null; // Clear to prevent timeout masking the error
        this.errorCallbacks.forEach(cb => cb(errorMsg));
        return;
      }

      console.log(`%cMIDI: Confirmed Header - Size: ${headerSize}, CMD: 0x${(cmd ?? 0).toString(16).toUpperCase()}, LOC: 0x${(loc ?? 0).toString(16).toUpperCase()}`, "color: #9333ea");

      const patchData = data.slice(headerSize, headerSize + 340);
      try {
        const patch = NovaSysEx.deserialize(patchData);
        
        // Extract name for logging
        this.lastReceivedName = Array.from(patchData.slice(1, 17)).map(b => b > 31 && b < 127 ? String.fromCharCode(b) : ".").join("").trim();

        // Verification logic
        if (this.lastSentPatch) {
          const sentData = NovaSysEx.serialize(this.lastSentPatch);
          const mappedOffsets = NovaSysEx.getMappedOffsets();
          let matches = true;
          let diffCount = 0;
          const firstDiffs: string[] = [];
          
          const report = {
            osc: { matches: 0, total: 0 },
            mixer: { matches: 0, total: 0 },
            filter: { matches: 0, total: 0 },
            env: { matches: 0, total: 0 },
            lfo: { matches: 0, total: 0 },
            fx: { matches: 0, total: 0 },
            mod: { matches: 0, total: 0 },
            name: { matches: 0, total: 0 }
          };

          for (const i of mappedOffsets) {
            const isMatch = sentData[i] === patchData[i];
            
            // Categorize for report
            if (i < 32) report.osc.total++, isMatch && report.osc.matches++;
            else if (i < 48) report.osc.total++, isMatch && report.osc.matches++; // Sub/Noise
            else if (i < 64) report.mixer.total++, isMatch && report.mixer.matches++;
            else if (i < 80) report.filter.total++, isMatch && report.filter.matches++;
            else if (i < 128) report.env.total++, isMatch && report.env.matches++;
            else if (i < 160) report.lfo.total++, isMatch && report.lfo.matches++;
            else if (i < 192) report.fx.total++, isMatch && report.fx.matches++;
            else if (i < 252) report.mod.total++, isMatch && report.mod.matches++;
            else if (i >= 324) report.name.total++, isMatch && report.name.matches++;

            if (!isMatch) {
              matches = false;
              diffCount++;
              if (firstDiffs.length < 10) {
                // Try to find a name for this offset
                let paramName = `Offset ${i}`;
                if (i < 16) paramName = `Osc1[${i}]`;
                else if (i < 32) paramName = `Osc2[${i-16}]`;
                else if (i < 48) paramName = `Sub/Noise[${i-32}]`;
                else if (i < 64) paramName = `Mixer[${i-48}]`;
                else if (i < 80) paramName = `Filter[${i-64}]`;
                else if (i < 96) paramName = `Env1[${i-80}]`;
                else if (i < 112) paramName = `Env2[${i-96}]`;
                else if (i < 128) paramName = `Env3[${i-112}]`;
                else if (i < 144) paramName = `LFO1[${i-128}]`;
                else if (i < 160) paramName = `LFO2[${i-144}]`;
                else if (i < 176) paramName = `Dist[${i-160}]`;
                else if (i < 192) paramName = `Chorus[${i-176}]`;
                else if (i < 252) paramName = `ModMatrix[${i-192}]`;
                else if (i >= 324) paramName = `Name[${i-324}]`;
                
                const sVal = sentData[i];
                const rVal = patchData[i];
                const sHex = sVal !== undefined ? sVal.toString(16) : "??";
                const rHex = rVal !== undefined ? rVal.toString(16) : "??";
                
                firstDiffs.push(`${paramName}: Sent 0x${sHex}, Recv 0x${rHex}`);
              }
            }
          }

          if (matches) {
            console.log("%cMIDI VERIFY: SUCCESS! All mapped parameters match hardware.", "color: #10b981; font-weight: bold");
            this.retryCount = 0;
          } else {
            const matchPercent = Math.round(( (mappedOffsets.length - diffCount) / mappedOffsets.length) * 100);
            // Circuit Tracks Name is at offset 1-16
            const recvName = Array.from(patchData.slice(1, 17)).map(b => b > 31 && b < 127 ? String.fromCharCode(b) : ".").join("");
            
            const sentName = this.lastSentPatch.name;
            const nameMatch = recvName.toLowerCase().includes(sentName.toLowerCase()) || sentName.toLowerCase().includes(recvName.toLowerCase().replace(/\./g, "").trim());

            // Post-failure brute force to find the REAL header size
            let absoluteBestMatches = 0;
            let absoluteBestHeader = -1;
            const sentDataForBrute = NovaSysEx.serialize(this.lastSentPatch);
            
            for (let h = 0; h < Math.min(100, data.length - 340); h++) {
              let m = 0;
              const slice = data.slice(h, h + 340);
              for (const off of mappedOffsets) {
                if (sentDataForBrute[off] === slice[off]) m++;
              }
              if (m > absoluteBestMatches) {
                absoluteBestMatches = m;
                absoluteBestHeader = h;
              }
            }

            this.lastAlignmentInfo = { header: absoluteBestHeader, matches: absoluteBestMatches };

            // AI DEBUG PAYLOAD: This is for the "Fix" button turn
            const debugPayload = {
              headerSize,
              diffCount,
              matchPercent,
              absoluteBestHeader,
              absoluteBestMatches,
              sections: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, `${v.matches}/${v.total}`])),
              firstDiffs: firstDiffs.slice(0, 15),
              nameCheck: {
                sent: sentName,
                recv: recvName,
                match: nameMatch
              },
              rawSamples: {
                sent: Array.from(sentData.slice(0, 128)).map(b => b.toString(16).padStart(2, "0")).join(" "),
                recv: Array.from(patchData.slice(0, 128)).map(b => b.toString(16).padStart(2, "0")).join(" ")
              }
            };

            // Create a visual Diff Map for the 340-byte block
            const diffMap = Array.from({ length: 340 }, (_, i) => {
              if (!mappedOffsets.includes(i)) return " ";
              return sentData[i] === patchData[i] ? "." : "X";
            }).join("");

            const logMsg = `MIDI VERIFY: FAILED! ${diffCount}/${mappedOffsets.length} mapped parameters differ (${matchPercent}% match).`;
            this.logMidiError("Verification Failed", new Error(logMsg));
            
            // This is for the AI to see directly in the error report
            console.error("AI_DEBUG_PAYLOAD_JSON:" + JSON.stringify(debugPayload));
            
            if (!nameMatch) {
              console.error(`%c  CRITICAL: Patch Name Mismatch! Sent: "${sentName}", Received: "${recvName}"`, "color: #ef4444; font-weight: bold");
              console.warn("  This usually means the hardware didn't update the current patch buffer yet, or we requested the wrong synth track.");
            }
            console.log(`%cDIFF MAP: %c${diffMap}`, "color: #6366f1; font-weight: bold", "font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 2px 4px; border-radius: 2px;");
            console.log("%c( . = match, X = diff, space = unmapped )", "color: #9ca3af; font-size: 10px");

            if (absoluteBestHeader !== -1 && absoluteBestHeader !== headerSize) {
              console.log(`%c  CRITICAL DEBUG: Brute force found a better match at headerSize: ${absoluteBestHeader} (${absoluteBestMatches}/${mappedOffsets.length} matches)`, "color: #f59e0b; font-weight: bold");
            }

            // Search for where our "0x40" (64) values went
            const sent40s = mappedOffsets.filter(off => sentData[off] === 0x40);
            if (sent40s.length > 0) {
              const found40s = Array.from(patchData).map((b, i) => b === 0x40 ? i : -1).filter(i => i !== -1);
              console.log(`%c  DEBUG: Sent 0x40 at ${sent40s.length} offsets. Received 0x40 at ${found40s.length} offsets: ${found40s.slice(0, 10).join(", ")}...`, "color: #6366f1");
            }

            console.log("%cAI_DEBUG_CONTEXT:", "color: #6366f1; font-weight: bold", JSON.stringify(debugPayload, null, 2));
            
            // Retry logic
            if (this.retryCount < this.maxRetries) {
              this.retryCount++;
              console.log(`%cMIDI VERIFY: Retrying request (${this.retryCount}/${this.maxRetries}) in 1s...`, "color: #f59e0b; font-weight: bold");
              setTimeout(() => {
                // We need to restore lastSentPatch because it was set to null just before this
                this.lastSentPatch = this.lastSentPatch || NovaSysEx.deserialize(sentData); 
                this.requestPatchDump(this.verificationSynthIndex);
              }, 1000);
              return; // Don't reset lastSentPatch yet
            } else {
              this.retryCount = 0;
            }

            // Search for the name anywhere in the received data to detect major shifts
            const sentNameBytes = Array.from(new TextEncoder().encode(this.lastSentPatch.name.trim()));
            if (sentNameBytes.length > 2) {
              let foundAt = -1;
              for (let i = 0; i < patchData.length - sentNameBytes.length; i++) {
                let match = true;
                for (let j = 0; j < sentNameBytes.length; j++) {
                  if (patchData[i+j] !== sentNameBytes[j]) { match = false; break; }
                }
                if (match) { foundAt = i; break; }
              }
              if (foundAt !== -1) {
                console.log(`%c  DEBUG: Sent name found at offset ${foundAt} (Expected 1)`, "color: #f59e0b; font-weight: bold");
              } else {
                console.log(`%c  DEBUG: Sent name NOT found anywhere in the 340-byte block.`, "color: #ef4444");
              }
            }
            
            console.log("%cVERIFICATION REPORT:", "color: #3b82f6; font-weight: bold");
            // Log the name we actually got
            console.log(`%c  NAME RECEIVED : "${recvName}"`, "color: #9333ea; font-weight: bold");

            Object.entries(report).forEach(([key, val]) => {
              const color = val.matches === val.total ? "#10b981" : (val.matches > 0 ? "#f59e0b" : "#ef4444");
              const p = Math.round((val.matches / (val.total || 1)) * 100);
              console.log(`%c  ${key.toUpperCase().padEnd(10)}: ${val.matches}/${val.total} matches (${p}%)`, `color: ${color}`);
            });
            
            console.log("%cTOP 10 DIFFERENCES:", "color: #f43f5e; font-weight: bold");
            firstDiffs.forEach(d => console.warn(`%c  -> ${d}`, "color: #f43f5e"));
            
            // Log raw samples for manual inspection
            const recvSample = Array.from(patchData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const sentSample = Array.from(sentData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log(`%cRECV (START): %c${recvSample}`, "color: #6b7280", "color: #9ca3af");
            console.log(`%cSENT (START): %c${sentSample}`, "color: #6b7280", "color: #9ca3af");
          }
          this.lastSentPatch = null; // Reset after check
        }

        this.patchCallbacks.forEach(cb => cb(patch));
      } catch (e) {
        this.logMidiError("Deserialization failed", e);
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
    const hex = data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`%cMIDI SEND (Raw): %c${hex}`, "color: #f59e0b; font-weight: bold", "color: #fbbf24");
    this.output.send(data);
  }

  sendIdentityRequest() {
    if (!this.output) return;
    const msg = [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7];
    console.log("%cMIDI SEND: Identity Request", "color: #f59e0b; font-weight: bold");
    this.output.send(msg);
  }

  // Novation Circuit Tracks Patch Dump Request
  requestPatchDump(synthIndex: number = 0): number {
    if (!this.output) {
      console.error("MIDI: Fetch failed - Output not found");
      return 0;
    }
    // Reverting to 8-byte header and trying command 0x40 (Request Patch) with location 0x00
    // This format is most likely to give a response based on previous logs
    const msg = [0xF0, 0x00, 0x20, 0x29, 0x01, this.productId, 0x40, synthIndex, 0xF7];
    
    const hexMsg = msg.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`%cMIDI SEND: Requesting CURRENT Patch Dump for Synth ${synthIndex + 1} %c(Using ProdID: 0x${this.productId.toString(16).toUpperCase()}, HEX: ${hexMsg})`, "color: #f59e0b; font-weight: bold", "color: #fbbf24");
    this.lastSentRaw = msg;
    try {
      this.output.send(msg);
    } catch (e) {
      this.logMidiError("Send failed (Request Dump)", e);
    }
    return msg.length;
  }

  sendPatch(patch: PatchData, synthIndex: number = 0): number {
    if (!this.output) {
      console.error("MIDI: Send failed - Output not found");
      return 0;
    }
    
    // Circuit Tracks "Replace Current Patch" SysEx (Command 0x01)
    // Reverting to 8-byte header and location 0x00
    const header = [0xF0, 0x00, 0x20, 0x29, 0x01, this.productId, 0x01, synthIndex];
      
    const data = NovaSysEx.serialize(patch);
    const footer = [0xF7];
    
    const fullMsg = new Uint8Array(header.length + data.length + footer.length);
    fullMsg.set(header, 0);
    fullMsg.set(data, header.length);
    fullMsg.set(footer, header.length + data.length);

    const hexMsg = Array.from(fullMsg.slice(0, 20)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`%cMIDI SEND: Sending Patch to Synth ${synthIndex + 1} (${fullMsg.length} bytes) %c(HEX START: ${hexMsg} ...)`, "color: #f59e0b; font-weight: bold", "color: #fbbf24");
    this.lastSentRaw = Array.from(fullMsg);
    try {
      this.output.send(Array.from(fullMsg));
    } catch (e) {
      this.logMidiError("Send failed (Patch)", e);
    }
    this.lastSentPatch = patch;
    return fullMsg.length;
  }

  async sendAndVerify(patch: PatchData, synthIndex: number = 0): Promise<boolean> {
    console.log("%cMIDI VERIFY: Starting Send + Verify sequence...", "color: #8b5cf6; font-weight: bold");
    this.retryCount = 0;
    this.verificationSynthIndex = synthIndex;
    this.lastAlignmentInfo = null; // Reset for new attempt
    
    // 1. Send the patch
    this.sendPatch(patch, synthIndex);
    
    // 2. Wait for the device to process (Circuit can be slow)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Request the patch back
    console.log("%cMIDI VERIFY: Requesting patch back for comparison...", "color: #8b5cf6");
    this.requestPatchDump(synthIndex);

    // 4. Set a safety timeout for the response
    setTimeout(() => {
      if (this.lastSentPatch === patch) {
        this.logMidiError("Verification Timeout", new Error("Hardware did not respond to patch dump request within 5s."));
        this.lastSentPatch = null;
      }
    }, 5000);
    
    return true; // Verification happens in the callback
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

  sendCustomSysEx(data: number[]) {
    if (!this.output) {
      console.error("MIDI: Send failed - Output not found");
      return;
    }
    // Ensure it starts and ends with SysEx markers if not provided
    let msg = [...data];
    if (msg[0] !== 0xF0) msg.unshift(0xF0);
    if (msg[msg.length - 1] !== 0xF7) msg.push(0xF7);

    const hex = msg.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`%cMIDI SEND (Custom SysEx): %c${hex}`, "color: #f59e0b; font-weight: bold", "color: #fbbf24");
    this.lastSentRaw = msg;
    try {
      this.output.send(msg);
    } catch (e) {
      this.logMidiError("Send failed (Custom SysEx)", e);
    }
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
