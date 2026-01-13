let socket;
let playerId;
let gameId;
let playerName;
let opponentName;
let gameState = {
  planetsScanned: 0,
  completedPlanets: [],
};

// Three.js variables
let scene, camera, renderer, controls;
let planets = [];
let asteroids = [];
let raycaster, mouse;
let animationEnabled = true;
let moveDirection = new THREE.Vector3();
let keys = {};
let isPointerLocked = false;
let opponent = null;
let playerSphere = null;

// Rendering techniques
let techniques = {
  rayCasting: true,
  textureMapping: true,
  polygonShading: true,
};

// Puzzle variables
let currentPuzzlePlanet = null;
let completedPuzzles = new Set();
let originalMaterials = new Map();
let basicMaterials = new Map();
let moveSpeed = 10;
let moveVelocity = new THREE.Vector3();
let moveAcceleration = 30;
let moveDamping = 0.2;
let clock = new THREE.Clock();

let cameraRotation = {
  yaw: 0,
  pitch: 0,
  sensitivity: 0.002,
  maxPitch: Math.PI / 2.1,
  minPitch: -Math.PI / 2.1,
};

// Planet puzzles data
const planetPuzzles = {
  "Kepler-442b": {
    title: "Water World Puzzle",
    gridSize: { rows: 11, cols: 11 },
    words: {
      across1: { word: "RAYCASTING", start: { row: 1, col: 1 }, length: 10 },
      down1: { word: "RAYTRACING", start: { row: 1, col: 1 }, length: 10 },
    },
    clues: {
      across: ["1. 3D rendering technique for visibility (10 letters)"],
      down: ["1. Advanced rendering with light simulation (10 letters)"],
    },
    answers: { across1: "RAYCASTING", down1: "RAYTRACING" },
  },
  "Mars-Alpha": {
    title: "Red Planet Puzzle",
    gridSize: { rows: 8, cols: 8 },
    words: {
      across1: { word: "SHADOW", start: { row: 1, col: 1 }, length: 6 },
      down1: { word: "SHADING", start: { row: 1, col: 1 }, length: 7 },
    },
    clues: {
      across: ["1. Dark area where light is blocked (6 letters)"],
      down: ["1. Technique for adding depth with light (7 letters)"],
    },
    answers: { across1: "SHADOW", down1: "SHADING" },
  },
  "Europa-9": {
    title: "Ice Moon Puzzle",
    gridSize: { rows: 9, cols: 9 },
    words: {
      across1: { word: "DEPTH", start: { row: 1, col: 1 }, length: 5 },
      down1: { word: "DISTANCE", start: { row: 1, col: 1 }, length: 8 },
    },
    clues: {
      across: ["1. How far back objects appear (5 letters)"],
      down: ["1. Space between two points (8 letters)"],
    },
    answers: { across1: "DEPTH", down1: "DISTANCE" },
  },
  "Titan-X": {
    title: "Extreme World Puzzle",
    gridSize: { rows: 9, cols: 9 },
    words: {
      across1: { word: "SWEEPING", start: { row: 1, col: 1 }, length: 8 },
      down1: { word: "SPINNING", start: { row: 1, col: 1 }, length: 8 },
    },
    clues: {
      across: ["1. Moving in a wide curved motion (8 letters)"],
      down: ["1. Rotating around an axis (8 letters)"],
    },
    answers: { across1: "SWEEPING", down1: "SPINNING" },
  },
  "Render-7": {
    title: "Graphics World Puzzle",
    gridSize: { rows: 7, cols: 7 },
    words: {
      across1: { word: "RENDER", start: { row: 1, col: 1 }, length: 6 },
      down1: { word: "ROTATE", start: { row: 1, col: 1 }, length: 6 },
    },
    clues: {
      across: ["1. 3D to 2D (6 letters)"],
      down: ["1. Movement of object around the center (6 letters)"],
    },
    answers: { across1: "RENDER", down1: "ROTATE" },
  },
  "Projection-5": {
    title: "View World Puzzle",
    gridSize: { rows: 12, cols: 12 },
    words: {
      across1: { word: "PERSPECTIVE", start: { row: 1, col: 1 }, length: 11 },
      down1: { word: "PARALLEL", start: { row: 1, col: 1 }, length: 8 },
    },
    clues: {
      across: ["1. Projection gives a realistic view (11 letters)"],
      down: ["1. Projection does not give a realistic view (8 letters)"],
    },
    answers: { across1: "PERSPECTIVE", down1: "PARALLEL" },
  },
};

