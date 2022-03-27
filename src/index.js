import * as THREE from "three";
import * as Recorder from "extendable-media-recorder";
import * as WavEncoder from "extendable-media-recorder-wav-encoder";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DragControls } from "three/examples/jsm/controls/DragControls.js";

const width = 960;
const height = 640;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setSize(width, height);
renderer.setPixelRatio(devicePixelRatio);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
camera.position.set(0, 30, 0);
camera.lookAt(0, 0, 0);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 0, 0);

const scene = new THREE.Scene();
scene.add(new THREE.PolarGridHelper(50, 32, 50));
scene.add(new THREE.AxesHelper(100));

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 30, 0);
scene.add(light);

const listener = new THREE.Mesh(
  new THREE.ConeGeometry(0.5, 1, 32),
  new THREE.MeshStandardMaterial({ color: "#ff8888" }),
);
listener.position.set(0, 0, 0);
listener.rotation.set(- Math.PI / 2, 0, 0);
scene.add(listener);

class Player extends THREE.Mesh {
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
  }
  setBalance (value /* 0 ~ 1 */) {
    this.gainL.gain.value = (1 - value);
    this.gainR.gain.value = value;
  }
  start () {
    return new Promise((resolve) => {
      const audioSource = new AudioBufferSourceNode(ctx, { buffer: this.buffer });
      audioSource.connect(this.splitter);
      audioSource.onended = resolve;
      audioSource.start();
    });
  }
  connect (node) {
    this.panner.connect(node);
  }
  disconnect (node) {
    this.panner.disconnect(node);
  }
  updateAudio () {
    this.panner.positionX.value = this.position.x;
    this.panner.positionY.value = this.position.y;
    this.panner.positionZ.value = this.position.z;
  }
}

/**
 * Drag & Drop Mesh
 * - https://irukanobox.blogspot.com/2016/11/threejs3d.html
 * - https://threejs.org/docs/#api/en/core/Raycaster
 */

let draggableObjects = [];
const plane = new THREE.Plane();
const raycaster = new THREE.Raycaster();
let draggedObject = null;

const mouse = new THREE.Vector2();
const updateRaycaster = (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = - ((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
};

const intersection = new THREE.Vector3();
renderer.domElement.addEventListener('mousemove', (e) => {
  e.preventDefault();
  if (draggedObject) {
    updateRaycaster(e);
    raycaster.ray.intersectPlane(plane, intersection);
    draggedObject.position.copy(intersection);
    draggedObject.updateAudio && draggedObject.updateAudio();
  }
}, false);

renderer.domElement.addEventListener('mousedown', (e) => {
  e.preventDefault();
  updateRaycaster(e);
  const intersects = raycaster.intersectObjects(draggableObjects);
  if (intersects.length > 0) {
    orbitControls.enabled = false;
    draggedObject = intersects[0].object;
    draggedObject.material.emissive.set(0x333333);
    camera.getWorldDirection(plane.normal);
  }
}, false);

renderer.domElement.addEventListener('mouseup', (e) => {
  e.preventDefault();
  orbitControls.enabled = true;
  if (draggedObject) {
    draggedObject.material.emissive.set(0x000000);
    draggedObject = null;
  }
}, false);

function update () {
  requestAnimationFrame(update);
  orbitControls.update();
  renderer.render(scene, camera);
};
update();

/* ----------------------------------------- */

const loadFile = (ctx, file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => ctx.decodeAudioData(e.target.result, resolve);
  reader.readAsArrayBuffer(file);
});

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
  const player = new Player(ctx, { buffer: await loadFile(ctx, file), loop: false });
  scene.add(player);
  draggableObjects.push(player);
  player.connect(destination);
  players.push(player);
}

function start () {
  return Promise.all(players.map((p) => p.start()));
}

async function download (blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.style = "display: none";
  a.href = url;
  a.download = "download.wav";
  a.click();
  window.URL.revokeObjectURL(url);
}

async function record () {
  recorder = new Recorder.MediaRecorder(stream, { mimeType: "audio/wav" });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) {
      chunks.push(e.data);
      download(new Blob(chunks, { type: "audio/wav" }));
    }
  };
  recorder.start();
}

document.getElementById("file").addEventListener("change", (e) => {
  addAudio(e.target.files[0]);
  e.target.value = null;
});

const playButton = document.getElementById("play");
playButton.addEventListener("click", async (e) => {
  playButton.disabled = true;
  recordButton.disabled = true;
  await start();
  playButton.disabled = false;
  recordButton.disabled = false;
});

const recordButton = document.getElementById("record");
recordButton.addEventListener("click", async (e) => {
  playButton.disabled = true;
  recordButton.disabled = true;
  record();
  await start();
  recorder.stop();
  playButton.disabled = false;
  recordButton.disabled = false;
});
