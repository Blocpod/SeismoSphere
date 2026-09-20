class VoiceCapture extends AudioWorkletProcessor {
 process(inputs){const channel=inputs[0]?.[0];if(channel){const copy=new Float32Array(channel);this.port.postMessage(copy,[copy.buffer]);}return true;}
}
// Output buffers remain silent: microphone audio is never played to the speakers.
registerProcessor('seismo-voice-capture',VoiceCapture);