// Initialize the game
function init() {
  setupSocket();
  setupUI();

  // Initialize Three.js scene after player joins
  document.getElementById("startButton").addEventListener("click", startGame);
  document
    .getElementById("restartButton")
    .addEventListener("click", restartGame);
}

function setupSocket() {
  socket = io();

  socket.on("connect", () => {
    playerId = socket.id;
    console.log("Connected to server with ID:", playerId);
  });

  socket.on("opponentLeft", () => {
    // Show opponent left message
    const startScreen = document.getElementById("startScreen");
    startScreen.innerHTML = `
    <h1>OPPONENT LEFT</h1>
    <p>Your opponent has left the game.</p>
    <div id="playerForm">
      <input type="text" id="playerNameInput" placeholder="Enter your name" maxlength="20">
      <button id="startButton">START GAME</button>
    </div>
  `;
    startScreen.style.display = "flex";

    // Re-setup event listeners
    document.getElementById("startButton").addEventListener("click", startGame);
    document.getElementById("playerNameInput").focus();
  });

  socket.on("gameRestarted", () => {
    console.log("Successfully left previous game");
  });

  socket.on("gameJoined", (data) => {
    if (data.status === "waiting") {
      document.getElementById("startScreen").innerHTML = `
        <h1>WAITING FOR OPPONENT...</h1>
        <div>Player: ${playerName}</div>
      `;
    }
  });

  socket.on("gameStart", (data) => {
    gameId = data.gameId;
    opponentName = Object.values(data.players).find(
      (p) => p.name !== playerName
    ).name;

    document.getElementById("startScreen").style.display = "none";
    document.getElementById("playerName").textContent = `You: ${playerName}`;
    document.getElementById(
      "opponentName"
    ).textContent = `Opponent: ${opponentName}`;

    initThreeJS();
  });

  socket.on("playerMoved", (data) => {
    if (opponent && data.playerId !== playerId) {
      // Force opponent visibility
      opponent.visible = true;

      // Smooth position update
      if (data.position) {
        opponent.position.lerp(
          new THREE.Vector3(data.position.x, data.position.y, data.position.z),
          0.2
        );
      }

      // Smooth rotation update
      if (data.rotation) {
        const targetQuaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(data.rotation.x, data.rotation.y, data.rotation.z)
        );
        opponent.quaternion.slerp(targetQuaternion, 0.2);
      }

      // Add subtle animation
      opponent.scale.set(1, 1.5 + Math.sin(Date.now() * 0.005) * 0.2, 1);
    }
  });

  socket.on("opponentProgress", (data) => {
    updateOpponentProgress(data.progress);
  });

  socket.on("opponentDisconnected", (data) => {
    showMessage(`${data.playerName} disconnected. You win!`);
    endGame(true);
  });

  socket.on("gameEnd", (data) => {
    const winner = data.winner === playerId;
    showEndScreen(winner, data);
  });
}

function setupUI() {
  document.getElementById("playerNameInput").focus();
}

function startGame() {
  playerName = document.getElementById("playerNameInput").value.trim();
  if (!playerName) {
    playerName = `Player${Math.floor(Math.random() * 1000)}`;
  }

  socket.emit("joinGame", { playerName });
}

function restartGame() {
  // Reset local game state
  gameState = {
    planetsScanned: 0,
    completedPlanets: [],
  };
  completedPuzzles.clear();

  // Clean up Three.js scene
  if (scene) {
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
    if (renderer) {
      renderer.dispose();
      const container = document.getElementById("container");
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    }
  }

  // Reset UI
  document.getElementById("endScreen").style.display = "none";
  document.getElementById("startScreen").style.display = "flex";
  document.getElementById("playerNameInput").value = "";
  document.getElementById("playerNameInput").focus();

  // Notify server we're leaving the game
  if (gameId) {
    socket.emit("leaveGame", { gameId });
    gameId = null;
  }

  // Reset player info
  opponentName = null;
  opponent = null;
  playerSphere = null;
}

