const loadFile = (ctx, file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => ctx.decodeAudioData(e.target.result, resolve);
  reader.readAsArrayBuffer(file);
});

class Node extends AudioBufferSourceNode {
  constructor (ctx, options) {
    super(ctx, {
      buffer: options.buffer,
      loop: options.loop,
    });
    this.splitter = new ChannelSplitterNode(ctx, {
      numberOfOutputs: 2,
    });
    this.panner = new PannerNode(ctx, {
      panningModel: "HRTF",
    });
    this.connect(this.splitter);
    this.splitter.connect(this.panner, 0);
    this.splitter.connect(this.panner, 1);
    this.connect = (node) => this.panner.connect(node);
    this.disconnect = (node) => this.panner.disconnect(node);
  }
}

let ctx;
let destination;

function initialize () {
  ctx = new AudioContext();
  destination = new MediaStreamAudioDestinationNode(ctx);
  const audio = document.getElementById("audio");
  audio.srcObject = destination.stream;
  audio.play();
}

let src;

document.getElementById("file").addEventListener("change", async (e) => {
  if (!ctx) initialize();
  src = new Node(ctx, { buffer: await loadFile(ctx, e.target.files[0]), loop: true });
  src.connect(destination);
  src.start();
});

document.getElementById("x").addEventListener("input", (e) => {
  src.panner.positionX.value = parseFloat(e.target.value);
  console.log(src.panner.positionX.value);
});

document.getElementById("y").addEventListener("input", (e) => {
  src.panner.positionY.value = parseFloat(e.target.value);
  console.log(src.panner.positionY.value);
});

document.getElementById("z").addEventListener("input", (e) => {
  src.panner.positionZ.value = parseFloat(e.target.value);
  console.log(src.panner.positionZ.value);
});
