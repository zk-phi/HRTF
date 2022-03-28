import * as Preact from "preact";
import { useState, useCallback, useRef, useMemo } from "preact/hooks";
import * as THREE from "three";
import * as Recorder from "extendable-media-recorder";
import * as WavEncoder from "extendable-media-recorder-wav-encoder";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DragControls } from "three/examples/jsm/controls/DragControls.js";
import { initDraggable } from "./DraggableMesh.js";
import { loadAudioFile, downloadBlob } from "./utils.js";

const canvas = document.getElementById("render");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.physicallyCorrectLights = true;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight);
camera.position.set(0, 15, 0);
camera.lookAt(0, 0, 0);

const updateSize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener("resize", updateSize);

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
  new THREE.MeshLambertMaterial({ color: "#ffffff", side: THREE.DoubleSide, emissive: "#333333" }),
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
    if (options.shadow) {
      this.receiveShadow = true;
      this.castShadow = true;
    }
    this.delay = options.delay || 0;
    this.buffer = options.buffer;
    this.name = options.name;
    this.onDragStartUser = options.onDragStart;
    this.onDragEndUser = options.onDragEnd;
    this.onDragUser = options.onDrag;
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
    this.onDragStartUser && this.onDragStartUser(this);
  }
  onDragEnd () {
    this.material.emissive.set(0x000000);
    this.previewSource.stop();
    this.previewSource = null;
    this.onDragEndUser && this.onDragEndUser(this);
  }
  onDrag (position) {
    this.position.copy(position);
    this.panner.positionX.value = position.x;
    this.panner.positionY.value = position.y;
    this.panner.positionZ.value = position.z;
    this.onDragUser && this.onDragUser(this);
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
      setTimeout(() => {
        audioSource.start();
        this.material.color.set("#ffff44");
      }, this.delay);
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

async function initialize () {
  await Recorder.register(await WavEncoder.connect());
  ctx = new AudioContext();
  destination = new MediaStreamAudioDestinationNode(ctx);
  const audio = document.createElement("audio");
  document.body.appendChild(audio);
  audio.srcObject = destination.stream;
  audio.play();
}

async function makePlayer (file, options) {
  if (!ctx) await initialize();
  const player = new Player(ctx, {
    buffer: await loadAudioFile(ctx, file),
    shadow: true,
    name: file.name,
    ...options,
  });
  scene.add(player);
  player.connect(destination);
  return player;
}

function playAll (players) {
  return Promise.all(players.map((p) => p.start()));
}

function startRecording () {
  const recorder = new Recorder.MediaRecorder(destination.stream, { mimeType: "audio/wav" });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) {
      chunks.push(e.data);
      downloadBlob(new Blob(chunks, { type: "audio/wav" }));
    }
  };
  recorder.start();
  return recorder;
}

/* ----------------------------------------- */

const Introduction = ({ onHideIntroduction }) => (
  <div id="dialog">
    <h1>HRTFy</h1>
    <p>効果音やボイスなどの音素材を立体音響化することができます。要イヤホン。</p>
    <p>拾ってきた効果音素材を使う場合、「改変可」の素材を使用するよう注意してください。</p>
    <button onClick={ onHideIntroduction }>遊ぶ</button>
    <p>
      <small>
        Built with ♡ by <a href="https://twitter.com/zk_phi" target="_blank">zk-phi</a>
      </small>
    </p>
  </div>
);

const Controls = () => {
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerValues, setSelectedPlayerValues] = useState({});

  const busy = useMemo(() => playing || recording || loading, [playing, recording, loading]);

  const play = async () => {
    setPlaying(true);
    await playAll(players);
    setPlaying(false);
  };

  const record = async () => {
    setRecording(true);
    const recorder = startRecording();
    await playAll(players);
    recorder.stop();
    setRecording(false);
  };

  const updateSelectedPlayer = useCallback((player) => {
    setSelectedPlayer(player);
    setSelectedPlayerValues(player ? {
      name: player.name,
      delay: player.delay,
      pos: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      },
    } : null);
  }, [setSelectedPlayer, setSelectedPlayerValues]);

  const onChangeDelay = useCallback((e) => {
    if (selectedPlayer) {
      selectedPlayer.delay = e.target.value;
      updateSelectedPlayer(selectedPlayer);
    }
  }, [selectedPlayer, updateSelectedPlayer]);

  const add = async (e) => {
    setLoading(true);
    const player = await makePlayer(e.target.files[0], {
      onDragStart: updateSelectedPlayer,
      onDrag: updateSelectedPlayer,
    });
    setPlayers([...players, player]);
    updateSelectedPlayer(player);
    e.target.value = null;
    setLoading(false);
  };

  const deleteSelectedPlayer = useCallback(() => {
    if (selectedPlayer) {
      selectedPlayer.removeFromParent();
      setPlayers(players.filter((player) => player !== selectedPlayer));
      setSelectedPlayer(null);
    }
  }, [players, selectedPlayer, setPlayers]);

  const fileInput = useRef(null);
  const onClickAdd = useCallback(() => {
    fileInput.current.click();
  }, [fileInput]);

  return (
    <div id="controls">
      <div class="control">
        <button class="item" disabled={ busy } onClick={ onClickAdd }>
          <input type="file" ref={ fileInput } style="display: none" onChange={ add } />
          ＋音を追加
        </button>
        { players.length > 0 && (
          <>
            <button class="item" disabled={ busy } onClick={ play }>プレビュー</button>
            <button class="item" disabled={ busy } onClick={ record }>録音</button>
          </>
        ) }
      </div>
      { selectedPlayer && (
        <>
          <div class="control">
            <div class="item">
              { selectedPlayerValues.name }
            </div>
            <div class="item">
              再生タイミング：
              <input
                  type="number"
                  disabled={ busy }
                  value={ selectedPlayerValues.delay }
                  onInput={ onChangeDelay } />
              ミリ秒
            </div>
            <button class="item" disabled={ busy } onClick={ deleteSelectedPlayer }>
              削除
            </button>
          </div>
          <div class="control">
            <div class="item">
              操作方法：
            </div>
            <div class="item">
              玉をドラッグで音を移動、玉以外をドラッグで視点切り替え
            </div>
          </div>
        </>
      ) }
    </div>
  );
};

const App = () => {
  const [showIntroduction, setShowIntroduction] = useState(true);

  const hideIntroduction = useCallback(() => {
    setShowIntroduction(false)
  }, [setShowIntroduction]);

  if (showIntroduction) {
    return <Introduction onHideIntroduction={ hideIntroduction } />
  } else {
    return <Controls />
  }
};

Preact.render(<App />, document.getElementById("preact-container"));
