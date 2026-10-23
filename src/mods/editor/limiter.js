import { StereoLimiter } from '../../../audio/dsp.js';
class EditorLimiter extends AudioWorkletProcessor {
  constructor(){super();this.limiter=new StereoLimiter(sampleRate);this.value=new Float32Array(2);this.count=0;this.peak=0;}
  process(inputs,outputs){const input=inputs[0]||[],output=outputs[0];for(let i=0;i<output[0].length;i++){this.limiter.process(input[0]?.[i]||0,input[1]?.[i]??input[0]?.[i]??0,this.value);output[0][i]=this.value[0];output[1][i]=this.value[1];this.peak=Math.max(this.peak,Math.abs(this.value[0]),Math.abs(this.value[1]));}this.count+=output[0].length;if(this.count>=sampleRate/15){this.port.postMessage({peak:this.peak});this.count=0;this.peak=0;}return true;}
}
registerProcessor('latitude-editor-limiter',EditorLimiter);
