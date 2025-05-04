/*
 * File:    player.js
 *
 * Defines player viewpoint for rendering and does collision detection.
 *
 * Author:  Karl Kangur <karl.kangur@gmail.com>
 * Licence: WTFPL 2.0
 * Updated by: Ifaz2611 |
 */

function Player(world) {
    this.world = world;

    this.position = this.world.spawn;
    this.rotation = { x: 0, y: 0, z: 0 };
    this.chunk = { x: 0, z: 0 };

    this.delta = { x: 0, y: 0, z: 0 };
    this.height = 1.7;
    this.size = 0.3;
    this.speed = 5;
    this.rSpeed = 2.5;
    this.velocity = 0;
    this.fallSpeed = 8;
    this.jumpSpeed = 8;
    this.acceleration = 21;

    this.gravity = true;
    this.collision = true;
    this.firstUpdate = true;

    this.lastUpdate = Date.now();
    this.rotationMatrix = [];
    this.keys = {};
    this.collisionNodes = [];

    const player = this;

    document.addEventListener('keydown', (event) => player.onKeyEvent(event.keyCode, true));
    document.addEventListener('keyup', (event) => player.onKeyEvent(event.keyCode, false));

    this.joystick = new SQUARIFIC.framework.TouchControl(document.getElementById("joystick"), {
        pretendArrowKeys: true,
        mindistance: 25,
        middletop: 25,
        middleleft: 25
    });

    this.joystick.on("pretendKeydown", (event) => player.onKeyEvent(event.keyCode, true));
    this.joystick.on("pretendKeyup", (event) => player.onKeyEvent(event.keyCode, false));

    this.spawn();
}

Player.prototype.onKeyEvent = function (keyCode, state) {
    const key = String.fromCharCode(keyCode).toLowerCase();
    this.keys[key] = state;
    this.keys[keyCode] = state;
};

Player.prototype.spawn = function () {
    this.position = { ...this.world.spawn };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.chunk = {
        x: Math.floor(this.world.spawn.x / 16),
        z: Math.floor(this.world.spawn.z / 16)
    };
    this.world.mapGrid9(this.chunk.x, this.chunk.z);
};

Player.prototype.update = function () {
    const now = Date.now();
    this.elapsed = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    // Handle rotation
    if (this.keys[37]) this.rotation.y += this.rSpeed * this.elapsed;
    if (this.keys[39]) this.rotation.y -= this.rSpeed * this.elapsed;

    if (this.keys[38] || this.keys[40]) {
        const dy = (this.keys[38] ? 1 : -1) * this.elapsed * this.rSpeed;
        const newX = this.rotation.x + dy;
        this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newX));
    }

    // Precompute trigonometric values
    this.rotTrig = {
        cosx: Math.cos(this.rotation.x),
        sinx: Math.sin(this.rotation.x),
        cosy: Math.cos(this.rotation.y),
        siny: Math.sin(this.rotation.y)
    };

    const dx = this.speed * this.elapsed * this.rotTrig.siny;
    const dz = this.speed * this.elapsed * this.rotTrig.cosy;
    const dy = this.speed * this.elapsed;

    // Reset deltas
    this.delta.x = 0;
    this.delta.z = 0;

    if (!this.gravity) {
        this.delta.y = 0;
        this.velocity = 0;
    }

    // Movement input
    if (this.keys['w']) {
        this.delta.x -= dx;
        this.delta.z += dz;
    }
    if (this.keys['s']) {
        this.delta.x += dx;
        this.delta.z -= dz;
    }
    if (this.keys['d']) {
        this.delta.x += dz;
        this.delta.z += dx;
    }
    if (this.keys['a']) {
        this.delta.x -= dz;
        this.delta.z -= dx;
    }

    if (this.keys[32] && this.gravity && !this.delta.y) {
        this.velocity = this.jumpSpeed;
    }

    if (this.keys[33] && !this.gravity) {
        this.delta.y += dy;
    }
    if (this.keys[34] && !this.gravity) {
        this.delta.y -= dy;
    }

    if (this.gravity) {
        this.velocity = Math.max(this.velocity - this.acceleration * this.elapsed, -this.fallSpeed);
        this.delta.y = this.velocity * this.elapsed;
    }

    if (this.firstUpdate) {
        this.delta.y = 0;
        this.firstUpdate = false;
    }

    if (this.collision) {
        this.collisionDetection();
    }

    // Apply movement
    this.position.x += this.delta.x;
    this.position.y += this.delta.y;
    this.position.z += this.delta.z;

    const cx = Math.floor(this.position.x / 16);
    const cz = Math.floor(this.position.z / 16);

    if (cx !== this.chunk.x || cz !== this.chunk.z) {
        this.chunk = { x: cx, z: cz };
        this.world.mapGrid9(this.chunk.x, this.chunk.z);
    }
};