function initThreeJS() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000011, 50, 500);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 10, 50);

  cameraRotation.yaw = 0;
  cameraRotation.pitch = 0;
  camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, "YXZ"));

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000011);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById("container").appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  createSpaceEnvironment();
  createPlanets();
  createAsteroids();
  createLighting();
  createOpponent();
  if (opponent) {
    opponent.position.set(10, 10, 40);
    opponent.rotation.set(0, Math.PI, 0);
    opponent.visible = true;
  }

  setupEventListeners();
  animate();
}

function createSpaceEnvironment() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
  });

  const starsVertices = [];
  for (let i = 0; i < 2000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    starsVertices.push(x, y, z);
  }

  starsGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starsVertices, 3)
  );
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);
}

function createPlanets() {
  // Array of texture paths
  const planetTextures = [
    "textures/planet1.jpg",
    "textures/planet2.jpg",
    "textures/planet3.jpg",
    "textures/planet4.jpg",
    "textures/planet5.jpg",
    "textures/planet6.jpg",
  ];

  const planetData = [
    {
      name: "Kepler-442b",
      texture: planetTextures[0],
      size: 8,
      distance: 60,
      resources: "Water, Oxygen",
      threat: "Low",
    },
    {
      name: "Mars-Alpha",
      texture: planetTextures[1],
      size: 6,
      distance: 100,
      resources: "Iron, Minerals",
      threat: "Medium",
    },
    {
      name: "Europa-9",
      texture: planetTextures[2],
      size: 5,
      distance: 140,
      resources: "Methane, Ice",
      threat: "High",
    },
    {
      name: "Titan-X",
      texture: planetTextures[3],
      size: 10,
      distance: 200,
      resources: "Rare Metals",
      threat: "Extreme",
    },
    {
      name: "Render-7",
      texture: planetTextures[4],
      size: 7,
      distance: 160,
      resources: "Graphics, Light",
      threat: "Medium",
    },
    {
      name: "Projection-5",
      texture: planetTextures[5],
      size: 9,
      distance: 220,
      resources: "Views, Angles",
      threat: "High",
    },
  ];

  // Texture loader
  const textureLoader = new THREE.TextureLoader();

  planetData.forEach((data, index) => {
    const geometry = new THREE.SphereGeometry(data.size, 32, 32);

    // Load texture
    const texture = textureLoader.load(data.texture);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);

    const material = new THREE.MeshPhongMaterial({
      map: texture,
      shininess: 30,
      specular: 0x444444,
    });

    const basicMaterial = new THREE.MeshBasicMaterial({
      map: texture,
    });

    const planet = new THREE.Mesh(geometry, material);

    originalMaterials.set(planet, material);
    basicMaterials.set(planet, basicMaterial);

    const angle = (index / planetData.length) * Math.PI * 2;
    planet.position.x = Math.cos(angle) * data.distance;
    planet.position.z = Math.sin(angle) * data.distance;
    planet.position.y = (Math.random() - 0.5) * 20;

    planet.userData = {
      ...data,
      angle: angle,
      distance: data.distance,
      rotationSpeed: 0.01 + Math.random() * 0.02,
    };

    scene.add(planet);
    planets.push(planet);
  });
}

