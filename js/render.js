/*
 * File:    render.js
 *
 * Rendering class renders world to canvas according to player's viewport.
 *
 * Author:  Karl Kangur <karl.kangur@gmail.com>
 * Licence: WTFPL 2.0 (http://en.wikipedia.org/wiki/WTFPL)
 * Updated by: Ifaz2611, 
 */

class Renderer {
    constructor(canvas, world, player) {
        this.canvas = canvas;
        this.world = world;
        this.player = player;
        this.camera = null;
        
        // Try WebGL first, fallback to 2D
        this.context = this.canvas.getContext('webgl') || this.canvas.getContext('2d');
        this.vertex = new Map();
        
        // Responsive canvas sizing
        this.resizeCanvas();
        this.w2 = Math.floor(this.canvas.width / 2);
        this.h2 = Math.floor(this.canvas.height / 2);
        
        this.focalLength = 500;
        this.nodeRenderDist = 100;
        this.chunkRenderDist = 420;
        this.workingFace = null;
        this.workingNode = null;
        this.renderNodes = [];
        this.chunkCount = 0;
        this.nodeCount = 0;
        this.faceCount = 0;
        this.vertexCount = 0;
        this.renderMode = 1; // 0: plain color, 1: textured
        this.graph = null;
        this.map = null;
        this.hud = true;
        this.mouselock = false;
        this.fps = 0;
        this.frames = 0;
        this.time = Date.now();
        this.frustrum = [];
        this.lowResChunks = [];
        
        this.n3d = {};
        this.n2d = {};
        
        // Texture loading with promise
        this.texture = new Image();
        this.texture.src = "media/texture.png";
        this.crosshair = new Image();
        this.crosshair.src = "media/crosshair.png";
        
        this.mouseClick = null;
        this.clickedNode = null;
        this.clickedFace = null;
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Async texture loading
        this.texture.onload = () => {
            this.textureSize = this.texture.width / 16;
        };
        
        this.render = this.render.bind(this);
        this.render();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth - 200;
        this.canvas.height = window.innerHeight;
        this.w2 = Math.floor(this.canvas.width / 2);
        this.h2 = Math.floor(this.canvas.height / 2);
    }

    initEventListeners() {
        this.canvas.onmousedown = (event) => {
            if (this.mouselock) {
                this.mouseClick = { x: 0, y: 0, button: event.button };
            } else {
                this.mouseClick = {
                    x: event.pageX - this.w2,
                    y: event.pageY - this.h2,
                    button: event.button
                };
            }
        };

        window.onresize = () => this.resizeCanvas();
        this.canvas.oncontextmenu = () => false;
        this.canvas.onblur = () => this.canvas.focus();
        this.canvas.focus();
    }

    lockPointer() {
        if (!('pointerLockElement' in document)) {
            console.error("Pointer lock unavailable in this browser.");
            return;
        }

        document.addEventListener('pointerlockchange', this.mouseLockChangeCallback.bind(this), false);
        this.canvas.requestPointerLock();
    }

    mouseLockChangeCallback() {
        if (document.pointerLockElement === this.canvas) {
            document.addEventListener('mousemove', this.mouseMoveCallback.bind(this), false);
            this.mouselock = true;
        } else {
            document.removeEventListener('mousemove', this.mouseMoveCallback.bind(this), false);
            this.mouselock = false;
        }
    }

