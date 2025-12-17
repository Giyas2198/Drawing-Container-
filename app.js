// =================================================================
// script.js: Kontrol Utama (Firebase & Three.js) - VERSI FINAL DENGAN FISIKA COG (KEMIRINGAN)
// [FIX LOGIC]: Membalik D/T dan mengubah posisi roll menjadi BERDIRI.
// [UPDATE KHUSUS]: Diameter Alas (D) sekarang DIPAKSA menjadi 1.2 meter untuk semua material.
// [FITUR BARU]: autoRecommendPlacement untuk penempatan multi-baris (X dan Z) + COG + ZIG-ZAG.
// [PERBAIKAN QTY]: Event listener diubah dari 'change' menjadi 'input' agar lebih responsif.
// [PERBAIKAN VISUALISASI Z]: Logika penempatan baris Z di autoRecommendPlacement diperbaiki.
// [FITUR BARU COG]: Implementasi Rotasi Kemiringan Kontainer saat diangkat berdasarkan COG (X).
// =================================================================

// --- 1. KONFIGURASI FIREBASE (WAJIB GANTI KUNCI API) ---
const firebaseConfig = {
    // Pastikan Anda GANTI kunci ini dengan kunci ASLI dari project Firebase Anda
    apiKey: "AIzaSyC0t5s8...", // <-- HARAP GANTI DENGAN KUNCI API ASLI ANDA!
    authDomain: "giyas-coding.firebaseapp.com",
    projectId: "giyas-coding", 
    storageBucket: "giyas-coding.appspot.com",
    messagingSenderId: "3814315892324",
    appId: "1:3814315892324:web:f51759b37e76705d83971"
};

let db = null; 
try {
    if (typeof firebase !== 'undefined') {
        if (firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
        }
        // Inisialisasi Firestore
        db = firebase.firestore();
        console.log("Firebase Firestore berhasil diinisialisasi.");
    } else {
        console.warn("Firebase SDK tidak terdeteksi. Fitur DB akan dinonaktifkan.");
    }
} catch (error) {
    console.error("Kesalahan inisialisasi Firebase:", error);
    showStatus("Gagal inisialisasi Firebase. Fitur database dinonaktifkan.", 'danger');
}


// --- 2. VARIABEL GLOBAL THREE.JS ---
let scene, camera, renderer, controls, containerMesh;
const visualizationContainer = document.getElementById('visualization-container');
let itemsInScene = []; // Array untuk menyimpan objek material (roll) yang ada di scene.

// --- VARIABEL UNTUK DRAG CONTROL ---
let isMoveModeActive = false; // Status apakah mode drag aktif atau tidak
let dragControls; // Objek DragControls Three.js
// -----------------------------------------------------------

// Crane Components
let craneGroup, hookSpreader;
// VARIABEL BARU UNTUK COG
let cogPivot; // Objek pivot yang akan merotasi kontainer
let currentCogX = 0; // Center of Gravity (X) saat ini
// END VARIABEL BARU
let craneActive = false;
const CRANE_LIFT_HEIGHT = 10; // Ketinggian angkat crane dari lantai (World Y)
const CONTAINER_HEIGHT_OFFSET = 2.69; // Asumsi tinggi kontainer

// Dimensi Crane yang lebih pendek (Didefinisikan di global agar mudah diakses)
const CRANE_TOWER_H = 16; 
const CRANE_TOWER_W = 1;
const CRANE_BOOM_L = 20; 
const BOOM_TIP_Z_REL = CRANE_BOOM_L / 2; // Z relatif ujung Boom (Z=10)


// Moda / Kontainer
const MODA_DIMENSIONS = {
    '40HC': { name: '40ft HC', type: 'CONTAINER', L: 12.2, W: 2.45, H: 2.48, maxWeight: 30000 },
    '20GP': { name: '20ft GP', type: 'CONTAINER', L: 6.2, W: 2.5, H: 2.5, maxWeight: 24000 },
    'WINGBOX': { name: 'Wing Box', type: 'CONTAINER', L: 11.0, W: 2.4, H: 2.45, maxWeight: 28000 },
    'TRAILER_LOSSBAK': { name: 'Trailer Lossbak', type: 'LOSSBAK', L: 12.0, W: 2.45, H: 0.1, maxHeight: 999, maxWeight: 32000 },
    'TRONTON_LOSSBAK': { name: 'Tronton Lossbak', type: 'LOSSBAK', L: 9.5, W: 2.4, H: 0.1, maxHeight: 999, maxWeight: 15000 },
    'custom': { name: 'Custom', type: 'CONTAINER', L: 12.2, W: 2.45, H: 2.48, maxWeight: 30000 }
};
let currentModa = MODA_DIMENSIONS['40HC'];


// --- 3. FUNGSI UTILITY ---

/** Menampilkan pesan status di UI */
function showStatus(msg, type = 'info') {
    const statusBox = document.getElementById('status-message');
    if (!statusBox) return; // Pengamanan
    statusBox.textContent = msg;
    statusBox.className = `status-box ${type}`;
}

/** Menampilkan modal custom */
function showModal(title, message, type = 'info') {
    const modal = document.getElementById('custom-modal');
    if (!modal) return;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    modal.style.display = 'flex';
}

/** Memperbarui tampilan dimensi kontainer */
function updateModaDisplay() {
    const display = document.getElementById('current-moda-display');
    if (!display) return;
    
    // Menampilkan T-Bebas untuk Lossbak
    const displayH = currentModa.type === 'LOSSBAK' ? 'T-Bebas' : `${currentModa.H.toFixed(2)}m`;
    
    display.innerHTML = `${currentModa.name} (P: ${currentModa.L.toFixed(2)}m | L: ${currentModa.W.toFixed(2)}m | T: ${displayH} | Max: ${currentModa.maxWeight.toLocaleString()} kg)`;
}

// --- 4. THREE.JS INITIALIZATION & CRANE LOGIC ---

