let scene, camera, renderer, controls;
let planets = [];
let asteroids = [];
let raycaster, mouse;
let animationEnabled = true;
let moveDirection = new THREE.Vector3();
let keys = {};

let techniques = {
    rayCasting: true,
    textureMapping: true,
    polygonShading: true
};

let originalMaterials = new Map();
let basicMaterials = new Map();

// Multiplayer variables
let socket;
let otherPlayers = {};
let playerId;
let playerModel;

// Player model creation function
function createPlayerModel(id, position, rotation) {
    const geometry = new THREE.BoxGeometry(2, 4, 2);
    const material = new THREE.MeshPhongMaterial({ 
        color: id === playerId ? 0x00ff00 : 0xff0000,
        emissive: id === playerId ? 0x003300 : 0x330000,
        emissiveIntensity: 0.5
    });
    
    const model = new THREE.Mesh(geometry, material);
    model.position.set(position.x, position.y, position.z);
    model.rotation.set(rotation.x, rotation.y, rotation.z);
    model.castShadow = true;
    
    model.userData = { id: id };
    scene.add(model);
    
    return model;
}

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000011, 50, 500);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 50);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000011);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('container').appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    createSpaceEnvironment();
    createPlanets();
    createAsteroids();
    createLighting();
    
    setupEventListeners();
    
    animate();

    socket = io();
    
    // Set up socket event listeners
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('Connected to server with ID:', playerId);
    });
    
    // When we receive the current players
    socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
            if (id !== playerId) {
                otherPlayers[id] = createPlayerModel(
                    id,
                    players[id].position,
                    players[id].rotation
                );
            }
        });
    });
    
    // When a new player connects
    socket.on('newPlayer', (playerInfo) => {
        if (playerInfo.id !== playerId) {
            otherPlayers[playerInfo.id] = createPlayerModel(
                playerInfo.id,
                playerInfo.position,
                playerInfo.rotation
            );
        }
    });
    
    // When a player moves
    socket.on('playerMoved', (playerInfo) => {
        const player = otherPlayers[playerInfo.id];
        if (player) {
            player.position.set(
                playerInfo.position.x,
                playerInfo.position.y,
                playerInfo.position.z
            );
            player.rotation.set(
                playerInfo.rotation.x,
                playerInfo.rotation.y,
                playerInfo.rotation.z
            );
        }
    });
    
    // When a player disconnects
    socket.on('playerDisconnected', (playerId) => {
        const player = otherPlayers[playerId];
        if (player) {
            scene.remove(player);
            delete otherPlayers[playerId];
        }
    });
    
    // Create our own player model
    playerModel = createPlayerModel(playerId, camera.position, camera.rotation);
}

function createSpaceEnvironment() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
    
    const starsVertices = [];
    for (let i = 0; i < 2000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 2000;
        starsVertices.push(x, y, z);
    }
    
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
}

function createPlanets() {
    const planetData = [
        { name: 'Kepler-442b', color: 0x4444ff, size: 8, distance: 60, resources: 'Water, Oxygen', threat: 'Low' },
        { name: 'Mars-Alpha', color: 0xff4444, size: 6, distance: 100, resources: 'Iron, Minerals', threat: 'Medium' },
        { name: 'Europa-9', color: 0x44ff44, size: 5, distance: 140, resources: 'Methane, Ice', threat: 'High' },
        { name: 'Titan-X', color: 0xffaa44, size: 10, distance: 200, resources: 'Rare Metals', threat: 'Extreme' }
    ];
    
    planetData.forEach((data, index) => {
        const geometry = new THREE.SphereGeometry(data.size, 32, 32);
        
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        const imageData = ctx.createImageData(512, 512);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = Math.random() * 0.3 + 0.7;
            const r = ((data.color >> 16) & 0xff) * noise;
            const g = ((data.color >> 8) & 0xff) * noise;
            const b = (data.color & 0xff) * noise;
            
            imageData.data[i] = r;
            imageData.data[i + 1] = g;
            imageData.data[i + 2] = b;
            imageData.data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        
        const texture = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.MeshPhongMaterial({
            map: texture,
            shininess: 30,
            specular: 0x444444
        });
        
        const basicMaterial = new THREE.MeshBasicMaterial({
            map: texture
        });
        
        const planet = new THREE.Mesh(geometry, material);
        
        originalMaterials.set(planet, material);
        basicMaterials.set(planet, basicMaterial);
        
        const angle = (index / planetData.length) * Math.PI * 2;
        planet.position.x = Math.cos(angle) * data.distance;
        planet.position.z = Math.sin(angle) * data.distance;
        planet.position.y = (Math.random() - 0.5) * 20;
        
        planet.userData = data;
        planet.userData.angle = angle;
        planet.userData.distance = data.distance;
        planet.userData.rotationSpeed = 0.01 + Math.random() * 0.02;
        planet.userData.color = data.color;
        
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
        
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
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
            shininess: 10
        });
        
        const basicMaterial = new THREE.MeshBasicMaterial({
            map: texture
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
            color: 0x666666 
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
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onMouseClick);
    
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    window.addEventListener('resize', onWindowResize);
    
    renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
    });
    
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === renderer.domElement) {
            document.addEventListener('mousemove', onMouseLook);
        } else {
            document.removeEventListener('mousemove', onMouseLook);
        }
    });
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onMouseLook(event) {
    if (document.pointerLockElement === renderer.domElement) {
        const sensitivity = 0.002;
        camera.rotation.y -= event.movementX * sensitivity;
        camera.rotation.x -= event.movementY * sensitivity;
        camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
    }
}

