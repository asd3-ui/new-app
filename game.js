const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let tileSize = 45;
let mapWidth = 19;
let mapHeight = 19;
let maze = [];
let player = { x: 1.5, y: 1.5, radius: 14, speed: 3.5, health: 100 };
let enemy = { x: 17.5, y: 17.5, radius: 14, speed: 2.1 };
let score = 0;

// مولد المتاهات الإجرائي بالمنظور العلوي
function generateMaze(width, height) {
    let m = Array.from({length: height}, () => Array(width).fill(1));
    let stack = [[1, 1]];
    m[1][1] = 0;

    while(stack.length > 0) {
        let [cx, cy] = stack[stack.length - 1];
        let neighbors = [];
        let dirs = [[-2,0], [2,0], [0,-2], [0,2]];
        for(let [dx, dy] of dirs) {
            let nx = cx + dx, ny = cy + dy;
            if(nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && m[ny][nx] === 1) {
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
    m[height - 2][width - 2] = 2; // بوابة الخروج
    return m;
}

function initGame() {
    maze = generateMaze(mapWidth, mapHeight);
    player.x = 1.5 * tileSize;
    player.y = 1.5 * tileSize;
    enemy.x = (mapWidth - 1.5) * tileSize;
    enemy.y = (mapHeight - 1.5) * tileSize;
}
initGame();

let moveInput = { x: 0, y: 0 };

// عصا التحكم الافتراضية للمس
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

window.addEventListener('touchmove', (e) => {
    for(let touch of e.changedTouches) {
        if(jActive && touch.identifier === jTouchId) {
            let dx = touch.clientX - jCenter.x;
            let dy = touch.clientY - jCenter.y;
            let dist = Math.hypot(dx, dy);
            let maxDist = 45;
            if(dist > maxDist) { dx = (dx/dist)*maxDist; dy = (dy/dist)*maxDist; }
            jHandle.style.transform = `translate(${dx}px, ${dy}px)`;
            moveInput.x = dx / maxDist;
            moveInput.y = dy / maxDist;
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
    }
});

// دعم لوحة المفاتيح للكمبيوتر
let keysPressed = {};
window.addEventListener('keydown', e => keysPressed[e.key] = true);
window.addEventListener('keyup', e => keysPressed[e.key] = false);

let lastTime = performance.now();
function gameLoop(time) {
    let dt = (time - lastTime) / 1000;
    lastTime = time;

    let mX = moveInput.x, mY = moveInput.y;
    if(keysPressed['ArrowUp'] || keysPressed['w']) mY = -1;
    if(keysPressed['ArrowDown'] || keysPressed['s']) mY = 1;
    if(keysPressed['ArrowLeft'] || keysPressed['a']) mX = -1;
    if(keysPressed['ArrowRight'] || keysPressed['d']) mX = 1;

    // حركة اللاعب مع فحص الاصطدام بالجدران
    if(mX !== 0 || mY !== 0) {
        let length = Math.hypot(mX, mY);
        let nx = player.x + (mX / length) * player.speed;
        let ny = player.y + (mY / length) * player.speed;
        
        let gx = Math.floor(nx / tileSize);
        let gy = Math.floor(ny / tileSize);
        if(gy >= 0 && gy < mapHeight && gx >= 0 && gx < mapWidth) {
            if(maze[gy][gx] !== 1) {
                player.x = nx;
                player.y = ny;
            }
        }
    }

    // مطاردة الوحش للاعب
    let edx = player.x - enemy.x;
    let edy = player.y - enemy.y;
    let edist = Math.hypot(edx, edy);
    if(edist > 1.5) {
        let enx = enemy.x + (edx / edist) * enemy.speed;
        let eny = enemy.y + (edy / edist) * enemy.speed;
        let egx = Math.floor(enx / tileSize);
        let egy = Math.floor(eny / tileSize);
        if(egy >= 0 && egy < mapHeight && egx >= 0 && egx < mapWidth) {
            if(maze[egy][egx] !== 1) {
                enemy.x = enx;
                enemy.y = eny;
            }
        }
    }

    // الاصطدام بالوحش
    if(Math.hypot(player.x - enemy.x, player.y - enemy.y) < player.radius + enemy.radius) {
        player.health -= 25;
        if(player.health <= 0) {
            player.health = 100;
            score = 0;
        }
        initGame();
    }

    // الوصول للخروج
    let pgx = Math.floor(player.x / tileSize);
    let pgy = Math.floor(player.y / tileSize);
    if(maze[pgy][pgx] === 2) {
        score += 100;
        initGame();
    }

    document.getElementById('scoreText').innerText = score;
    document.getElementById('healthText').innerText = player.health;

    render();
    requestAnimationFrame(gameLoop);
}

function render() {
    ctx.fillStyle = "#101016";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // تتبع الكاميرا للاعب في المنتصف
    let offsetX = canvas.width / 2 - player.x;
    let offsetY = canvas.height / 2 - player.y;
    ctx.translate(offsetX, offsetY);

    // رسم المتاهة
    for(let r = 0; r < mapHeight; r++) {
        for(let c = 0; c < mapWidth; c++) {
            let val = maze[r][c];
            ctx.fillStyle = val === 1 ? "#232333" : (val === 2 ? "#00e676" : "#181822");
            ctx.fillRect(c * tileSize, r * tileSize, tileSize - 2, tileSize - 2);
        }
    }

    // رسم اللاعب
    ctx.fillStyle = "#00b0ff";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    // رسم الوحش المطارد
    ctx.fillStyle = "#ff1744";
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

requestAnimationFrame(gameLoop);
