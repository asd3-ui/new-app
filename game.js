const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// إعداد اللغات (عربي / إنجليزي)
const translations = {
    ar: {
        title: "دنجن رايكاست ثلاثي الأبعاد",
        desc: "استكشف 4 بيئات فريدة ومظلمة، اجمع المفاتيح، وتهرب من الوحوش الذكية!",
        startBtn: "ابدأ المغامرة",
        langBtn: "English 🌐",
        health: "الصحة",
        level: "المستوى",
        keys: "المفاتيح",
        gameOverTitle: "انتهت اللعبة",
        gameOverText: "لقد قضت عليك وحوش الدنجن!",
        victoryTitle: "مبروك الفوز الأسطوري!",
        victoryText: "لقد أكملت جميع المراحل والبيئات بنجاح!",
        restartBtn: "إعادة المحاولة",
        envNames: ["زنزانة حجرية", "كهف جليدي", "حصن الحمم", "سرداب الأشباح"]
    },
    en: {
        title: "Dungeon Raycast 3D",
        desc: "Explore 4 unique dark environments, collect keys, and escape from smart monsters!",
        startBtn: "Start Adventure",
        langBtn: "العربية 🌐",
        health: "Health",
        level: "Level",
        keys: "Keys",
        gameOverTitle: "Game Over",
        gameOverText: "You were defeated by the dungeon monsters!",
        victoryTitle: "Epic Victory!",
        victoryText: "You successfully completed all stages and environments!",
        restartBtn: "Try Again",
        envNames: ["Stone Dungeon", "Ice Cave", "Lava Fortress", "Ghost Crypt"]
    }
};

let currentLang = 'ar';
let gameState = 'MENU'; // 'MENU', 'PLAYING', 'GAMEOVER', 'VICTORY'
let currentLevel = 1;
const maxLevels = 4;
let mapWidth = 22;
let mapHeight = 22;
let maze = [];
let player = { x: 1.5, y: 1.5, angle: 0, health: 100, keys: 0 };
let exitPos = { x: 20.5, y: 20.5 };
let enemies = [];

// بيئات اللعبة المتعددة لكل مستوى
const environments = [
    { wall: [110, 110, 120], floor: [30, 30, 40], ceiling: [15, 15, 20] },   // مستوى 1: زنزانة حجرية
    { wall: [70, 130, 170],  floor: [20, 35, 55],  ceiling: [10, 18, 28] },   // مستوى 2: كهف جليدي
    { wall: [170, 60, 40],   floor: [45, 18, 12],  ceiling: [22, 8, 6] },     // مستوى 3: حصن الحمم
    { wall: [90, 40, 130],   floor: [22, 12, 32],  ceiling: [10, 5, 15] }     // مستوى 4: سرداب الأشباح
];

// تحديث النصوص بناءً على اللغة المتاحة
function updateUIText() {
    const t = translations[currentLang];
    document.getElementById('menu-title').innerText = t.title;
    document.getElementById('menu-desc').innerText = t.desc;
    document.getElementById('start-btn').innerText = t.startBtn;
    document.getElementById('lang-btn').innerText = t.langBtn;
    document.getElementById('healthLabel').innerText = t.health;
    document.getElementById('levelLabel').innerText = t.level;
    document.getElementById('keysLabel').innerText = t.keys;
    document.getElementById('restart-btn').innerText = t.restartBtn;
    
    document.getElementById('htmlRoot').setAttribute('lang', currentLang);
    document.getElementById('htmlRoot').setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
}

// زر تغيير اللغة
document.getElementById('lang-btn').addEventListener('click', () => {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    updateUIText();
});

// زر بدء اللعبة
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('touch-controls').classList.remove('hidden');
    gameState = 'PLAYING';
    currentLevel = 1;
    initLevel();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
});

// زر إعادة المحاولة
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('modal-screen').classList.add('hidden');
    gameState = 'PLAYING';
    currentLevel = 1;
    player.health = 100;
    initLevel();
    lastTime = performance.now();
});

// مولد المتاهات الإجرائي
function generateMaze(level) {
    let m = Array.from({length: mapHeight}, () => Array(mapWidth).fill(1));
    let stack = [[1, 1]];
    m[1][1] = 0;

    while(stack.length > 0) {
        let [cx, cy] = stack[stack.length - 1];
        let neighbors = [];
        let dirs = [[-2,0], [2,0], [0,-2], [0,2]];
        for(let [dx, dy] of dirs) {
            let nx = cx + dx, ny = cy + dy;
            if(nx > 0 && nx < mapWidth - 1 && ny > 0 && ny < mapHeight - 1 && m[ny][nx] === 1) {
                neighbors.push([nx, ny, dx, dy]);
            }
        }
        if(neighbors.length > 0) {
            let [nx, ny, dx, dy] = neighbors[Math.floor(Math.random() * neighbors.length)];
            m[cy + dy/2][cx + dx/2] = 0;
            m[ny][nx] = 0;
            stack.push([nx, ny]);
        } else {
            stack.pop();
        }
    }

    m[mapHeight - 2][mapWidth - 2] = 4; // بوابة الخروج
    exitPos = { x: mapWidth - 2 + 0.5, y: mapHeight - 2 + 0.5 };

    let keysPlaced = 0;
    while(keysPlaced < level + 1) {
        let kx = Math.floor(Math.random() * (mapWidth - 2)) + 1;
        let ky = Math.floor(Math.random() * (mapHeight - 2)) + 1;
        if(m[ky][kx] === 0) {
            m[ky][kx] = 3; // المفتاح
            keysPlaced++;
        }
    }
    return m;
}