function createAsteroids() {
  for (let i = 0; i < 20; i++) {
    const geometry = new THREE.DodecahedronGeometry(1 + Math.random() * 3, 0);

    const vertices = geometry.attributes.position.array;
    for (let j = 0; j < vertices.length; j += 3) {
      const scale = 0.8 + Math.random() * 0.4;
      vertices[j] *= scale;
      vertices[j + 1] *= scale;
      vertices[j + 2] *= scale;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    const imageData = ctx.createImageData(256, 256);
    for (let k = 0; k < imageData.data.length; k += 4) {
      const noise = Math.random() * 0.4 + 0.3;
      const gray = 100 + Math.random() * 100;

      imageData.data[k] = gray * noise;
      imageData.data[k + 1] = gray * noise * 0.8;
      imageData.data[k + 2] = gray * noise * 0.6;
      imageData.data[k + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.MeshPhongMaterial({
      map: texture,
      shininess: 10,
    });

    const basicMaterial = new THREE.MeshBasicMaterial({
      map: texture,
    });

    const asteroid = new THREE.Mesh(geometry, material);

    originalMaterials.set(asteroid, material);
    basicMaterials.set(asteroid, basicMaterial);

    asteroid.position.x = (Math.random() - 0.5) * 400;
    asteroid.position.y = (Math.random() - 0.5) * 100;
    asteroid.position.z = (Math.random() - 0.5) * 400;

    asteroid.userData = {
      rotationX: (Math.random() - 0.5) * 0.02,
      rotationY: (Math.random() - 0.5) * 0.02,
      rotationZ: (Math.random() - 0.5) * 0.02,
      color: 0x666666,
    };

    scene.add(asteroid);
    asteroids.push(asteroid);
  }
}

function createLighting() {
  const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 100, 50);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  const pointLight1 = new THREE.PointLight(0x4444ff, 0.5, 100);
  pointLight1.position.set(-50, 30, -50);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xff4444, 0.5, 100);
  pointLight2.position.set(50, -30, 50);
  scene.add(pointLight2);
}

function setupEventListeners() {
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("click", onMouseClick);

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  window.addEventListener("resize", onWindowResize);

  renderer.domElement.addEventListener("click", () => {
    renderer.domElement.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;

    if (isPointerLocked) {
      document.addEventListener("mousemove", onMouseLook);
    } else {
      document.removeEventListener("mousemove", onMouseLook);
      keys = {};
    }
  });
}

function isPuzzleOpen() {
  return document.getElementById("puzzleModal").style.display === "block";
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onMouseLook(event) {
  if (document.pointerLockElement === renderer.domElement && !isPuzzleOpen()) {
    cameraRotation.yaw -= event.movementX * cameraRotation.sensitivity;
    cameraRotation.pitch -= event.movementY * cameraRotation.sensitivity;

    cameraRotation.pitch = Math.max(
      cameraRotation.minPitch,
      Math.min(cameraRotation.maxPitch, cameraRotation.pitch)
    );

    camera.quaternion.setFromEuler(
      new THREE.Euler(cameraRotation.pitch, cameraRotation.yaw, 0, "YXZ")
    );
  }
}

function onMouseClick() {
  if (isPuzzleOpen() || !isPointerLocked) return;

  if (techniques.rayCasting) {
    performPlanetScan();
  } else {
    document.getElementById("scanContent").innerHTML = `
            <h4>🚫 SCAN DISABLED</h4>
            <p>Ray casting is disabled.<br>Press 'I' to enable planet scanning.</p>
        `;
    document.getElementById("scanResult").style.display = "block";
    setTimeout(() => {
      document.getElementById("scanResult").style.display = "none";
    }, 3000);
  }
}

function performPlanetScan() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const intersects = raycaster.intersectObjects(planets);

  if (intersects.length > 0) {
    const planet = intersects[0].object;
    const planetName = planet.userData.name;

    // Check if puzzle is already completed
    if (completedPuzzles.has(planetName)) {
      // Show scan results directly
      showScanResults(planet);
    } else {
      // Show puzzle first
      currentPuzzlePlanet = planet;
      showPuzzle(planetName);
    }
  }
}

function onKeyDown(event) {
  keys[event.code] = true;

  if (isPuzzleOpen()) return;

  if (event.code === "Space") {
    event.preventDefault();
    animationEnabled = !animationEnabled;
  }

  if (event.code === "KeyI") {
    event.preventDefault();
    toggleRayCasting();
  }
  if (event.code === "KeyO") {
    event.preventDefault();
    toggleTextureMapping();
  }
  if (event.code === "KeyP") {
    event.preventDefault();
    togglePolygonShading();
  }
}

function onKeyUp(event) {
  if (isPuzzleOpen()) return;

  keys[event.code] = false;
}

function updateMovement(deltaTime) {
  // Don't move if puzzle is open
  if (isPuzzleOpen()) return;

  const moveDirection = new THREE.Vector3();

  if (keys["KeyW"]) moveDirection.z += 1;
  if (keys["KeyS"]) moveDirection.z -= 1;
  if (keys["KeyA"]) moveDirection.x += 1;
  if (keys["KeyD"]) moveDirection.x -= 1;
  if (keys["KeyQ"]) moveDirection.y -= 1;
  if (keys["KeyE"]) moveDirection.y += 1;

  if (moveDirection.length() > 0) {
    moveDirection.normalize();
  }

  // Get camera orientation
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  cameraDirection.y = 0; // Keep movement horizontal (optional)
  cameraDirection.normalize();

  const cameraRight = new THREE.Vector3();
  cameraRight.crossVectors(camera.up, cameraDirection).normalize();

  // Calculate target velocity in world space
  const targetVelocity = new THREE.Vector3();
  targetVelocity.addScaledVector(cameraDirection, moveDirection.z * moveSpeed);
  targetVelocity.addScaledVector(cameraRight, moveDirection.x * moveSpeed);
  targetVelocity.addScaledVector(camera.up, moveDirection.y * moveSpeed);

  // Smoothly interpolate to target velocity
  const acceleration = moveAcceleration * deltaTime;
  moveVelocity.x = THREE.MathUtils.lerp(
    moveVelocity.x,
    targetVelocity.x,
    acceleration
  );
  moveVelocity.y = THREE.MathUtils.lerp(
    moveVelocity.y,
    targetVelocity.y,
    acceleration
  );
  moveVelocity.z = THREE.MathUtils.lerp(
    moveVelocity.z,
    targetVelocity.z,
    acceleration
  );

  // Apply damping when no keys are pressed
  if (moveDirection.length() === 0) {
    moveVelocity.multiplyScalar(1 - moveDamping * deltaTime);
    if (moveVelocity.length() < 0.01) {
      moveVelocity.set(0, 0, 0);
    }
  }

  // Apply movement
  camera.position.addScaledVector(moveVelocity, deltaTime);
}

function toggleRayCasting() {
  techniques.rayCasting = !techniques.rayCasting;
  updateToggleUI("rayCastingToggle", techniques.rayCasting);
}

function toggleTextureMapping() {
  techniques.textureMapping = !techniques.textureMapping;
  updateToggleUI("textureMappingToggle", techniques.textureMapping);

  [...planets, ...asteroids].forEach((object) => {
    const originalMaterial = originalMaterials.get(object);
    const basicMaterial = basicMaterials.get(object);

    if (techniques.textureMapping) {
      if (techniques.polygonShading) {
        object.material = originalMaterial;
      } else {
        object.material = new THREE.MeshBasicMaterial({
          map: originalMaterial.map,
        });
      }
    } else {
      const color = object.userData.color || 0x666666;
      if (techniques.polygonShading) {
        object.material = new THREE.MeshPhongMaterial({
          color: color,
          shininess: originalMaterial.shininess,
          specular: originalMaterial.specular,
        });
      } else {
        object.material = new THREE.MeshBasicMaterial({
          color: color,
        });
      }
    }
  });
}

function togglePolygonShading() {
  techniques.polygonShading = !techniques.polygonShading;
  updateToggleUI("polygonShadingToggle", techniques.polygonShading);

  [...planets, ...asteroids].forEach((object) => {
    const originalMaterial = originalMaterials.get(object);

    if (techniques.polygonShading) {
      if (techniques.textureMapping) {
        object.material = originalMaterial;
      } else {
        const color = object.userData.color || 0x666666;
        object.material = new THREE.MeshPhongMaterial({
          color: color,
          shininess: originalMaterial.shininess,
          specular: originalMaterial.specular,
        });
      }
    } else {
      if (techniques.textureMapping) {
        object.material = new THREE.MeshBasicMaterial({
          map: originalMaterial.map,
        });
      } else {
        const color = object.userData.color || 0x666666;
        object.material = new THREE.MeshBasicMaterial({
          color: color,
        });
      }
    }
  });
}

function updateToggleUI(elementId, isActive) {
  const element = document.getElementById(elementId);
  const statusElement = element.querySelector(".toggle-status");

  if (isActive) {
    element.className = "toggle-item active";
    statusElement.className = "toggle-status status-on";
    statusElement.textContent = "ON";
  } else {
    element.className = "toggle-item inactive";
    statusElement.className = "toggle-status status-off";
    statusElement.textContent = "OFF";
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  const deltaTime = Math.min(clock.getDelta(), 0.1);

  requestAnimationFrame(animate);

  updateMovement(deltaTime);

  if (playerSphere) {
    playerSphere.position.copy(camera.position);
    playerSphere.position.y -= 2; // Slightly below camera for better visibility
  }

  if (gameId && isPointerLocked) {
    socket.emit("playerMovement", {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      rotation: {
        x: camera.rotation.x,
        y: camera.rotation.y,
        z: camera.rotation.z,
      },
      playerId: playerId,
      timestamp: Date.now(),
    });
  }

  if (animationEnabled) {
    planets.forEach((planet) => {
      planet.userData.angle += 0.005;
      planet.position.x =
        Math.cos(planet.userData.angle) * planet.userData.distance;
      planet.position.z =
        Math.sin(planet.userData.angle) * planet.userData.distance;
      planet.rotation.y += planet.userData.rotationSpeed;
    });

    asteroids.forEach((asteroid) => {
      asteroid.rotation.x += asteroid.userData.rotationX;
      asteroid.rotation.y += asteroid.userData.rotationY;
      asteroid.rotation.z += asteroid.userData.rotationZ;
    });
  }

  renderer.render(scene, camera);
}

function showPuzzle(planetName) {
  if (isPointerLocked) {
    document.exitPointerLock();
  }

  const puzzleData = planetPuzzles[planetName];
  if (!puzzleData) return;

  document.getElementById("puzzleTitle").textContent = puzzleData.title;
  createPuzzleGrid(puzzleData);
  createPuzzleClues(puzzleData);
  document.getElementById("puzzleModal").style.display = "block";

  setTimeout(() => {
    const firstInput = document.querySelector("#puzzleGrid input");
    if (firstInput) firstInput.focus();
  }, 100);
}

function createPuzzleGrid(puzzleData) {
  const grid = document.getElementById("puzzleGrid");
  grid.innerHTML = "";

  const { rows, cols } = puzzleData.gridSize;

  // Set the grid template columns
  grid.style.gridTemplateColumns = `repeat(${cols}, 35px)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 35px)`;

  // Create cells
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = document.createElement("div");
      cell.className = "puzzle-cell";
      grid.appendChild(cell);
    }
  }

  // Fill in the words
  Object.entries(puzzleData.words).forEach(([wordKey, wordData]) => {
    const { word, start, length } = wordData;
    const isAcross = wordKey.includes("across");

    for (let i = 0; i < length; i++) {
      const row = isAcross ? start.row : start.row + i;
      const col = isAcross ? start.col + i : start.col;
      const cellIndex = row * cols + col;

      if (cellIndex < grid.children.length) {
        const cell = grid.children[cellIndex];
        cell.classList.add("active");

        let input = cell.querySelector("input");
        if (!input) {
          input = document.createElement("input");
          input.maxLength = 1;
          input.addEventListener("input", function (e) {
            e.target.value = e.target.value.toUpperCase();
            const allInputs = document.querySelectorAll("#puzzleGrid input");
            const currentIndex = Array.from(allInputs).indexOf(e.target);
            if (currentIndex < allInputs.length - 1 && e.target.value) {
              allInputs[currentIndex + 1].focus();
            }
          });

          input.addEventListener("keydown", function (e) {
            if (e.key === "Backspace" && !e.target.value) {
              const allInputs = document.querySelectorAll("#puzzleGrid input");
              const currentIndex = Array.from(allInputs).indexOf(e.target);
              if (currentIndex > 0) {
                allInputs[currentIndex - 1].focus();
              }
            }
          });
          cell.appendChild(input);
        }

        if (input.dataset.word) {
          input.dataset.word += "," + wordKey;
          input.dataset.index += "," + i;
        } else {
          input.dataset.word = wordKey;
          input.dataset.index = i;
        }
      }
    }
  });
}

