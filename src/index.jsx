import * as THREE from "three";
import * as Recorder from "extendable-media-recorder";
import * as WavEncoder from "extendable-media-recorder-wav-encoder";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DragControls } from "three/examples/jsm/controls/DragControls.js";
import { initDraggable } from "./DraggableMesh.js";
import { loadAudioFile, downloadBlob } from "./utils.js";
import * as Preact from "preact";
import { useState } from "preact/hooks";

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("render"),
  antialias: true,
  alpha: true,
});
renderer.setSize(640, 640);
renderer.setPixelRatio(devicePixelRatio);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.physicallyCorrectLights = true;

const camera = new THREE.PerspectiveCamera(45, 640 / 640);
camera.position.set(0, 15, 0);
camera.lookAt(0, 0, 0);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 0, 0);

const scene = new THREE.Scene();
scene.add(new THREE.PolarGridHelper(50, 32, 25));
scene.add(new THREE.AxesHelper(100));

const ambLight = new THREE.AmbientLight(0xFFFFFF, 1.0);
scene.add(ambLight);

const light = new THREE.DirectionalLight(0xFFFFFF, 2.0);
light.position.set(0, 5, 0);
light.castShadow = true;
light.shadow.mapSize.set(4096, 4096);
light.shadow.camera.left = -10;
light.shadow.camera.right = 10;
light.shadow.camera.bottom = -10;
light.shadow.camera.top = 10;
scene.add(light);

const { DraggableMesh } = initDraggable(renderer, camera, [orbitControls]);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshLambertMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    emissive: "#333333",
  }),
);
floor.position.set(0, -5, 0);
floor.rotation.set(- Math.PI / 2, 0, 0);
floor.receiveShadow = true;
scene.add(floor);

const listener = new THREE.Mesh(
  new THREE.ConeGeometry(0.5, 1, 32),
  new THREE.MeshStandardMaterial({ color: "#ff8888" }),
);
listener.position.set(0, 0, 0);
listener.rotation.set(- Math.PI / 2, 0, 0);
listener.castShadow = true;
listener.receiveShadow = true;
scene.add(listener);

class Player extends DraggableMesh {
  constructor (ctx, options) {
    super(
      new THREE.SphereGeometry(0.5),
      new THREE.MeshStandardMaterial({ color: "#88ff88" }),
    );
    this.buffer = options.buffer;
    this.splitter = new ChannelSplitterNode(ctx, {
      numberOfOutputs: 2,
    });
    this.gainL = new GainNode(ctx, {
      gain: 0.5,
    });
    this.gainR = new GainNode(ctx, {
      gain: 0.5,
    });
    this.panner = new PannerNode(ctx, {
      panningModel: "HRTF",
    });
    this.splitter.connect(this.gainL, 0).connect(this.panner);
    this.splitter.connect(this.gainR, 1).connect(this.panner);
    this.previewSource = null;
  }
  onDragStart () {
    this.material.emissive.set(0x333333);
    this.previewSource = new AudioBufferSourceNode(ctx, { buffer: this.buffer, loop: true });
    this.previewSource.connect(this.splitter);
    this.previewSource.start();
  }
  onDragEnd () {
    this.material.emissive.set(0x000000);
    this.previewSource.stop();
    this.previewSource = null;
  }
  onDrag (position) {
    this.position.copy(position);
    this.panner.positionX.value = position.x;
    this.panner.positionY.value = position.y;
    this.panner.positionZ.value = position.z;
  }
  setBalance (value /* 0 ~ 1 */) {
    this.gainL.gain.value = (1 - value);
    this.gainR.gain.value = value;
  }
  start () {
    return new Promise((resolve) => {
      const audioSource = new AudioBufferSourceNode(ctx, { buffer: this.buffer });
      audioSource.connect(this.splitter);
      audioSource.onended = () => {
        this.material.color.set("#88ff88");
        resolve();
      };
      audioSource.start();
      this.material.color.set("#ffff44");
    });
  }
  connect (node) {
    this.panner.connect(node);
  }
  disconnect (node) {
    this.panner.disconnect(node);
  }
}

function update () {
  requestAnimationFrame(update);
  orbitControls.update();
  renderer.render(scene, camera);
};
update();

/* ----------------------------------------- */

let ctx;
let destination;
let stream;
let players = [];
let recorder;

async function initialize () {
  await Recorder.register(await WavEncoder.connect());
  ctx = new AudioContext();
  destination = new MediaStreamAudioDestinationNode(ctx);
  const audio = document.createElement("audio");
  document.body.appendChild(audio);
  stream = destination.stream;
  audio.srcObject = stream;
  audio.play();
}

async function addAudio (file) {
  if (!ctx) await initialize();
  const player = new Player(ctx, { buffer: await loadAudioFile(ctx, file), loop: false });
  player.castShadow = true;
  player.receiveShadow = true;
  scene.add(player);
  player.connect(destination);
  players.push(player);
}

function start () {
  return Promise.all(players.map((p) => p.start()));
}

async function startRecording () {
  recorder = new Recorder.MediaRecorder(stream, { mimeType: "audio/wav" });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) {
      chunks.push(e.data);
      downloadBlob(new Blob(chunks, { type: "audio/wav" }));
    }
  };
  recorder.start();
}

const App = () => {
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);

  const play = async () => {
    setPlaying(true);
    await start();
    setPlaying(false);
  };

  const record = async () => {
    setRecording(true);
    startRecording();
    await start();
    recorder.stop();
    setRecording(false);
  };

  const add = (e) => {
    addAudio(e.target.files[0]);
    e.target.value = null;
  };

  return (
    <>
      <div>
        音を追加: <input type="file" disabled={ playing || recording } onChange={ add } />
      </div>
      <div>
        <button disabled={ playing || recording } onClick={ play }>再生</button>
        <button disabled={ playing || recording } onClick={ record }>録音</button>
      </div>
    </>
  );
};

Preact.render(<App />, document.getElementById("preact-container"));