function initLevel() {
    maze = generateMaze(currentLevel);
    player.x = 1.5;
    player.y = 1.5;
    player.keys = 0;
    // زيادة عدد وسرعة الأعداء تدريجياً مع تقدم المستويات
    enemies = [
        { x: 12.5, y: 12.5, speed: 1.2 + currentLevel * 0.2 },
        { x: 17.5, y: 5.5, speed: 1.4 + currentLevel * 0.2 }
    ];
}

let moveInput = { x: 0, y: 0 };
let turnInput = 0;

// دعم اللمس الافتراضي (Joysticks)
const jBase = document.getElementById('joystick-base');
const jHandle = document.getElementById('joystick-handle');
let jActive = false, jTouchId = null, jCenter = { x: 0, y: 0 };

jBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    let touch = e.changedTouches[0];
    jTouchId = touch.identifier;
    jActive = true;
    let rect = jBase.getBoundingClientRect();
    jCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
});

const tBase = document.getElementById('turn-joystick-base');
const tHandle = document.getElementById('turn-joystick-handle');
let tActive = false, tTouchId = null, tCenter = { x: 0, y: 0 };

tBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    let touch = e.changedTouches[0];
    tTouchId = touch.identifier;
    tActive = true;
    let rect = tBase.getBoundingClientRect();
    tCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
});

window.addEventListener('touchmove', (e) => {
    for(let touch of e.changedTouches) {
        if(jActive && touch.identifier === jTouchId) {
            let dx = touch.clientX - jCenter.x;
            let dy = touch.clientY - jCenter.y;
            let dist = Math.hypot(dx, dy);
            let maxDist = 38;
            if(dist > maxDist) { dx = (dx/dist)*maxDist; dy = (dy/dist)*maxDist; }
            jHandle.style.transform = `translate(${dx}px, ${dy}px)`;
            moveInput.x = dx / maxDist;
            moveInput.y = dy / maxDist;
        }
        if(tActive && touch.identifier === tTouchId) {
            let dx = touch.clientX - tCenter.x;
            let maxDist = 38;
            if(Math.abs(dx) > maxDist) dx = Math.sign(dx) * maxDist;
            tHandle.style.transform = `translate(${dx}px, 0px)`;
            turnInput = dx / maxDist;
        }
    }
});

window.addEventListener('touchend', (e) => {
    for(let touch of e.changedTouches) {
        if(jActive && touch.identifier === jTouchId) {
            jActive = false; jTouchId = null;
            jHandle.style.transform = `translate(0px, 0px)`;
            moveInput.x = 0; moveInput.y = 0;
        }
        if(tActive && touch.identifier === tTouchId) {
            tActive = false; tTouchId = null;
            tHandle.style.transform = `translate(0px, 0px)`;
            turnInput = 0;
        }
    }
});

// دعم لوحة المفاتيح للكمبيوتر
let keysPressed = {};
window.addEventListener('keydown', e => keysPressed[e.key] = true);
window.addEventListener('keyup', e => keysPressed[e.key] = false);