/** Inisialisasi Scene, Camera, Renderer, dan Controls */
function initThreeJS() {
    if (!visualizationContainer) {
        console.error("Container visualisasi tidak ditemukan. Three.js gagal diinisialisasi.");
        showStatus("ERROR: Container visualisasi tidak ditemukan!", 'danger');
        return;
    }
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); 

    // Kamera
    camera = new THREE.PerspectiveCamera(50, visualizationContainer.clientWidth / visualizationContainer.clientHeight, 0.1, 1000);
    camera.position.set(20, 15, 20); 
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(visualizationContainer.clientWidth, visualizationContainer.clientHeight);
    visualizationContainer.appendChild(renderer.domElement);
    
    // Kontrol (OrbitControls)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    
    // Pencahayaan
    const ambientLight = new THREE.AmbientLight(0x404040); 
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Grid Lantai
    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x888888);
    scene.add(gridHelper);

    // Panggil fungsi visualisasi kontainer dan crane
    visualizeContainerFrame();
    buildCrane();

    window.addEventListener('resize', onWindowResize);
    animate();
    showStatus("Visualisasi 3D berhasil diinisialisasi.", 'success');
}

/** Membangun Visual Crane */
function buildCrane() {
    
    craneGroup = new THREE.Group();
    craneGroup.name = 'CraneGroup';
    // FIX 1: Posisi Crane: Di tengah sumbu X, di belakang kontainer (Z negatif)
    craneGroup.position.set(0, 0, -currentModa.W / 2 - 5); 
    
    // Tower/Tiang
    const towerGeometry = new THREE.BoxGeometry(CRANE_TOWER_W, CRANE_TOWER_H, CRANE_TOWER_W);
    const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xcc9900 });
    const towerMesh = new THREE.Mesh(towerGeometry, towerMaterial);
    towerMesh.position.y = CRANE_TOWER_H / 2;
    craneGroup.add(towerMesh);
    
    // Boom/Lengan
    const boomGeometry = new THREE.BoxGeometry(CRANE_BOOM_L, 0.5, 0.5);
    const boomMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    const boomMesh = new THREE.Mesh(boomGeometry, boomMaterial);
    boomMesh.name = 'BoomMesh'; 
    boomMesh.rotation.y = Math.PI / 2; // Memanjang di sumbu Z
    // Posisi Boom: Di depan Tower (Z=0, Y=Tinggi Tower), memanjang ke Z positif
    boomMesh.position.set(0, CRANE_TOWER_H - 0.25, CRANE_BOOM_L / 2); 
    craneGroup.add(boomMesh);

    // Hook/Spreader 
    const hookGeometry = new THREE.BoxGeometry(0.5, 0.5, 3);
    const hookMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    hookSpreader = new THREE.Mesh(hookGeometry, hookMaterial);
    hookSpreader.name = 'CraneHookSpreader';
    
    // PERBAIKAN TALI LURUS 1: Posisi Z Hook diatur sama dengan Z relatif ujung Boom (BOOM_TIP_Z_REL)
    // agar tali selalu lurus vertikal
    hookSpreader.position.set(0, CRANE_LIFT_HEIGHT, BOOM_TIP_Z_REL); 
    craneGroup.add(hookSpreader);
    
    // Garis Tali (Rope)
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, CRANE_TOWER_H - 0.25, BOOM_TIP_Z_REL), // Ujung Boom relatif (Z = BOOM_TIP_Z_REL)
        new THREE.Vector3(0, CRANE_LIFT_HEIGHT, BOOM_TIP_Z_REL) // Posisi Hook relatif (Z = BOOM_TIP_Z_REL)
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x999999 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = 'CraneRope';
    craneGroup.add(line);
    
    scene.add(craneGroup);
    craneGroup.visible = false; // Sembunyikan secara default
}

/** Menggambar kontainer/moda sebagai kerangka (wireframe) */
function visualizeContainerFrame() {
    if (containerMesh) {
        scene.remove(containerMesh);
        // Pastikan juga menghapus dari COG Pivot jika ada
        if (cogPivot && containerMesh.parent === cogPivot) {
            cogPivot.remove(containerMesh);
        }
    }
    
    const { L, W, H, type } = currentModa;
    
    const geometry = new THREE.BoxGeometry(L, H, W);
    
    let material;
    if (type === 'LOSSBAK') {
        material = new THREE.MeshBasicMaterial({ color: 0x666666, side: THREE.DoubleSide }); 
    } else {
        material = new THREE.MeshBasicMaterial({ color: 0x007bff, wireframe: true }); 
    }
    
    containerMesh = new THREE.Mesh(geometry, material);
    containerMesh.name = 'ContainerFrame';

    containerMesh.position.set(0, H / 2, 0); 
    
    scene.add(containerMesh);
    updateModaDisplay();
    
    // Perbarui posisi crane jika dimensinya berubah
    if(craneGroup && hookSpreader) {
        // Update crane position based on new container width (W)
        craneGroup.position.set(0, 0, -W / 2 - 5); 
        
        // PERBAIKAN TALI LURUS 2: Update Hook Z agar selalu sejajar dengan Boom Z relatif
        hookSpreader.position.set(0, CRANE_LIFT_HEIGHT, BOOM_TIP_Z_REL); 
    }
}

/** Fungsi Animasi (Dipanggil terus menerus) */
function animate(time) {
    requestAnimationFrame(animate);
    
    controls.update(); 
    TWEEN.update(time); // Penting: Update TWEEN untuk menjalankan animasi

    // FIX ROPE: Update posisi tali crane (Rope) agar mengikuti Hook
    if (craneGroup && craneActive) {
        const rope = craneGroup.getObjectByName('CraneRope');
        
        if (rope && hookSpreader) {
            // Posisi ujung Boom relatif terhadap CraneGroup
            // Menggunakan nilai BOOM_TIP_Z_REL yang sama
            const boomTipRelative = new THREE.Vector3(0, CRANE_TOWER_H - 0.25, BOOM_TIP_Z_REL); 
            
            // Posisi Hook/Spreader relatif terhadap CraneGroup
            const hookRelative = hookSpreader.position.clone();

            // Perbarui posisi titik-titik garis
            const points = [
                boomTipRelative, // Posisi ujung boom relatif
                hookRelative     // Posisi hook relatif
            ];
            
            rope.geometry.setFromPoints(points);
            rope.geometry.attributes.position.needsUpdate = true; // Penting
        }
    }

    renderer.render(scene, camera);
}