function onMouseClick() {
    if (techniques.rayCasting) {
        performPlanetScan();
    } else {
        document.getElementById('scanContent').innerHTML = `
            <h4>🚫 SCAN DISABLED</h4>
            <p>Ray casting is currently disabled.<br>Press 'I' to enable planet scanning.</p>
        `;
        document.getElementById('scanResult').style.display = 'block';
        setTimeout(() => {
            document.getElementById('scanResult').style.display = 'none';
        }, 3000);
    }
}

function performPlanetScan() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    const intersects = raycaster.intersectObjects(planets);
    
    if (intersects.length > 0) {
        const planet = intersects[0].object;
        const data = planet.userData;
        const distance = camera.position.distanceTo(planet.position);
        
        document.getElementById('scanContent').innerHTML = `
            <h4>🔍 SCAN RESULTS</h4>
            <strong>Planet:</strong> ${data.name}<br>
            <strong>Distance:</strong> ${distance.toFixed(1)} units<br>
            <strong>Size:</strong> Class ${data.size}<br>
            <strong>Resources:</strong> ${data.resources}<br>
            <strong>Threat Level:</strong> ${data.threat}<br>
            <strong>Scan Status:</strong> <span style="color: #00ff00;">Complete</span>
        `;
        
        document.getElementById('scanResult').style.display = 'block';
        
        setTimeout(() => {
            document.getElementById('scanResult').style.display = 'none';
        }, 5000);
        
        const originalEmissive = planet.material.emissive.getHex();
        planet.material.emissive.setHex(0x004400);
        setTimeout(() => {
            planet.material.emissive.setHex(originalEmissive);
        }, 500);
    }
}

function onKeyDown(event) {
    keys[event.code] = true;
    
    if (event.code === 'Space') {
        event.preventDefault();
        animationEnabled = !animationEnabled;
    }
    
    if (event.code === 'KeyI') {
        event.preventDefault();
        toggleRayCasting();
    }
    if (event.code === 'KeyO') {
        event.preventDefault();
        toggleTextureMapping();
    }
    if (event.code === 'KeyP') {
        event.preventDefault();
        togglePolygonShading();
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function updateMovement() {
    moveDirection.set(0, 0, 0);
    
    if (keys['KeyW']) moveDirection.z -= 1;
    if (keys['KeyS']) moveDirection.z += 1;
    if (keys['KeyA']) moveDirection.x -= 1;
    if (keys['KeyD']) moveDirection.x += 1;
    
    if (moveDirection.length() > 0) {
        moveDirection.normalize();
        
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, camera.up).normalize();
        
        const forward = cameraDirection.clone();
        forward.y = 0;
        forward.normalize();
        
        const movement = new THREE.Vector3();
        movement.addScaledVector(forward, -moveDirection.z * 0.5);
        movement.addScaledVector(right, moveDirection.x * 0.5);
        
        camera.position.add(movement);
    }
}

function toggleRayCasting() {
    techniques.rayCasting = !techniques.rayCasting;
    updateToggleUI('rayCastingToggle', techniques.rayCasting);
}

function toggleTextureMapping() {
    techniques.textureMapping = !techniques.textureMapping;
    updateToggleUI('textureMappingToggle', techniques.textureMapping);
    
    [...planets, ...asteroids].forEach(object => {
        const originalMaterial = originalMaterials.get(object);
        const basicMaterial = basicMaterials.get(object);
        
        if (techniques.textureMapping) {
            if (techniques.polygonShading) {
                object.material = originalMaterial;
            } else {
                object.material = new THREE.MeshBasicMaterial({
                    map: originalMaterial.map
                });
            }
        } else {
            const color = object.userData.color || 0x666666;
            if (techniques.polygonShading) {
                object.material = new THREE.MeshPhongMaterial({
                    color: color,
                    shininess: originalMaterial.shininess,
                    specular: originalMaterial.specular
                });
            } else {
                object.material = new THREE.MeshBasicMaterial({
                    color: color
                });
            }
        }
    });
}

function togglePolygonShading() {
    techniques.polygonShading = !techniques.polygonShading;
    updateToggleUI('polygonShadingToggle', techniques.polygonShading);
    
    [...planets, ...asteroids].forEach(object => {
        const originalMaterial = originalMaterials.get(object);
        
        if (techniques.polygonShading) {
            if (techniques.textureMapping) {
                object.material = originalMaterial;
            } else {
                const color = object.userData.color || 0x666666;
                object.material = new THREE.MeshPhongMaterial({
                    color: color,
                    shininess: originalMaterial.shininess,
                    specular: originalMaterial.specular
                });
            }
        } else {
            if (techniques.textureMapping) {
                object.material = new THREE.MeshBasicMaterial({
                    map: originalMaterial.map
                });
            } else {
                const color = object.userData.color || 0x666666;
                object.material = new THREE.MeshBasicMaterial({
                    color: color
                });
            }
        }
    });
}

function updateToggleUI(elementId, isActive) {
    const element = document.getElementById(elementId);
    const statusElement = element.querySelector('.toggle-status');
    
    if (isActive) {
        element.className = 'toggle-item active';
        statusElement.className = 'toggle-status status-on';
        statusElement.textContent = 'ON';
    } else {
        element.className = 'toggle-item inactive';
        statusElement.className = 'toggle-status status-off';
        statusElement.textContent = 'OFF';
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    updateMovement();
    
    // Send player movement data to server
    if (socket && playerModel) {
        playerModel.position.copy(camera.position);
        playerModel.rotation.copy(camera.rotation);
        
        socket.emit('playerMovement', {
            position: {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z
            },
            rotation: {
                x: camera.rotation.x,
                y: camera.rotation.y,
                z: camera.rotation.z
            }
        });
    }
    
    renderer.render(scene, camera);
}

// Initialize the game when the DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}