function createPuzzleClues(puzzleData) {
  const cluesDiv = document.getElementById("puzzleClues");
  cluesDiv.innerHTML = "";

  if (puzzleData.clues.across) {
    const acrossTitle = document.createElement("div");
    acrossTitle.innerHTML = "<strong>Across:</strong>";
    acrossTitle.style.color = "#00ff00";
    cluesDiv.appendChild(acrossTitle);

    puzzleData.clues.across.forEach((clue) => {
      const clueDiv = document.createElement("div");
      clueDiv.className = "puzzle-clue";
      clueDiv.textContent = clue;
      cluesDiv.appendChild(clueDiv);
    });
  }

  if (puzzleData.clues.down) {
    const downTitle = document.createElement("div");
    downTitle.innerHTML = "<strong>Down:</strong>";
    downTitle.style.color = "#00ff00";
    downTitle.style.marginTop = "10px";
    cluesDiv.appendChild(downTitle);

    puzzleData.clues.down.forEach((clue) => {
      const clueDiv = document.createElement("div");
      clueDiv.className = "puzzle-clue";
      clueDiv.textContent = clue;
      cluesDiv.appendChild(clueDiv);
    });
  }
}

function checkPuzzle() {
  if (!currentPuzzlePlanet) return;

  const planetName = currentPuzzlePlanet.userData.name;
  const puzzleData = planetPuzzles[planetName];
  const inputs = document.querySelectorAll("#puzzleGrid input");
  let correct = true;

  inputs.forEach((input) => {
    const words = input.dataset.word.split(",");
    const indices = input.dataset.index.split(",");
    let isCorrect = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const index = parseInt(indices[i]);
      const expectedChar = puzzleData.answers[word][index];

      if (input.value.toUpperCase() === expectedChar) {
        isCorrect = true;
        break;
      }
    }

    if (isCorrect) {
      input.parentElement.classList.add("correct");
    } else {
      input.parentElement.classList.remove("correct");
      correct = false;
    }
  });

  if (correct) {
    completedPuzzles.add(planetName);
    markPlanetCompleted(currentPuzzlePlanet);

    const completedPlanet = currentPuzzlePlanet;

    setTimeout(() => {
      closePuzzle();
      showScanResults(completedPlanet);

      renderer.domElement.requestPointerLock();
    }, 500);
  } else {
    document.getElementById("puzzleModal").style.borderColor = "#ff4444";
    setTimeout(() => {
      document.getElementById("puzzleModal").style.borderColor = "#00ff00";
    }, 300);
  }
}