/** Menangani perubahan ukuran jendela */
function onWindowResize() {
    camera.aspect = visualizationContainer.clientWidth / visualizationContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(visualizationContainer.clientWidth, visualizationContainer.clientHeight);
}

/** Membuat mesh Roll (Silinder) */
function createRollMesh(radius, height, color, id) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
    const material = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.8, name: id });
    const rollMesh = new THREE.Mesh(geometry, material);
    
    rollMesh.rotation.x = 0; // Roll BERDIRI TEGAK
    
    rollMesh.userData = { 
        isRoll: true, 
        rollRadius: radius,
        rollHeight: height, 
        originalColor: color,
        id: id 
    };
    return rollMesh;
}

/** Fungsi untuk menampilkan/menyembunyikan visual crane */
function toggleCraneVisual() {
    craneActive = !craneActive;
    craneGroup.visible = craneActive;
    const craneToggleBtn = document.getElementById('crane-toggle-btn');
    if (craneActive) {
        showStatus("Visual Crane ditampilkan.", 'warning');
        craneToggleBtn.textContent = '❌ Sembunyikan Crane';
        craneToggleBtn.classList.remove('primary-btn');
        craneToggleBtn.classList.add('danger-btn');
    } else {
        showStatus("Visual Crane disembunyikan.", 'info');
        craneToggleBtn.textContent = '🏗️ Tampilkan Crane';
        craneToggleBtn.classList.remove('danger-btn');
        craneToggleBtn.classList.add('primary-btn');
    }
}

/** * FUNGSI KRUSIAL: Animasi Angkat/Turun Kontainer dengan TWEEN */
function animateCraneLift() {
    if (currentModa.type === 'LOSSBAK') {
        showStatus("Fungsi Crane tidak didukung untuk moda Lossbak.", 'error');
        return;
    }
    
    if (!craneActive) {
        showStatus("Aktifkan Crane terlebih dahulu.", 'error');
        return;
    }
    
    // Cek apakah kontainer sedang terangkat. (Menggunakan COG Pivot sebagai parent)
    const isLifted = (cogPivot && cogPivot.parent && cogPivot.parent.name === 'CraneHookSpreader');
    const craneLiftBtn = document.getElementById('crane-lift-btn');
    craneLiftBtn.disabled = true;

    // --- POSISI TARGET (Relative terhadap craneGroup) ---
    // PERBAIKAN TALI LURUS 3: HOOK_CENTER_Z_REL disamakan dengan BOOM_TIP_Z_REL (10)
    const HOOK_CENTER_Z_REL = BOOM_TIP_Z_REL; 
    
    const HOOK_LIFT_Y = CRANE_LIFT_HEIGHT; // Ketinggian angkat (sekitar 10m)
    // Ketinggian dock: Sedikit di atas kontainer untuk attach/detach
    const HOOK_DOCK_Y = currentModa.H / 2 + CONTAINER_HEIGHT_OFFSET; 
    
    // Pastikan Hook berada di posisi Z yang sama dengan ujung Boom sebelum memulai animasi
    hookSpreader.position.z = HOOK_CENTER_Z_REL;

    if (!isLifted) {
        // --- LOGIKA MENGANGKAT (LIFT): Dock Y -> Angkat Y ---
        showStatus("Memulai animasi angkat...", 'info');

        // 1. Buat COG Pivot (jika belum ada)
        if (!cogPivot) {
            cogPivot = new THREE.Object3D();
            cogPivot.name = 'CogPivot';
            scene.add(cogPivot); // Awalnya di scene
        }
        
        // 2. Tentukan Rotasi Kontainer (Kemiringan di sumbu Z)
        // Semakin jauh COG dari pusat (0), semakin besar kemiringannya
        const MAX_COG_OFFSET = currentModa.L / 2 * 0.5; // Max 50% dari setengah panjang
        const MAX_ROTATION_DEG = 10; // Kemiringan maksimum 10 derajat
        
        const rotationAngle = (currentCogX / MAX_COG_OFFSET) * THREE.MathUtils.degToRad(MAX_ROTATION_DEG);
        
        // Atur posisi dan rotasi awal COG Pivot
        // Posisi X COG Pivot = currentCogX. Posisi Y di level lantai container.
        cogPivot.position.set(currentCogX, currentModa.H / 2, 0); 
        // Reset rotasi awal
        cogPivot.rotation.z = 0; 
        
        // Tahap 1: Turunkan Hook ke posisi Dock (Vertikal Y)
        new TWEEN.Tween(hookSpreader.position)
            .to({ y: HOOK_DOCK_Y }, 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                
                // **[PERUBAHAN KRUSIAL COG]** // A. Jadikan semua roll anak dari containerMesh (sebelumnya sudah benar)
                itemsInScene.forEach(roll => {
                    scene.remove(roll);
                    containerMesh.add(roll);
                    roll.position.y -= containerMesh.geometry.parameters.height / 2;
                });
                
                // B. Pindahkan containerMesh (dan semua roll) dari Scene ke COG Pivot
                scene.remove(containerMesh);
                cogPivot.add(containerMesh);
                // Atur posisi containerMesh relatif terhadap COG Pivot.
                // Posisi kontainer harus digeser ke X = -currentCogX agar COG (0) berada tepat di atas Hook (0).
                containerMesh.position.set(-currentCogX, 0, 0); // Y=0 karena COG Pivot sudah di H/2

                // C. Attach COG Pivot ke Hook/Spreader. Hook sekarang mengangkat COG Pivot.
                hookSpreader.add(cogPivot);
                cogPivot.position.set(0, 0, 0); // COG Pivot relatif terhadap Hook sekarang di (0,0,0)

                // Tahap 2: Angkat Hook (Vertikal Y) + Terapkan Rotasi Kemiringan
                new TWEEN.Tween(hookSpreader.position)
                    .to({ y: HOOK_LIFT_Y + CONTAINER_HEIGHT_OFFSET }, 1500)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .onComplete(() => {
                        showStatus("Kontainer berhasil diangkat dan menunjukkan kemiringan COG.", 'success');
                        craneLiftBtn.textContent = '⬇️ Turunkan Kontainer';
                        craneLiftBtn.disabled = false;
                    })
                    .start();
                
                // TWEEN untuk Kemiringan (Rotasi Z pada COG Pivot)
                 new TWEEN.Tween(cogPivot.rotation)
                    .to({ z: -rotationAngle }, 1500) // Rotasi sumbu Z
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .start();
            })
            .start();

    } else {
        // --- LOGIKA MENURUNKAN (LOWER): Rotasi -> Dock Y -> Detach -> Parkir Y ---
        showStatus("Memulai animasi turun...", 'info');
        craneLiftBtn.textContent = 'Menurunkan...';

        // TWEEN untuk Kembalikan Kemiringan ke 0
        new TWEEN.Tween(cogPivot.rotation)
            .to({ z: 0 }, 1000)
            .easing(TWEEN.Easing.Quadratic.In)
            .onComplete(() => {
                
                // Tahap 1: Turunkan Hook ke posisi Dock (Vertikal Y)
                new TWEEN.Tween(hookSpreader.position)
                    .to({ y: HOOK_DOCK_Y }, 1500)
                    .easing(TWEEN.Easing.Quadratic.In)
                    .onComplete(() => {
                        
                        // Tahap 2: Detach COG Pivot dari Hook
                        hookSpreader.remove(cogPivot);
                        scene.add(cogPivot);
                        
                        // Kembalikan posisi COG Pivot ke World Posisi dasarnya
                        cogPivot.position.set(currentCogX, currentModa.H / 2, 0); 

                        // Kembalikan Container Mesh (dan roll) ke World Position
                        cogPivot.remove(containerMesh);
                        scene.add(containerMesh);
                        // Atur posisi containerMesh kembali ke posisi dasarnya
                        containerMesh.position.set(0, currentModa.H / 2, 0); 
                        
                        // **[PERBAIKAN ROLL]** Kembalikan semua roll dari containerMesh ke Scene
                        itemsInScene.forEach(roll => {
                            containerMesh.remove(roll);
                            scene.add(roll);
                            // Atur posisi roll kembali ke World Y aslinya (rollHeight / 2)
                            roll.position.y += containerMesh.geometry.parameters.height / 2;
                        });

                        // Tahap 3: Parkirkan Hook (Vertikal Y)
                        new TWEEN.Tween(hookSpreader.position)
                            .to({ y: HOOK_LIFT_Y }, 1000)
                            .easing(TWEEN.Easing.Quadratic.In)
                            .onComplete(() => {
                                // Hapus COG Pivot dari scene setelah selesai (agar tidak mengganggu penempatan baru)
                                scene.remove(cogPivot);
                                cogPivot = null; 
                                
                                showStatus("Kontainer berhasil diturunkan.", 'success');
                                craneLiftBtn.textContent = '⬆️ Angkat Kontainer';
                                craneLiftBtn.disabled = false;
                            })
                            .start();
                    })
                    .start();
            })
            .start();
    }
}