    mouseMoveCallback(event) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        this.player.rotation.x -= movementY / 100;
        this.player.rotation.y -= movementX / 100;
    }

    changeRenderDist(value) {
        this.nodeRenderDist = parseInt(value);
        this.chunkRenderDist = parseInt(value) + 320;
    }

    prerender(width, height, renderFunction) {
        const buffer = document.createElement("canvas");
        buffer.width = width;
        buffer.height = height;
        renderFunction(buffer.getContext('2d'));
        return buffer;
    }

    getFrustrumPlanes() {
        const vx = { x: this.n2d.z, z: -this.n2d.x };
        const vy = {
            x: this.n3d.y * vx.z,
            y: this.n3d.z * vx.x - this.n3d.x * vx.z,
            z: -this.n3d.y * vx.x
        };

        const vectors = [
            { x: this.n3d.x * this.focalLength - vx.x * this.w2 + vy.x * this.h2,
              y: this.n3d.y * this.focalLength + vy.y * this.h2,
              z: this.n3d.z * this.focalLength - vx.z * this.w2 + vy.z * this.h2 },
            { x: this.n3d.x * this.focalLength + vx.x * this.w2 + vy.x * this.h2,
              y: this.n3d.y * this.focalLength + vy.y * this.h2,
              z: this.n3d.z * this.focalLength + vx.z * this.w2 + vy.z * this.h2 },
            { x: this.n3d.x * this.focalLength + vx.x * this.w2 - vy.x * this.h2,
              y: this.n3d.y * this.focalLength - vy.y * this.h2,
              z: this.n3d.z * this.focalLength + vx.z * this.w2 - vy.z * this.h2 },
            { x: this.n3d.x * this.focalLength - vx.x * this.w2 - vy.x * this.h2,
              y: this.n3d.y * this.focalLength - vy.y * this.h2,
              z: this.n3d.z * this.focalLength - vx.z * this.w2 - vy.z * this.h2 }
        ];

        let length;
        for (let i = 0; i < 4; i++) {
            const v1 = vectors[i];
            const v2 = vectors[(i + 1) % 4];
            
            this.frustrum[i] = {
                x: v1.y * v2.z - v1.z * v2.y,
                y: v1.z * v2.x - v1.x * v2.z,
                z: v1.x * v2.y - v1.y * v2.x
            };

            if (!length) {
                length = 1 / Math.sqrt(
                    this.frustrum[i].x ** 2 +
                    this.frustrum[i].y ** 2 +
                    this.frustrum[i].z ** 2
                );
            }

            this.frustrum[i].x *= length;
            this.frustrum[i].y *= length;
            this.frustrum[i].z *= length;
        }
    }

    renderLowResChunk(chunk) {
        // Simplified rendering for distant chunks
        const ctx = this.context;
        const chunkCenter = {
            x: chunk.x * 16 + 8,
            z: chunk.z * 16 + 8
        };

        // Calculate distance from camera
        const dx = chunkCenter.x - this.camera.x;
        const dz = chunkCenter.z - this.camera.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Skip if too far or behind
        if (distance > this.chunkRenderDist || this.n2d.x * dx + this.n2d.z * dz < -13) {
            return;
        }

        // Approximate chunk height
        const avgHeight = chunk.renderNodes.reduce((sum, node) => sum + node.y, 0) / 
                         (chunk.renderNodes.length || 1);

        // Project chunk center to screen
        const relPos = {
            x: dx,
            y: avgHeight - this.camera.y,
            z: dz
        };

        const xx = this.player.rotTrig.cosy * relPos.x + this.player.rotTrig.siny * relPos.z;
        const yy = this.player.rotTrig.sinx * this.player.rotTrig.siny * relPos.x +
                  this.player.rotTrig.cosx * relPos.y -
                  this.player.rotTrig.sinx * this.player.rotTrig.cosy * relPos.z;
        const zz = -this.player.rotTrig.siny * this.player.rotTrig.cosx * relPos.x +
                  this.player.rotTrig.sinx * relPos.y +
                  this.player.rotTrig.cosx * this.player.rotTrig.cosy * relPos.z;

        if (zz <= 0) return;

        const scale = this.focalLength / zz;
        const screenX = xx * scale + this.w2;
        const screenY = -yy * scale + this.h2;

        // Draw simplified chunk representation
        ctx.save();
        ctx.globalAlpha = Math.max(0.2, 1 - distance / this.chunkRenderDist);
        ctx.fillStyle = '#666666';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 10 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        this.chunkCount++;
    }

    render() {
        try {
            this.player.update();
            
            this.n3d = {
                x: -this.player.rotTrig.cosx * this.player.rotTrig.siny,
                y: this.player.rotTrig.sinx,
                z: this.player.rotTrig.cosy * this.player.rotTrig.cosx
            };

            this.n2d = {
                x: -this.player.rotTrig.siny,
                z: this.player.rotTrig.cosy
            };

            this.camera = {
                x: this.player.position.x,
                y: this.player.position.y + this.player.height,
                z: this.player.position.z
            };

            this.chunkCount = 0;
            this.nodeCount = 0;
            this.faceCount = 0;
            this.vertexCount = 0;
            this.vertex.clear();
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.getFrustrumPlanes();
            this.renderNodes = [];
            this.lowResChunks = [];

            for (const chunk of Object.values(this.world.chunks)) {
                const rcp = {
                    x: chunk.x * 16 + 8 - this.camera.x,
                    z: chunk.z * 16 + 8 - this.camera.z
                };

                if (this.n2d.x * rcp.x + this.n2d.z * rcp.z < -13) {
                    continue;
                }

                const distance = rcp.x * rcp.x + rcp.z * rcp.z;
                if (distance > this.chunkRenderDist) {
                    this.lowResChunks.push({ chunk, distance });
                    continue;
                }

                this.getChunkNodes(chunk);
            }

            let fogDistance = 50;
            
            this.lowResChunks.sort((a, b) => b.distance - a.distance);
            for (const lowResChunk of this.lowResChunks) {
                this.renderLowResChunk(lowResChunk.chunk);
                fogDistance = this.fogLayer(fogDistance, lowResChunk.distance);
            }

            this.renderNodes.sort((a, b) => b.distance - a.distance);
            for (const renderNode of this.renderNodes) {
                this.renderNode(renderNode.node);
                fogDistance = this.fogLayer(fogDistance, renderNode.distance);
            }

            // Handle mouse interaction
            if (this.mouseClick) {
                if (this.clickedNode && this.mouseClick.button === 0) {
                    const selectedType = document.getElementById("type").value;
                    const newNode = { ...this.clickedNode };

                    switch (this.clickedFace) {
                        case FACE.FRONT: newNode.z++; break;
                        case FACE.BACK: newNode.z--; break;
                        case FACE.RIGHT: newNode.x++; break;
                        case FACE.LEFT: newNode.x--; break;
                        case FACE.TOP: newNode.y++; break;
                        case FACE.BOTTOM: newNode.y--; break;
                    }

                    if (!this.player.nodeCollision(newNode)) {
                        this.world.addNode(newNode.x, newNode.y, newNode.z, selectedType);
                    }
                } else if (this.clickedNode && this.mouseClick.button === 2) {
                    this.world.removeNode(this.clickedNode);
                }
                this.clickedNode = null;
                this.clickedFace = null;
                this.mouseClick = null;
            }

            if (this.mouselock) {
                this.context.drawImage(this.crosshair, this.w2 - 8, this.h2 - 8);
            }

            if (this.hud) {
                this.displayHud();
            }

            if (this.graph) {
                this.displayPerformanceGraph();
            }

            if (this.map) {
                this.displayHeightMap();
            }

            if (Date.now() - this.time >= 1000) {
                this.fps = this.frames;
                this.frames = 0;
                this.time = Date.now();
            }
            this.frames++;

            window.requestAnimationFrame(this.render);
        } catch (error) {
            console.error('Render error:', error);
        }
    }

    fogLayer(fogDistance, currentDistance) {
        if (fogDistance < 80 && currentDistance < this.nodeRenderDist - fogDistance) {
            this.context.globalAlpha = 0.5;
            this.context.fillStyle = "#eeeeee";
            this.context.beginPath();
            this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.context.closePath();
            this.context.fill();
            this.context.globalAlpha = 1;
            return fogDistance + 20;
        }
        return fogDistance;
    }

    getChunkNodes(chunk) {
        for (const node of chunk.renderNodes) {
            const rnp = {
                x: node.x + 0.5 - this.camera.x,
                y: node.y + 0.5 - this.camera.y,
                z: node.z + 0.5 - this.camera.z
            };

            const distance = rnp.x ** 2 + rnp.y ** 2 + rnp.z ** 2;
            if (distance > this.nodeRenderDist || 
                this.n3d.x * rnp.x + this.n3d.y * rnp.y + this.n3d.z * rnp.z < -0.866) {
                continue;
            }

            if (this.frustrum.some(plane => 
                plane.x * rnp.x + plane.y * rnp.y + plane.z * rnp.z > 0.866)) {
                continue;
            }

            this.nodeCount++;
            this.renderNodes.push({ node, distance });
        }
    }

    renderNode(node) {
        this.workingNode = node;
        this.rx = node.x - this.camera.x;
        this.ry = node.y - this.camera.y;
        this.rz = node.z - this.camera.z;
        this.rp = [];

        const faces = [
            { side: FACE.FRONT, vertex: VERTEX.FRONT, check: node.z + 1 < this.camera.z },
            { side: FACE.BACK, vertex: VERTEX.BACK, check: node.z > this.camera.z },
            { side: FACE.RIGHT, vertex: VERTEX.RIGHT, check: node.x + 1 < this.camera.x },
            { side: FACE.LEFT, vertex: VERTEX.LEFT, check: node.x > this.camera.x },
            { side: FACE.TOP, vertex: VERTEX.TOP, check: node.y + 1 < this.camera.y },
            { side: FACE.BOTTOM, vertex: VERTEX.BOTTOM, check: node.y > this.camera.y }
        ];

        for (const { side, vertex, check } of faces) {
            if (node.sides & side && check) {
                this.workingFace = side;
                this.drawRect(vertex);
            }
        }
    }

    drawRect(p) {
        const offset = OFFSET;
        for (let i = 0; i < 4; i++) {
            const index = `${this.workingNode.x + offset[p[i]].x}_${this.workingNode.y + offset[p[i]].y}_${this.workingNode.z + offset[p[i]].z}`;
            
            if (this.vertex.has(index)) {
                this.rp[p[i]] = this.vertex.get(index);
                continue;
            }

            const x = this.rx + offset[p[i]].x;
            const y = this.ry + offset[p[i]].y;
            const z = this.rz + offset[p[i]].z;

            if (x * this.n3d.x + y * this.n3d.y + z * this.n3d.z < 0) {
                this.rp[p[i]] = false;
                this.vertex.set(index, false);
                continue;
            }

            const xx = this.player.rotTrig.cosy * x + this.player.rotTrig.siny * z;
            const yy = this.player.rotTrig.sinx * this.player.rotTrig.siny * x +
                      this.player.rotTrig.cosx * y -
                      this.player.rotTrig.sinx * this.player.rotTrig.cosy * z;
            const zz = -this.player.rotTrig.siny * this.player.rotTrig.cosx * x +
                      this.player.rotTrig.sinx * y +
                      this.player.rotTrig.cosx * this.player.rotTrig.cosy * z;

            const zzScale = this.focalLength / zz;
            this.rp[p[i]] = { x: xx * zzScale, y: -yy * zzScale };
            this.vertex.set(index, this.rp[p[i]]);
            this.vertexCount++;
        }

        if (this.mouseClick) {
            if (
                (this.mouseClick.y - this.rp[p[0]].y) * (this.rp[p[1]].x - this.rp[p[0]].x) -
                (this.mouseClick.x - this.rp[p[0]].x) * (this.rp[p[1]].y - this.rp[p[0]].y) < 0 &&
                (this.mouseClick.y - this.rp[p[2]].y) * (this.rp[p[3]].x - this.rp[p[2]].x) -
                (this.mouseClick.x - this.rp[p[2]].x) * (this.rp[p[3]].y - this.rp[p[2]].y) < 0 &&
                (this.mouseClick.y - this.rp[p[1]].y) * (this.rp[p[2]].x - this.rp[p[1]].x) -
                (this.mouseClick.x - this.rp[p[1]].x) * (this.rp[p[2]].y - this.rp[p[1]].y) < 0 &&
                (this.mouseClick.y - this.rp[p[3]].y) * (this.rp[p[0]].x - this.rp[p[3]].x) -
                (this.mouseClick.x - this.rp[p[3]].x) * (this.rp[p[0]].y - this.rp[p[3]].y) < 0
            ) {
                this.clickedNode = this.workingNode;
                this.clickedFace = this.workingFace;
            }
        }

        if (this.renderMode === 0) {
            this.drawMonochrome(p);
        } else if (this.renderMode === 1) {
            this.drawTextured(p);
        }

        this.faceCount++;
    }

    drawMonochrome(p) {
        const points = [];
        for (const point of [0, 1, 2, 3]) {
            if (this.rp[p[point]]) {
                points.push(this.rp[p[point]]);
            }
        }

        if (points.length > 1) {
            this.context.strokeStyle = "#000000";
            this.context.lineWidth = 1;
            this.context.fillStyle = this.workingNode.type.color;
            this.context.globalAlpha = this.workingNode.type.transparent ? 0.5 : 1;

            this.context.beginPath();
            this.context.moveTo(points[0].x + this.w2, points[0].y + this.h2);
            for (let i = 1; i < points.length; i++) {
                this.context.lineTo(points[i].x + this.w2, points[i].y + this.h2);
            }
            this.context.closePath();
            this.context.fill();
            this.context.stroke();
            this.context.globalAlpha = 1;
        }
    }

    drawTextured(p) {
        const texture = this.workingNode.type.texture(this.workingFace);
        const size = this.textureSize;
        const pts = [
            { x: this.rp[p[0]].x, y: this.rp[p[0]].y, u: size * texture[0], v: size * texture[1] },
            { x: this.rp[p[1]].x, y: this.rp[p[1]].y, u: size * texture[0], v: size * texture[1] + size },
            { x: this.rp[p[2]].x, y: this.rp[p[2]].y, u: size * texture[0] + size, v: size * texture[1] + size },
            { x: this.rp[p[3]].x, y: this.rp[p[3]].y, u: size * texture[0] + size, v: size * texture[1] }
        ];

        const tris = [];
        if (this.rp[p[0]] && this.rp[p[1]] && this.rp[p[2]]) {
            tris.push([0, 1, 2]);
        } else if (this.rp[p[1]] && this.rp[p[2]] && this.rp[p[3]]) {
            tris.push([1, 2, 3]);
        }

        if (this.rp[p[2]] && this.rp[p[3]] && this.rp[p[0]]) {
            tris.push([2, 3, 0]);
        } else if (this.rp[p[0]] && this.rp[p[1]] && this.rp[p[3]]) {
            tris.push([0, 1, 3]);
        }

        for (const [pp0, pp1, pp2] of tris) {
            const x0 = pts[pp0].x + this.w2, x1 = pts[pp1].x + this.w2, x2 = pts[pp2].x + this.w2;
            const y0 = pts[pp0].y + this.h2, y1 = pts[pp1].y + this.h2, y2 = pts[pp2].y + this.h2;
            const u0 = pts[pp0].u, u1 = pts[pp1].u, u2 = pts[pp2].u;
            const v0 = pts[pp0].v, v1 = pts[pp1].v, v2 = pts[pp2].v;

            this.context.save();
            this.context.beginPath();
            this.context.moveTo(x0, y0);
            this.context.lineTo(x1, y1);
            this.context.lineTo(x2, y2);
            this.context.closePath();
            this.context.clip();

            const delta = u0 * v1 + v0 * u2 + u1 * v2 - v1 * u2 - v0 * u1 - u0 * v2;
            const delta_a = x0 * v1 + v0 * x2 + x1 * v2 - v1 * x2 - v0 * x1 - x0 * v2;
            const delta_b = u0 * x1 + x0 * u2 + u1 * x2 - x1 * u2 - x0 * u1 - u0 * x2;
            const delta_c = u0 * v1 * x2 + v0 * x1 * u2 + x0 * u1 * v2 - x0 * v1 * u2 - v0 * u1 * x2 - u0 * x1 * v2;
            const delta_d = y0 * v1 + v0 * y2 + y1 * v2 - v1 * y2 - v0 * y1 - y0 * v2;
            const delta_e = u0 * y1 + y0 * u2 + u1 * y2 - y1 * u2 - y0 * u1 - u0 * y2;
            const delta_f = u0 * v1 * y2 + v0 * y1 * u2 + y0 * u1 * v2 - y0 * v1 * u2 - v0 * u1 * y2 - u0 * y1 * v2;

            this.context.transform(delta_a / delta, delta_d / delta, delta_b / delta, delta_e / delta, delta_c / delta, delta_f / delta);
            this.context.drawImage(this.texture, 0, 0);
            this.context.restore();
        }
    }

    displayHud() {
        this.context.save();
        this.context.textBaseline = "top";
        this.context.textAlign = "left";
        this.context.fillStyle = "#000000";
        this.context.font = "12px sans-serif";
        const metrics = [
            `FPS: ${this.fps}`,
            `Chunks: ${this.chunkCount}`,
            `Nodes: ${this.nodeCount}`,
            `Faces: ${this.faceCount}`,
            `Vertices: ${this.vertexCount}`,
            `X: ${this.player.position.x.toFixed(2)}`,
            `Y: ${this.player.position.y.toFixed(2)}`,
            `Z: ${this.player.position.z.toFixed(2)}`
        ];
        metrics.forEach((text, i) => this.context.fillText(text, 0, i * 12));
        this.context.restore();
    }

    displayPerformanceGraph() {
        if (!this.graph || typeof this.graph !== 'object') {
            this.graph = {
                fps: [],
                width: 300,
                height: 100,
                dataPoints: 20,
                interval: 300 / 20
            };

            this.graph.base = this.prerender(this.graph.width, this.graph.height, ctx => {
                ctx.fillStyle = "#EEEEEE";
                ctx.beginPath();
                ctx.rect(0, 0, this.graph.width, this.graph.height);
                ctx.fill();
                ctx.closePath();

                ctx.strokeStyle = '#CCCCCC';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 0; i < this.graph.dataPoints; i++) {
                    ctx.moveTo(i * this.graph.interval, 0);
                    ctx.lineTo(i * this.graph.interval, this.graph.height);
                }
                ctx.stroke();
                ctx.closePath();
            });
        }

        if (!this.graph.time || Date.now() - this.graph.time >= 1000) {
            this.graph.time = Date.now();
            
            if (this.graph.fps.length > this.graph.dataPoints) {
                this.graph.fps.shift();
            }
            this.graph.fps.push(this.fps);

            this.graph.image = this.prerender(this.graph.width, this.graph.height + 20, ctx => {
                ctx.drawImage(this.graph.base, 0, 0);
                
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 2;
                ctx.fillStyle = "#000000";
                ctx.textBaseline = "bottom";
                ctx.textAlign = "right";
                ctx.font = "10px sans-serif";

                ctx.beginPath();
                ctx.moveTo(0, this.graph.height - this.graph.fps[0] * this.graph.height / 60);
                this.graph.fps.forEach((fps, i) => {
                    if (i === 0) return;
                    const y = this.graph.height - fps * this.graph.height / 60;
                    ctx.fillText(fps, i * this.graph.interval, y);
                    ctx.lineTo(i * this.graph.interval, y);
                });
                ctx.stroke();
                ctx.closePath();

                const avgFps = this.graph.fps.reduce((sum, fps) => sum + fps, 0) / this.graph.fps.length;
                ctx.textBaseline = "top";
                ctx.textAlign = "left";
                ctx.font = "12px sans-serif";
                ctx.fillText(`Avg. FPS: ${Math.floor(avgFps)}`, 0, this.graph.height);
            });
        }

        this.context.drawImage(this.graph.image, this.canvas.width - this.graph.width, 0);
    }

    displayHeightMap() {
        const mapsize = 64;
        const x = Math.floor(this.camera.x / 16);
        const z = Math.floor(this.camera.z / 16);

        if (!this.map || this.map.x !== x || this.map.z !== z || this.world.map.seed !== this.map.seed) {
            this.map = {
                x, z,
                offset: mapsize * 2,
                step: mapsize / 16,
                size: mapsize * 4,
                seed: this.world.map.seed
            };

            this.map.position = new Image();
            this.map.position.src = "media/pos.png";

            this.map.heightmap = this.prerender(64, 64, ctx => {
                const hmap = ctx.createImageData(64, 64);
                for (let mz = 0; mz < 4; mz++) {
                    for (let mx = 0; mx < 4; mx++) {
                        const cx = this.map.x + mx - 2;
                        const cz = this.map.z + mz - 2;
                        for (let z = 0; z < 16; z++) {
                            for (let x = 0; x < 16; x++) {
                                const index = 4 * (16 * mx + x) + 256 * (16 * (3 - mz) + 16 - z);
                                const color = 16 * (this.world.map.getHeight(16 * cx + x, 16 * cz + z) * 16 | 0);
                                hmap.data[index] = color;
                                hmap.data[index + 1] = color;
                                hmap.data[index + 2] = color;
                                hmap.data[index + 3] = 255;
                            }
                        }
                    }
                }
                ctx.putImageData(hmap, 0, 0);
            });
        }

        this.context.save();
        this.context.translate(this.canvas.width - mapsize, this.canvas.height - mapsize);
        this.context.rotate(this.player.rotation.y);
        
        this.context.beginPath();
        this.context.arc(0, 0, mapsize, 0, Math.PI * 2, false);
        this.context.closePath();
        this.context.clip();

        this.context.drawImage(
            this.map.heightmap, 0, 0, 64, 64,
            -this.map.step * (((this.camera.x % 16) + 16) % 16) - this.map.offset,
            this.map.step * (((this.camera.z % 16) + 16) % 16) - this.map.offset,
            this.map.size, this.map.size
        );

        this.context.restore();
        this.context.drawImage(this.map.position, this.canvas.width - mapsize - 8, this.canvas.height - mapsize - 8);
    }
}

window.requestFrame = window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    (callback => window.setTimeout(callback, 10));