function markPlanetCompleted(planet) {
  planet.material.emissive = new THREE.Color(0x004400);
  planet.userData.completed = true;
}

function showScanResults(planet) {
  const data = planet.userData;
  const distance = camera.position.distanceTo(planet.position);

  document.getElementById("scanContent").innerHTML = `
        <h4>🔍 SCAN RESULTS</h4>
        <strong>Planet:</strong> ${data.name}<br>
        <strong>Distance:</strong> ${distance.toFixed(1)} units<br>
        <strong>Size:</strong> Class ${data.size}<br>
        <strong>Resources:</strong> ${data.resources}<br>
        <strong>Threat Level:</strong> ${data.threat}<br>
        <strong>Scan Status:</strong> <span style="color: #00ff00;">Complete</span>
    `;

  document.getElementById("scanResult").style.display = "block";

  setTimeout(() => {
    document.getElementById("scanResult").style.display = "none";
  }, 5000);

  if (!gameState.completedPlanets.includes(planet.userData.name)) {
    gameState.completedPlanets.push(planet.userData.name);
    gameState.planetsScanned++;
    updatePlayerProgress();
  }
}

function closePuzzle() {
  document.getElementById("puzzleModal").style.display = "none";
  currentPuzzlePlanet = null;

  if (document.getElementById("scanResult").style.display !== "block") {
    renderer.domElement.requestPointerLock();
  }
}