// --- 5. DRAG CONTROL LOGIC ---

/** Mengaktifkan mode Drag untuk item roll */
function activateMoveMode() {
    if (isMoveModeActive) return;
    
    // Pastikan kita tidak dalam mode angkat
     if (cogPivot && cogPivot.parent && cogPivot.parent.name === 'CraneHookSpreader') {
        showStatus("Tidak dapat mengaktifkan mode Drag saat kontainer sedang diangkat.", 'error');
        return;
    }

    // Pastikan Roll adalah anak dari SCENE (tidak sedang diangkat)
    const draggableObjects = itemsInScene.filter(item => item.userData.isRoll && item.parent === scene);
    
    if (draggableObjects.length === 0) {
        showStatus("Tidak ada roll yang bisa dipindahkan atau roll sedang terangkat.", 'error');
        return;
    }

    isMoveModeActive = true;
    controls.enabled = false; 
    
    // Inisialisasi DragControls
    dragControls = new THREE.DragControls(draggableObjects, camera, renderer.domElement);
    
    dragControls.addEventListener('dragstart', function (event) {
        controls.enabled = false;
        event.object.material.color.set(0xff00ff); 
        event.object.material.opacity = 0.5; 
    });

    dragControls.addEventListener('drag', function (event) {
        const rollRadius = event.object.userData.rollRadius || 0.5;
        const rollHeight = event.object.userData.rollHeight || 1.0; 
        
        // Batasi pergerakan di sumbu Y (ketinggian roll)
        event.object.position.y = rollHeight / 2; 

        // Batasi pergerakan di dalam moda (X: L, Z: W)
        const { L, W } = currentModa;
        const halfL = L / 2;
        const halfW = W / 2;

        // Batas X (Panjang)
        event.object.position.x = Math.max(-halfL + rollRadius, Math.min(halfL - rollRadius, event.object.position.x));
        // Batas Z (Lebar)
        event.object.position.z = Math.max(-halfW + rollRadius, Math.min(halfW - rollRadius, event.object.position.z));
    });

    dragControls.addEventListener('dragend', function (event) {
        controls.enabled = true;
        event.object.material.color.set(event.object.userData.originalColor); 
        event.object.material.opacity = 1.0; 
        
        // Setelah drag selesai, hitung ulang COG
        calculateCogAndDisplay();
    });

    document.getElementById('move-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = 'inline-block';
    showStatus("Mode Atur Posisi (Drag) AKTIF. Pindahkan roll dengan mouse.", 'warning');
}

/** Menonaktifkan Mode Drag */
function deactivateMoveMode() {
    isMoveModeActive = false;
    controls.enabled = true; // Aktifkan kembali OrbitControls
    
    if (dragControls) {
        dragControls.dispose(); // Hapus event listener DragControls
    }
    document.getElementById('move-btn').style.display = 'inline-block';
    document.getElementById('save-btn').style.display = 'none';
    
    // Hitung ulang COG setelah selesai
    calculateCogAndDisplay(); 
    showStatus("Mode Atur Posisi NONAKTIF. Posisi disimpan (secara lokal/global).", 'info');
}

// --- 6. LOGIKA DATA & UI ---

/** Mengambil data material dari Firestore */
async function fetchMaterialData(materialID) {
    if (!db) {
         console.warn("Firebase DB tidak aktif. Tidak dapat mengambil data.");
         return null;
    }
    try {
        const materialRef = db.collection('materials').doc(materialID.toUpperCase());
        const doc = await materialRef.get();

        if (doc.exists) {
            return doc.data();
        } else {
            return null;
        }
    } catch (error) {
        console.error("Kesalahan saat mengambil data material dari Firebase:", error);
        showStatus(`Gagal mengambil data untuk ID ${materialID}. Cek Aturan Keamanan Firebase!`, 'danger');
        return null;
    }
}

/** Menambahkan item roll baru ke UI */
function addMaterialItem() {
    const template = document.getElementById('material-item-template');
    const clone = template.content.cloneNode(true);
    const container = document.getElementById('material-list');
    
    const itemDiv = clone.querySelector('.material-item');
    const idInput = itemDiv.querySelector('.material-id');
    const removeBtn = itemDiv.querySelector('.remove-material-btn');

    // Event Listener untuk Remove Button
    removeBtn.addEventListener('click', () => {
        itemDiv.remove();
        visualizePlannerItems(); // Perbarui visualisasi setelah menghapus
    });

    // Event Listener untuk mencari ID di Firebase/mengisi dimensi
    idInput.addEventListener('change', async (e) => {
        const materialID = e.target.value.trim().toUpperCase();
        
        // --- PERUBAHAN KRUSIAL 1: Force D = 1.2m ---
        const FORCED_D_ALAS = 1.2; 
        
        if (materialID.length > 0) {
            const data = await fetchMaterialData(materialID);
            
            const dimD = itemDiv.querySelector('.dim-d');
            const dimH = itemDiv.querySelector('.dim-h-cyl');
            const weightInput = itemDiv.querySelector('.weight');

            if (data) {
                // Lebar Roll DB (Lebar Roll di DB) -> Digunakan sebagai Tinggi (H_roll) di Three.js
                const dbWidth = data.width ? data.width.toFixed(2) : 1.25;
                
                // BARU (Tukar D dan T di UI):
                // D (Diameter Alas) diisi dari permintaan user: 1.2m
                dimD.value = FORCED_D_ALAS.toFixed(2); 
                // T (Tinggi Roll) diisi dari Lebar Roll DB (dbWidth)
                dimH.value = dbWidth;
                
                // Berat <- Mengambil field 'weight'
                weightInput.value = data.weight ? data.weight.toFixed(0) : 800;

                showStatus(`Data material '${materialID}' ditemukan dari Firebase. D dipaksa menjadi 1.2m.`, 'info');
            } else {
                // Nilai Default D (Diameter Alas) = 1.2m (FORCED), T (Tinggi Roll) = 1.25m, Berat = 800kg
                // BARU (Tukar D dan T di UI):
                dimD.value = FORCED_D_ALAS.toFixed(2); 
                dimH.value = 1.25; 
                weightInput.value = 800;
                showStatus(`Material ID '${materialID}' tidak ditemukan di Firebase. Menggunakan nilai default. D=1.2m.`, 'warning');
            }
            // Perbarui visualisasi setelah data diisi
            visualizePlannerItems(); 
        }
    });

    // Event Listener untuk perubahan Quantity, D, H, atau Weight
    const inputsToWatch = itemDiv.querySelectorAll('input[type="number"]');
    inputsToWatch.forEach(input => {
        // PERBAIKAN: Gunakan 'input' agar lebih responsif
        input.addEventListener('input', visualizePlannerItems);
    });

    container.appendChild(clone);
    // Panggil event change secara manual pada item yang baru ditambahkan
    const defaultID = `ROLL-${Math.floor(Math.random() * 1000)}`;
    idInput.value = defaultID;
    
    // Set nilai default yang logis (Diameter Alas: 1.2m (FORCED), Tinggi Roll: 1.25m, Berat: 800kg)
    // BARU (Tukar D dan T di UI):
    itemDiv.querySelector('.dim-d').value = 1.20; 
    itemDiv.querySelector('.dim-h-cyl').value = 1.25;
    itemDiv.querySelector('.weight').value = 800;
    
    // Perbarui visualisasi setelah penambahan
    visualizePlannerItems(); 
}

/** * Memproses data tempel (Paste) untuk Import. */
function importMaterialFromPaste() {
    const dataText = document.getElementById('import-data').value.trim();
    if (dataText.length === 0) {
        showModal('Error', 'Input data kosong.', 'danger');
        return;
    }

    const lines = dataText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
        showModal('Error', 'Tidak ada data yang valid untuk diimport.', 'danger');
        return;
    }

    if (typeof firebase === 'undefined' || !firebase.firestore) {
        return showStatus('Firebase belum diinisialisasi. Cek koneksi API Key Anda.', 'danger');
    }

    const db = firebase.firestore();
    const batch = db.batch();
    const materialsCollection = db.collection('materials');
    
    // --- KONFIGURASI NILAI DEFAULT (DIREVISI) ---
    const FORCED_D_BASE = 1.2; 
    const DEFAULT_H_ROLL = 1.25; 
    const DEFAULT_QTY = 1;

    let importedCount = 0;
    let batchWriteCount = 0;
    const materialList = document.getElementById('material-list');
    
    // Hapus semua item yang sudah ada
    materialList.innerHTML = ''; 

    lines.forEach(line => {
        // Coba pisahkan dengan koma (CSV) atau tab/spasi (data dari Excel)
        let parts = line.split(/\s*[\t,]\s*/).filter(p => p.trim() !== '');
        
        if (parts.length < 3) return; 

        const materialID = parts[0]?.trim().toUpperCase();
        let description = parts[1]?.trim() || 'N/A';
        
        let dimD, dimH, weight, quantity;

        // --- LOGIKA CERDAS: MENGATASI INPUT 3 KOLOM ANDA ---
        if (parts.length >= 3 && parts.length <= 5) { 
            
            // 1. Ambil Berat (sebagai Ton) dari kolom terakhir
            let weight_ton = parseFloat(parts[parts.length - 1]?.replace(',', '.'));
            if (isNaN(weight_ton)) return; 
            
            weight = Math.round(weight_ton * 1000); // Konversi Ton ke Kg
            
            // 2. Set Dimensi
            dimD = FORCED_D_BASE; // DIPAKSA 1.2m
            dimH = DEFAULT_H_ROLL; // Default Tinggi Roll: 1.25m
            quantity = DEFAULT_QTY;

        } else if (parts.length >= 6) {
            // --- LOGIKA STANDAR ASLI: 6 Kolom CSV ---
            dimH = parseFloat(parts[2]?.replace(',', '.')); // Tinggi Roll (DB Diameter)
            dimD = FORCED_D_BASE; // DIPAKSA 1.2m
            
            weight = parseInt(parts[4]?.trim()); // Berat (Kg)
            quantity = parseInt(parts[5]?.trim());
            
            if (isNaN(dimH) || isNaN(weight) || isNaN(quantity) || quantity <= 0) return; 
        } else {
            return; 
        }

        // --- BATCH WRITE KE FIREBASE ---
        const materialRef = materialsCollection.doc(materialID);
        batch.set(materialRef, {
            materialID: materialID,
            description: description,
            diameter: dimH, // Diameter DB (Tinggi Three.js)
            width: dimD, // Width DB (Diameter Alas Three.js) - DIPAKSA 1.2
            weight: weight, 
            shape: 'CYLINDER'
        }, { merge: true }); 
        batchWriteCount++;


        // --- TAMBAHKAN KE UI (Tukar D dan T) ---
        const template = document.getElementById('material-item-template');
        const clone = template.content.cloneNode(true);
        const itemDiv = clone.querySelector('.material-item');

        itemDiv.querySelector('.material-id').value = materialID;
        itemDiv.querySelector('.dim-d').value = dimD.toFixed(2); // DITETAPKAN 1.2
        itemDiv.querySelector('.dim-h-cyl').value = dimH.toFixed(2); 
        itemDiv.querySelector('.weight').value = weight.toFixed(0);
        itemDiv.querySelector('.quantity').value = quantity;
        
        // Tambahkan event listeners yang diperlukan
        const removeBtn = itemDiv.querySelector('.remove-material-btn');
        removeBtn.addEventListener('click', () => {
            itemDiv.remove();
            visualizePlannerItems();
        });
        
        const inputsToWatch = itemDiv.querySelectorAll('input[type="number"]');
        inputsToWatch.forEach(input => {
            // PERBAIKAN: Gunakan 'input' agar lebih responsif
            input.addEventListener('input', visualizePlannerItems);
        });

        materialList.appendChild(clone);
        importedCount++;
        
    }); 

    // COMMIT BATCH
    if (batch && batchWriteCount > 0) {
        batch.commit()
            .then(() => {
                showModal('Import Berhasil', `${importedCount} item berhasil diimport ke UI. ${batchWriteCount} material unik disimpan/diperbarui di Firebase (D Alas dipaksa 1.2m)!`, 'success');
            })
            .catch(error => {
                console.error("Batch write failed:", error);
                showModal('Import Berhasil (UI Only)', `${importedCount} item berhasil diimport ke UI. Gagal menyimpan ke Firebase: ${error.message}`, 'warning');
            });
    } else {
        showModal('Import Berhasil', `${importedCount} item berhasil diimport ke UI.`, 'success');
    }
    
    autoRecommendPlacement(); // Perbarui visualisasi setelah semua diimport
    document.getElementById('import-data').value = ''; // Kosongkan textarea
}