let lastTime = performance.now();
function gameLoop(time) {
    if (gameState !== 'PLAYING') return;

    let dt = (time - lastTime) / 1000;
    lastTime = time;

    let mX = moveInput.x, mY = moveInput.y, tDir = turnInput;
    if(keysPressed['ArrowUp'] || keysPressed['w']) mY = -1;
    if(keysPressed['ArrowDown'] || keysPressed['s']) mY = 1;
    if(keysPressed['ArrowLeft'] || keysPressed['a']) tDir = -1;
    if(keysPressed['ArrowRight'] || keysPressed['d']) tDir = 1;

    player.angle += tDir * 2.5 * dt;

    if(mX !== 0 || mY !== 0) {
        let cosA = Math.cos(player.angle), sinA = Math.sin(player.angle);
        let speed = 3.2 * dt;
        let nx = player.x + (mX * cosA - mY * sinA) * speed;
        let ny = player.y + (mX * sinA + mY * cosA) * speed;
        let ix = Math.floor(nx), iy = Math.floor(ny);
        if(ix >= 0 && ix < mapWidth && iy >= 0 && iy < mapHeight) {
            if(maze[iy][ix] === 0 || maze[iy][ix] === 3) {
                if(maze[iy][ix] === 3) { maze[iy][ix] = 0; player.keys++; }
                player.x = nx; player.y = ny;
            }
        }
    }

    // التحقق من اجتياز المستوى والانتقال للبيئة التالية
    if(Math.hypot(player.x - exitPos.x, player.y - exitPos.y) < 0.5) {
        if(currentLevel < maxLevels) {
            currentLevel++;
            initLevel();
        } else {
            gameState = 'VICTORY';
            const t = translations[currentLang];
            document.getElementById('modal-title').innerText = t.victoryTitle;
            document.getElementById('modal-text').innerText = t.victoryText;
            document.getElementById('modal-screen').classList.remove('hidden');
            return;
        }
    }

    // تحديث حركة الأعداء
    for(let en of enemies) {
        let dx = player.x - en.x, dy = player.y - en.y;
        let dist = Math.hypot(dx, dy);
        if(dist > 0.4) {
            en.x += (dx / dist) * en.speed * dt;
            en.y += (dy / dist) * en.speed * dt;
        } else {
            player.health -= 20 * dt;
            if(player.health <= 0) {
                gameState = 'GAMEOVER';
                const t = translations[currentLang];
                document.getElementById('modal-title').innerText = t.gameOverTitle;
                document.getElementById('modal-text').innerText = t.gameOverText;
                document.getElementById('modal-screen').classList.remove('hidden');
                return;
            }
        }
    }

    // تحديث الواجهة
    document.getElementById('healthText').innerText = Math.max(0, Math.floor(player.health));
    document.getElementById('levelText').innerText = currentLevel;
    document.getElementById('keysText').innerText = player.keys;
    let envIdx = (currentLevel - 1) % environments.length;
    document.getElementById('envText').innerText = translations[currentLang].envNames[envIdx];

    render();
    requestAnimationFrame(gameLoop);
}

// محرك العرض والرسوميات (Raycasting)
function render() {
    let env = environments[(currentLevel - 1) % environments.length];

    // رسم السقف والأرضية بناءً على البيئة الحالية
    ctx.fillStyle = `rgb(${env.ceiling.join(',')})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height / 2);
    ctx.fillStyle = `rgb(${env.floor.join(',')})`;
    ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

    let FOV = Math.PI / 3;
    let numRays = Math.floor(canvas.width / 2.2);
    let rayAngleStep = FOV / numRays;
    let startAngle = player.angle - FOV / 2;
    let columnWidth = canvas.width / numRays;

    for(let i = 0; i < numRays; i++) {
        let rayAngle = startAngle + i * rayAngleStep;
        let distance = 0, hitWall = false, isExit = false;
        let cosA = Math.cos(rayAngle), sinA = Math.sin(rayAngle);

        while(!hitWall && distance < 16) {
            distance += 0.03;
            let testX = Math.floor(player.x + distance * cosA);
            let testY = Math.floor(player.y + distance * sinA);
            if(testX < 0 || testX >= mapWidth || testY < 0 || testY >= mapHeight) {
                hitWall = true; distance = 16;
            } else if(maze[testY][testX] > 0) {
                hitWall = true;
                if(maze[testY][testX] === 4) isExit = true;
            }
        }

        distance *= Math.cos(player.angle - rayAngle);
        let wallHeight = Math.min(canvas.height, (canvas.height / distance));
        let shade = Math.max(0.15, 1 - distance / 15);

        let r = env.wall[0] * shade;
        let g = env.wall[1] * shade;
        let b = env.wall[2] * shade;

        if(isExit) {
            r = 0; g = 220 * shade; b = 100 * shade; // مخرج مضيء باللون الأخضر المميز
        }

        ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
        ctx.fillRect(i * columnWidth, (canvas.height - wallHeight) / 2, columnWidth + 1, wallHeight);
    }

    // خريطة مصغرة احترافية (Minimap)
    let mapScale = 6;
    let mapX = 20, mapY = 20;
    ctx.fillStyle = "rgba(10, 10, 20, 0.75)";
    ctx.fillRect(mapX, mapY, mapWidth * mapScale, mapHeight * mapScale);
    
    for(let y = 0; y < mapHeight; y++) {
        for(let x = 0; x < mapWidth; x++) {
            if(maze[y][x] > 0) {
                ctx.fillStyle = maze[y][x] === 4 ? "#00ff66" : "#444";
                ctx.fillRect(mapX + x * mapScale, mapY + y * mapScale, mapScale, mapScale);
            }
        }
    }
    // موقع اللاعب على الخريطة
    ctx.fillStyle = "#ff0055";
    ctx.beginPath();
    ctx.arc(mapX + player.x * mapScale, mapY + player.y * mapScale, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

// تهيئة النصوص الافتراضية عند التحميل
updateUIText();