function createOpponent() {
  // Create opponent with more distinct appearance
  const opponentGeometry = new THREE.SphereGeometry(2, 32, 32);
  const opponentMaterial = new THREE.MeshPhongMaterial({
    color: 0xff3333,
    emissive: 0x880000,
    shininess: 100,
    specular: 0x111111,
  });

  opponent = new THREE.Mesh(opponentGeometry, opponentMaterial);
  opponent.castShadow = true;
  opponent.receiveShadow = true;

  // Add glowing effect
  const glowGeometry = new THREE.SphereGeometry(2.2, 32, 32);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.3,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  opponent.add(glow);

  // Add name label
  const nameLabel = createPlayerLabel(opponentName);
  opponent.add(nameLabel);
  nameLabel.position.y = 3.5;

  // Ensure opponent is always visible
  opponent.visible = true;
  scene.add(opponent);

  // Debugging - log opponent visibility
  setInterval(() => {
    if (!opponent.visible) {
      console.warn("Opponent visibility lost - resetting");
      opponent.visible = true;
    }
  }, 1000);
}

function createPlayerLabel(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(0, 0, 0, 0.7)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "Bold 40px Arial";
  context.textAlign = "center";
  context.fillStyle = "white";
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 15);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(8, 4, 1);
  return sprite;
}