/** Hitung COG (X) dari item-item di scene dan perbarui tampilan. */
function calculateCogAndDisplay() {
    let totalWeight = 0;
    let totalMomentX = 0; // Σ(Berat * Posisi X)
    
    // Ambil data posisi dan berat dari itemsInScene
    itemsInScene.forEach(item => {
        // Asumsi item.userData.weight sudah terisi saat pembuatan roll
        const weight = item.userData.weight || 0; 
        const posX = item.position.x; 
        
        if (weight > 0) {
            totalMomentX += weight * posX;
            totalWeight += weight;
        }
    });
    
    // Hitung COG (Center of Gravity)
    const cogX = totalWeight > 0 ? (totalMomentX / totalWeight) : 0;
    currentCogX = cogX; // Simpan di global untuk animasi crane

    // 4. Perbarui Status dan COG
    const weightStatus = document.getElementById('weight-status');
    const maxWeight = currentModa.maxWeight;
    
    // Titik Tengah Kontainer (Sumbu X): 0
    // Toleransi 5% dari panjang kontainer (L)
    const COG_THRESHOLD = currentModa.L * 0.05; 
    
    const balanceStatus = Math.abs(cogX) <= COG_THRESHOLD ? 'SEIMBANG' : 'TIDAK SEIMBANG';
    
    // Update display COG dan Status Berat
    weightStatus.innerHTML = `Total Berat: ${totalWeight.toLocaleString()} kg / ${maxWeight.toLocaleString()} kg <br> **COG (X): ${cogX.toFixed(2)}m** (Status: ${balanceStatus})`;
    
    let statusType = 'info';
    let statusMessage = `Total Berat: ${totalWeight.toLocaleString()} kg. COG X: ${cogX.toFixed(2)}m.`;

    if (totalWeight > maxWeight) {
        statusType = 'danger';
        statusMessage = `PERINGATAN: Total berat (${totalWeight.toLocaleString()} kg) melebihi batas (${maxWeight.toLocaleString()} kg)!`;
    } else if (Math.abs(cogX) > COG_THRESHOLD) {
        statusType = 'warning';
        statusMessage = `PERINGATAN: COG (X) ${cogX.toFixed(2)}m di luar batas ${COG_THRESHOLD.toFixed(2)}m. Keseimbangan perlu diatur ulang.`;
    } else {
        statusType = 'success';
        statusMessage = `Total Berat OK dan COG SEIMBANG. COG X: ${cogX.toFixed(2)}m.`;
    }

    weightStatus.classList.remove('info', 'success', 'warning', 'danger');
    weightStatus.classList.add(statusType);
    showStatus(statusMessage, statusType);

    // Kembalikan total berat
    return totalWeight;
}


