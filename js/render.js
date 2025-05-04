/*
 * File:    render.js
 *
 * Enhanced rendering class for high-performance world rendering with WebGL.
 *
 * Author:  Karl Kangur <karl.kangur@gmail.com>
 * Licence: WTFPL 2.0 (http://en.wikipedia.org/wiki/WTFPL)
 * Enhanced by: Ifaz2611
 */

class Renderer {
    constructor(canvas, world, player) {
        this.canvas = canvas;
        this.world = world;
        this.player = player;
        this.camera = null;
        
        // Initialize WebGL
        this.gl = this.initWebGL();
        this.vertexBuffer = new Map();
        this.instanceBuffer = null;
        
        // Canvas sizing
        this.resizeCanvas();
        this.w2 = Math.floor(this.canvas.width / 2);
        this.h2 = Math.floor(this.canvas.height / 2);
        
        this.focalLength = 500;
        this.nodeRenderDist = 150; // Increased for stronger rendering
        this.chunkRenderDist = 500;
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
        this.lighting = { ambient: 0.3, directional: { x: 0.5, y: -1, z: 0.5 } };
        
        this.n3d = {};
        this.n2d = {};
        
        // Texture loading
        this.textures = this.initTextures();
        this.crosshair = new Image();
        this.crosshair.src = "media/crosshair.png";
        
        this.mouseClick = null;
        this.clickedNode = null;
        this.clickedFace = null;
        
        // Initialize shaders and programs
        this.shaderProgram = this.initShaders();
        this.setupBuffers();
        
        // Event listeners
        this.initEventListeners();
        
        this.render = this.render.bind(this);
        this.startRenderLoop();
    }

    initWebGL() {
        const gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        if (!gl) {
            throw new Error('WebGL not supported');
        }
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        return gl;
    }