Player.prototype.collisionDetection = function () {
    const rPos = {
        x: Math.floor(this.position.x),
        y: Math.floor(this.position.y),
        z: Math.floor(this.position.z)
    };

    for (let x = rPos.x - 1; x <= rPos.x + 1; x++) {
        for (let y = rPos.y - 2; y <= rPos.y + 1; y++) {
            for (let z = rPos.z - 1; z <= rPos.z + 1; z++) {
                const node = this.world.getNode(x, y, z);
                if (node && node.type.solid) {
                    this.collisionNodes.push(node);
                }
            }
        }
    }

    for (const node of this.collisionNodes) {
        // X-axis
        if (this.delta.x &&
            this.position.z + this.size > node.z &&
            this.position.z - this.size - 1 < node.z &&
            this.position.y + this.height + 0.2 > node.y &&
            this.position.y - 1 < node.y) {

            if (this.position.x + this.size + this.delta.x >= node.x && this.position.x < node.x + 0.5) {
                this.delta.x = 0;
                this.position.x = node.x - this.size;
            } else if (this.position.x - this.size + this.delta.x <= node.x + 1 && this.position.x > node.x + 0.5) {
                this.delta.x = 0;
                this.position.x = node.x + 1 + this.size;
            }
        }

        // Z-axis
        if (this.delta.z &&
            this.position.x + this.size > node.x &&
            this.position.x - this.size - 1 < node.x &&
            this.position.y + this.height + 0.2 > node.y &&
            this.position.y - 1 < node.y) {

            if (this.position.z + this.size + this.delta.z >= node.z && this.position.z < node.z + 0.5) {
                this.delta.z = 0;
                this.position.z = node.z - this.size;
            } else if (this.position.z - this.size + this.delta.z <= node.z + 1 && this.position.z > node.z + 0.5) {
                this.delta.z = 0;
                this.position.z = node.z + 1 + this.size;
            }
        }

        // Y-axis
        if (this.position.x + this.size > node.x &&
            this.position.x - this.size - 1 < node.x &&
            this.position.z + this.size > node.z &&
            this.position.z - this.size - 1 < node.z) {

            if (this.position.y + this.height + 0.2 + this.delta.y >= node.y && this.position.y < node.y) {
                this.delta.y = -0.01;
                this.velocity = 0;
                this.position.y = node.y - this.height - 0.2;
            }

            if (this.position.y + this.delta.y <= node.y + 1) {
                this.delta.y = 0;
                this.velocity = 0;
                this.position.y = node.y + 1;
            }
        }
    }

    this.collisionNodes.length = 0;
};

Player.prototype.nodeCollision = function (node) {
    return (
        this.position.x + this.size > node.x &&
        this.position.x - this.size < node.x + 1 &&
        this.position.z + this.size > node.z &&
        this.position.z - this.size < node.z + 1 &&
        this.position.y + 0.2 > node.y &&
        this.position.y < node.y + 1
    );
};