/** * FUNGSI UTAMA BARU: REKOMENDASI PENEMPATAN OTOMATIS
 * Mengatur penempatan Roll ke dalam kontainer dengan logika multi-baris, penumpukan dasar,
 * dan implementasi pola Zig-Zag.
 */
function autoRecommendPlacement(placementMode = 'ZIGZAG') { // Tambahkan parameter opsional
    // 1. Bersihkan Scene
    itemsInScene.forEach(item => scene.remove(item));
    itemsInScene.length = 0;
    
    // 2. Kumpulkan dan validasi data material
    const materialItems = document.querySelectorAll('#material-list .material-item');
    let allItems = [];
    
    const maxH = currentModa.type === 'LOSSBAK' ? 1000 : currentModa.H; 

    materialItems.forEach(item => {
        const idInput = item.querySelector('.material-id');
        const qtyInput = item.querySelector('.quantity');
        const shapeType = item.querySelector('.shape-type').value; 
        
        let dims = {};
        let weight = 0;
        
        if (shapeType === 'CYLINDER') {
            dims.D_alas = parseFloat(item.querySelector('.dim-d').value);
            dims.H_roll = parseFloat(item.querySelector('.dim-h-cyl').value); 
            weight = parseFloat(item.querySelector('.weight').value) || 0;
        } else {
            return; 
        }
        
        const quantity = parseInt(qtyInput.value);
        if (isNaN(quantity) || quantity <= 0 || isNaN(dims.D_alas)) return;

        const rollRadius = dims.D_alas / 2;
        const rollHeight = dims.H_roll;
        
        // Validasi Dimensi
        if (rollHeight > maxH) {
             showStatus(`Roll ID: ${idInput.value} (Tinggi: ${rollHeight}m) terlalu tinggi! Max: ${maxH.toFixed(2)}m`, 'danger');
             return;
        }
        if (dims.D_alas > currentModa.W) {
             showStatus(`Roll ID: ${idInput.value} (Dia. Alas: ${dims.D_alas}m) terlalu lebar! Max: ${currentModa.W.toFixed(2)}m`, 'danger');
             return;
        }
        
        // Tambahkan semua roll ke array untuk diproses
        for (let i = 0; i < quantity; i++) {
            // Beri bobot yang lebih tinggi pada roll terberat
            allItems.push({
                id: idInput.value,
                radius: rollRadius,
                height: rollHeight,
                dimD: dims.D_alas,
                dimH: dims.H_roll,
                weight: weight,
                color: new THREE.Color(Math.random() * 0xffffff)
            });
        }
    });

    // 3. Algoritma Penempatan (Zig-Zag & Multi-Baris Z)
    
    // Urutkan item berdasarkan bobot (berat) tertinggi untuk menempatkan yang terberat di tengah (COG)
    allItems.sort((a, b) => b.weight - a.weight);
    
    const { L, W } = currentModa;
    const halfL = L / 2;
    const halfW = W / 2;
    
    // Inisialisasi posisi
    let currentX_Line1 = -halfL; // Baris 1 (Paling Kiri/Bawah)
    let currentX_Line2 = -halfL; // Baris 2 (Untuk Zig-Zag)
    let loadedCount = 0;
    
    // --- VARIABEL Z BARU ---
    let currentZ_start = -halfW; 
    let maxZ_used = -halfW; 
    let isLine1 = true; // Status: Menempatkan di Baris 1 (Kiri/Bawah) atau Baris 2 (Kanan/Atas)

    let rollIndex = 0;
    
    while(rollIndex < allItems.length) {
        const roll = allItems[rollIndex];
        const requiredSpaceX = roll.dimD; // Roll berdiri, jadi Panjang di X adalah Diameter Alas
        const requiredSpaceZ = roll.dimD; // Lebar di Z adalah Diameter Alas
        const rollRadius = roll.radius;
        const rollHeight = roll.dimH;
        
        // Cek Batas Z (Lebar) - Ini adalah batas awal baris, belum batas Zig-Zag
        if (currentZ_start + requiredSpaceZ > halfW) {
            // Tidak ada ruang lagi di Lebar Z. Hentikan pemuatan.
            showStatus(`Tidak cukup ruang lagi di lebar moda (Z). ${allItems.length - loadedCount} roll tidak dimuat.`, 'warning');
            break;
        }

        // --- Tentukan Posisi Berdasarkan Mode (Zig-Zag) ---
        let rollPosX, rollPosZ;
        let lineFull = false;
        
        let isCurrentLine1 = isLine1;
        if (placementMode !== 'ZIGZAG') {
            isCurrentLine1 = true; // Force mode linear (Baris 1 saja)
        }
        
        if (isCurrentLine1) { // Baris Kiri/Bawah (Standard placement)
            if (currentX_Line1 + requiredSpaceX > halfL) {
                lineFull = true;
            } else {
                rollPosX = currentX_Line1 + rollRadius; 
                rollPosZ = currentZ_start + rollRadius;
                currentX_Line1 += requiredSpaceX; 
                currentX_Line2 = currentX_Line1; // Sinkronkan X Line 2 jika mode linear
            }
        } else { // Baris Kanan/Atas (Untuk Zig-Zag)
             // Dalam mode Zig-Zag, baris 2 dimulai dari awal kontainer
             if (currentX_Line2 + requiredSpaceX > halfL) {
                lineFull = true;
            } else {
                // Penempatan Baris 2 untuk Zig-Zag: Geser setengah diameter ke Z positif (belakang)
                const zigZagZ_offset = requiredSpaceZ / 2; 
                rollPosZ = currentZ_start + zigZagZ_offset + rollRadius; 
                
                // Cek Batas Z Zig-Zag (Pastikan tidak keluar dari W)
                if (rollPosZ + rollRadius > halfW) {
                    // Roll zig-zag tidak muat karena terlalu lebar
                    lineFull = true; // Anggap baris ini penuh dan pindah Z
                } else {
                    rollPosX = currentX_Line2 + rollRadius;
                    currentX_Line2 += requiredSpaceX;
                    currentX_Line1 = currentX_Line2; // Sinkronkan X Line 1
                }
            }
        }
        
        if (lineFull) {
            // Garis X penuh/tidak muat. Pindah ke Baris Z berikutnya.
            currentX_Line1 = -halfL; // Reset X Baris 1
            currentX_Line2 = -halfL; // Reset X Baris 2
            
            // Jika kita gagal menempatkan di Baris 2 Zig-Zag, kita harus menggunakan batas Z yang sama
            // dan mencoba lagi dari Baris 1 pada gulungan yang sama.
            if (!isLine1 && placementMode === 'ZIGZAG') {
                 // Roll ini terlalu besar untuk Zig-Zag. Coba lagi dari Baris 1 di baris Z yang sama.
                 isLine1 = true;
                 continue; // Ulangi iterasi untuk roll yang sama, mencoba Baris 1
            }

            // Jika kita gagal di Baris 1, atau gagal lagi setelah mencoba Baris 1.
            currentZ_start = maxZ_used; // Posisi Z baru dimulai dari batas roll terluar sebelumnya
            isLine1 = true; // Selalu mulai baris Z baru dengan Baris 1
            
            // Perlu cek batas Z lagi setelah update currentZ_start
            if (currentZ_start + requiredSpaceZ > halfW) {
                showStatus(`Tidak cukup ruang lagi di lebar moda (Z). ${allItems.length - loadedCount} roll tidak dimuat.`, 'warning');
                break; 
            }
            continue; // Ulangi iterasi untuk roll yang sama
        }
        
        // --- FINAL PENEMPATAN ---
        
        const rollMesh = createRollMesh(rollRadius, rollHeight, roll.color, roll.id); 
        // Simpan berat di userData untuk perhitungan COG nanti
        rollMesh.userData.weight = roll.weight; 
        
        rollMesh.position.set(
            rollPosX, 
            rollHeight / 2, 
            rollPosZ
        ); 
        
        scene.add(rollMesh);
        itemsInScene.push(rollMesh);
        
        loadedCount++;
        
        // Perbarui batas Z terjauh yang digunakan di baris ini
        maxZ_used = Math.max(maxZ_used, rollPosZ + rollRadius); 
        
        // Pindah ke baris berikutnya (Zig-Zag)
        if (placementMode === 'ZIGZAG') {
            isLine1 = !isLine1; // Ganti baris (Baris 1 <-> Baris 2)
        } else {
            // Mode Linear
            isLine1 = true; // Tetap di Baris 1
        }
        
        rollIndex++; 
    }

    // 4. Panggil fungsi COG terpusat
    calculateCogAndDisplay();
}