    initShaders() {
        const vertexShaderSrc = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            attribute vec3 aInstancePos;
            uniform mat4 uModelViewProj;
            uniform vec3 uLightDir;
            varying vec2 vTexCoord;
            varying float vLight;
            void main() {
                vec4 pos = vec4(aPosition + aInstancePos, 1.0);
                gl_Position = uModelViewProj * pos;
                vTexCoord = aTexCoord;
                vLight = max(dot(normalize(uLightDir), normalize(aPosition)), 0.0);
            }
        `;
        
        const fragmentShaderSrc = `
            precision mediump float;
            varying vec2 vTexCoord;
            varying float vLight;
            uniform sampler2D uTexture;
            uniform float uAmbient;
            void main() {
                vec4 texColor = texture2D(uTexture, vTexCoord);
                gl_FragColor = texColor * (vLight + uAmbient);
            }
        `;
        
        const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
        this.gl.shaderSource(vertexShader, vertexShaderSrc);
        this.gl.compileShader(vertexShader);
        
        const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        this.gl.shaderSource(fragmentShader, fragmentShaderSrc);
        this.gl.compileShader(fragmentShader);
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Shader program linking failed');
        }
        
        return program;
    }

    async initTextures() {
        const texture = new Image();
        texture.src = "media/texture.png";
        await new Promise(resolve => texture.onload = resolve);
        
        const glTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, glTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, texture);
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
        
        this.textureSize = texture.width / 16;
        return { main: glTexture };
    }

    setupBuffers() {
        // Cube geometry for nodes
        const vertices = new Float32Array([
            // Front face
            -0.5, -0.5,  0.5,  0.0, 0.0,
             0.5, -0.5,  0.5,  1.0, 0.0,
             0.5,  0.5,  0.5,  1.0, 1.0,
            -0.5,  0.5,  0.5,  0.0, 1.0,
            // ... Add other faces similarly
        ]);
        
        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        
        this.instanceBuffer = this.gl.createBuffer();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth - 200;
        this.canvas.height = window.innerHeight;
        this.w2 = Math.floor(this.canvas.width / 2);
        this.h2 = Math.floor(this.canvas.height / 2);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    initEventListeners() {
        this.canvas.addEventListener('mousedown', (event) => {
            if (this.mouselock) {
                this.mouseClick = { x: 0, y: 0, button: event.button };
            } else {
                this.mouseClick = {
                    x: event.pageX - this.w2,
                    y: event.pageY - this.h2,
                    button: event.button
                };
            }
        });

        window.addEventListener('resize', () => this.resizeCanvas());
        this.canvas.addEventListener('contextmenu', () => false);
        this.canvas.addEventListener('blur', () => this.canvas.focus());
        this.canvas.focus();
    }

    async lockPointer() {
        if (!('pointerLockElement' in document)) {
            console.error("Pointer lock unavailable");
            return;
        }

        document.addEventListener('pointerlockchange', this.mouseLockChangeCallback.bind(this), false);
        await this.canvas.requestPointerLock();
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
        this.chunkRenderDist = parseInt(value) + 350;
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
        this.frustrum = vectors.map((v1, i) => {
            const v2 = vectors[(i + 1) % 4];
            const plane = {
                x: v1.y * v2.z - v1.z * v2.y,
                y: v1.z * v2.x - v1.x * v2.z,
                z: v1.x * v2.y - v1.y * v2.x
            };
            if (!length) {
                length = 1 / Math.sqrt(plane.x ** 2 + plane.y ** 2 + plane.z ** 2);
            }
            return {
                x: plane.x * length,
                y: plane.y * length,
                z: plane.z * length
            };
        });
    }

    renderLowResChunk(chunk, lodLevel) {
        const chunkCenter = { x: chunk.x * 16 + 8, z: chunk.z * 16 + 8 };
        const dx = chunkCenter.x - this.camera.x;
        const dz = chunkCenter.z - this.camera.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance > this.chunkRenderDist || this.n2d.x * dx + this.n2d.z * dz < -13) {
            return;
        }

        // LOD-based simplification
        const detailLevel = Math.min(3, Math.floor(distance / 100));
        const avgHeight = chunk.renderNodes.reduce((sum, node) => sum + node.y, 0) / 
                         (chunk.renderNodes.length || 1);

        // Use instanced rendering for simplified geometry
        const instanceData = new Float32Array([
            chunkCenter.x - this.camera.x,
            avgHeight - this.camera.y,
            chunkCenter.z - this.camera.z
        ]);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, instanceData, this.gl.DYNAMIC_DRAW);

        this.gl.useProgram(this.shaderProgram);
        this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgram, 'uAmbient'), this.lighting.ambient);
        this.gl.uniform3f(this.gl.getUniformLocation(this.shaderProgram, 'uLightDir'), 
            this.lighting.directional.x, 
            this.lighting.directional.y, 
            this.lighting.directional.z
        );

        // Simplified geometry based on LOD
        this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, 6, 1);
        this.chunkCount++;
    }

    async render() {
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

            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
            this.getFrustrumPlanes();
            this.renderNodes = [];
            this.lowResChunks = [];

            // Batch process chunks
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
            
            // Render LOD chunks
            this.lowResChunks.sort((a, b) => b.distance - a.distance);
            for (const lowResChunk of this.lowResChunks) {
                this.renderLowResChunk(lowResChunk.chunk, Math.floor(lowResChunk.distance / 100));
                fogDistance = this.fogLayer(fogDistance, lowResChunk.distance);
            }

            // Render high-detail nodes
            this.renderNodes.sort((a, b) => b.distance - a.distance);
            const instanceData = new Float32Array(this.renderNodes.length * 3);
            this.renderNodes.forEach((node, i) => {
                instanceData[i * 3] = node.node.x - this.camera.x;
                instanceData[i * 3 + 1] = node.node.y - this.camera.y;
                instanceData[i * 3 + 2] = node.node.z - this.camera.z;
            });

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, instanceData, this.gl.DYNAMIC_DRAW);
            this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, 6, this.renderNodes.length);

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
                        case TOP: newNode.y++; break;
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

            // Render HUD elements (using 2D context for simplicity)
            const ctx = this.canvas.getContext('2d');
            if (this.mouselock) {
                ctx.drawImage(this.crosshair, this.w2 - 8, this.h2 - 8);
            }

            if (this.hud) {
                this.displayHud(ctx);
            }

            if (this.graph) {
                this.displayPerformanceGraph(ctx);
            }

            if (this.map) {
                this.displayHeightMap(ctx);
            }

            if (Date.now() - this.time >= 1000) {
                this.fps = this.frames;
                this.frames = 0;
                this.time = Date.now();
            }
            this.frames++;
        } catch (error) {
            console.error('Render error:', error);
        }
    }

    startRenderLoop() {
        const loop = () => {
            this.render();
            window.requestAnimationFrame(loop);
        };
        window.requestAnimationFrame(loop);
    }

    fogLayer(fogDistance, currentDistance) {
        if (fogDistance < 80 && currentDistance < this.nodeRenderDist - fogDistance) {
            const ctx = this.canvas.getContext('2d');
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = "#eeeeee";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.globalAlpha = 1;
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

    displayHud(ctx) {
        ctx.save();
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillStyle = "#000000";
        ctx.font = "12px sans-serif";
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
        metrics.forEach((text, i) => ctx.fillText(text, 0, i * 12));
        ctx.restore();
    }

    displayPerformanceGraph(ctx) {
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
                ctx.rect(0, 0, this.graph.width, this.graph.height);
                ctx.fill();

                ctx.strokeStyle = '#CCCCCC';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 0; i < this.graph.dataPoints; i++) {
                    ctx.moveTo(i * this.graph.interval, 0);
                    ctx.lineTo(i * this.graph.interval, this.graph.height);
                }
                ctx.stroke();
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

                const avgFps = this.graph.fps.reduce((sum, fps) => sum + fps, 0) / this.graph.fps.length;
                ctx.textBaseline = "top";
                ctx.textAlign = "left";
                ctx.font = "12px sans-serif";
                ctx.fillText(`Avg. FPS: ${Math.floor(avgFps)}`, 0, this.graph.height);
            });
        }

        ctx.drawImage(this.graph.image, this.canvas.width - this.graph.width, 0);
    }

    displayHeightMap(ctx) {
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

        ctx.save();
        ctx.translate(this.canvas.width - mapsize, this.canvas.height - mapsize);
        ctx.rotate(this.player.rotation.y);
        
        ctx.beginPath();
        ctx.arc(0, 0, mapsize, 0, Math.PI * 2, false);
        ctx.clip();

        ctx.drawImage(
            this.map.heightmap, 0, 0, 64, 64,
            -this.map.step * (((this.camera.x % 16) + 16) % 16) - this.map.offset,
            this.map.step * (((this.camera.z % 16) + 16) % 16) - this.map.offset,
            this.map.size, this.map.size
        );

        ctx.restore();
        ctx.drawImage(this.map.position, this.canvas.width - mapsize - 8, this.canvas.height - mapsize - 8);
    }

    prerender(width, height, renderFunction) {
        const buffer = document.createElement("canvas");
        buffer.width = width;
        buffer.height = height;
        renderFunction(buffer.getContext('2d'));
        return buffer;
    }
}

window.requestFrame = window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    (callback => window.setTimeout(callback, 10));

export default Renderer;