function updateOpponentProgress(progress) {
  document.getElementById(
    "opponentProgress"
  ).textContent = `Opponent progress: ${progress.planetsScanned}/3 planets`;
}

function updatePlayerProgress() {
  document.getElementById(
    "playerProgress"
  ).textContent = `Your progress: ${gameState.planetsScanned}/3 planets`;

  socket.emit("progressUpdate", {
    gameId: gameId,
    playerId: playerId,
    progress: gameState,
  });

  if (gameState.planetsScanned >= 3) {
    socket.emit("gameComplete", {
      gameId: gameId,
      playerId: playerId,
      completionTime: Date.now(),
    });
    endGame(true);
  }
}

function endGame(winner) {
  animationEnabled = false;
  if (winner) {
    showMessage("You won the game!");
  }
}

function showMessage(message) {
  const scanResult = document.getElementById("scanResult");
  document.getElementById("scanContent").innerHTML = `<h4>${message}</h4>`;
  scanResult.style.display = "block";
  setTimeout(() => {
    scanResult.style.display = "none";
  }, 5000);
}

function showEndScreen(winner, data) {
  const endScreen = document.getElementById("endScreen");
  const endTitle = document.getElementById("endTitle");
  const endResults = document.getElementById("endResults");

  endTitle.textContent = winner ? "VICTORY!" : "DEFEAT";

  endResults.innerHTML = `
    <p>${winner ? "You won!" : "You lost!"}</p>
    <p>Winner: ${data.winnerName}</p>
    <p>Loser's planets: ${data.loserPlanets.join(", ")}</p>
    <p>Winner's planets: ${data.winnerPlanets.join(", ")}</p>
  `;

  endScreen.style.display = "flex";
}

function restartGame() {
  // Reset game state
  gameState = {
    planetsScanned: 0,
    completedPlanets: [],
  };

  // Clear completed puzzles
  completedPuzzles.clear();

  // Reset Three.js scene
  if (scene) {
    // Remove all objects from scene
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }

    // Clean up renderer
    if (renderer) {
      renderer.dispose();
      document.getElementById("container").removeChild(renderer.domElement);
    }
  }

  // Reset opponent
  opponent = null;

  // Hide end screen and show start screen
  document.getElementById("endScreen").style.display = "none";
  document.getElementById("startScreen").style.display = "flex";

  // Reset player info display
  document.getElementById("playerName").textContent = "";
  document.getElementById("opponentName").textContent = "";
  document.getElementById("playerProgress").textContent = "";
  document.getElementById("opponentProgress").textContent = "";

  // Reset name input
  document.getElementById("playerNameInput").value = "";
  document.getElementById("playerNameInput").focus();

  // Leave current game if exists
  if (gameId) {
    socket.emit("leaveGame", { gameId });
    gameId = null;
  }
}

// Initialize the game when the page loads
window.onload = init;