/** Memvisualisasikan semua item planner (Roll) */
function visualizePlannerItems() {
    // Fungsi ini kini memanggil fungsi rekomendasi otomatis
    autoRecommendPlacement();
}


// --- 7. INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    
    initThreeJS(); 
    visualizeContainerFrame();

    // Tambahkan 1 item default saat inisialisasi
    addMaterialItem();

    // Event listener untuk tombol utama
    document.getElementById('add-material-btn')?.addEventListener('click', addMaterialItem);
    document.getElementById('visualize-btn')?.addEventListener('click', visualizePlannerItems);
    
    // EVENT LISTENER BARU UNTUK REKOMENDASI OTOMATIS
    document.getElementById('auto-recommend-btn')?.addEventListener('click', autoRecommendPlacement);
    
    // Event listener untuk Move Mode (Drag)
    document.getElementById('move-btn')?.addEventListener('click', activateMoveMode);
    document.getElementById('save-btn')?.addEventListener('click', deactivateMoveMode);
    
    // Event listener untuk Tombol Crane
    document.getElementById('crane-toggle-btn')?.addEventListener('click', toggleCraneVisual); 
    document.getElementById('crane-lift-btn')?.addEventListener('click', animateCraneLift); 
    
    // Event listener untuk Import Data
    document.getElementById('import-btn')?.addEventListener('click', importMaterialFromPaste);

    // Event listener untuk pemilihan Moda Kontainer
    document.getElementById('moda-selector')?.addEventListener('change', (e) => {
        const modaKey = e.target.value;
        if (MODA_DIMENSIONS[modaKey]) {
            currentModa = MODA_DIMENSIONS[modaKey];
            visualizeContainerFrame(); // Perbarui kerangka kontainer
            autoRecommendPlacement(); // Perbarui visualisasi roll
            showStatus(`Moda diubah ke ${currentModa.name}.`, 'info');
        }
    });
    
    // Event listener untuk Modal
    document.querySelector('.modal-ok-btn')?.addEventListener('click', () => {
        document.getElementById('custom-modal').style.display = 'none';
    });
});