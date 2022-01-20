(() => {
  // src/index.js
  var loadFile = (ctx2, file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => ctx2.decodeAudioData(e.target.result, resolve);
    reader.readAsArrayBuffer(file);
  });
  var Node = class extends AudioBufferSourceNode {
    constructor(ctx2, options) {
      super(ctx2, {
        buffer: options.buffer,
        loop: options.loop
      });
      this.splitter = new ChannelSplitterNode(ctx2, {
        numberOfOutputs: 2
      });
      this.panner = new PannerNode(ctx2, {
        panningModel: "HRTF"
      });
      this.connect(this.splitter);
      this.splitter.connect(this.panner, 0);
      this.splitter.connect(this.panner, 1);
      this.connect = (node) => this.panner.connect(node);
      this.disconnect = (node) => this.panner.disconnect(node);
    }
  };
  var ctx;
  var destination;
  function initialize() {
    ctx = new AudioContext();
    destination = new MediaStreamAudioDestinationNode(ctx);
    const audio = document.getElementById("audio");
    audio.srcObject = destination.stream;
    audio.play();
  }
  var src;
  document.getElementById("file").addEventListener("change", async (e) => {
    if (!ctx)
      initialize();
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
})();
//# sourceMappingURL=main.js.map
